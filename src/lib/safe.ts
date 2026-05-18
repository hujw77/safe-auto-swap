import SafeAppsSDK, { type SafeInfo } from '@safe-global/safe-apps-sdk'
import { SafeAppProvider } from '@safe-global/safe-apps-provider'
import type { EIP1193Provider, PublicClient } from 'viem'
import { createPublicClient, custom, getAddress } from 'viem'
import { getChainConfig } from '../config/chains'
import type { SafeContext, SafeTx } from '../types'

const sdk = new SafeAppsSDK()
const SAFE_CONTEXT_TIMEOUT_MS = 1200

let publicClientPromise: Promise<PublicClient> | null = null
let safeContextPromise: Promise<SafeContext> | null = null
let embeddedSafeInfo: SafeInfo | null = null
const localWalletSendEnabled = import.meta.env.VITE_LOCAL_WALLET_SEND === 'true'

const createFallbackContext = (): SafeContext => {
  const safeAddress = import.meta.env.VITE_SAFE_ADDRESS
  const chainId = Number(import.meta.env.VITE_CHAIN_ID ?? 42161)

  if (!safeAddress) {
    throw new Error('Safe context unavailable. Open the app inside Safe or set VITE_SAFE_ADDRESS.')
  }

  return {
    safeAddress: getAddress(safeAddress),
    chainId,
    isEmbedded: false
  }
}

const isRunningInsideIframe = (): boolean =>
  typeof window !== 'undefined' && window.parent !== window

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: number | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`Safe context request timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
    }
  }
}

export const getSafeContext = async (): Promise<SafeContext> => {
  if (!safeContextPromise) {
    safeContextPromise = (!isRunningInsideIframe()
      ? Promise.resolve(createFallbackContext())
      : withTimeout(sdk.safe.getInfo(), SAFE_CONTEXT_TIMEOUT_MS)
          .then((info) => {
            embeddedSafeInfo = info

            return {
              safeAddress: getAddress(info.safeAddress),
              chainId: Number(info.chainId),
              isEmbedded: true
            }
          })
          .catch(() => createFallbackContext()))
  }

  return safeContextPromise
}

export const preloadSafeContext = (): Promise<SafeContext> => getSafeContext()

export const canUseLocalWallet = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.ethereum)

export const isLocalWalletSendEnabled = (): boolean => localWalletSendEnabled

export const getSafePublicClient = async (): Promise<PublicClient> => {
  if (!publicClientPromise) {
    publicClientPromise = getSafeContext().then(async (context) => {
      const chainConfig = getChainConfig(context.chainId)

      if (!chainConfig) {
        throw new Error(`Unsupported chain ${context.chainId}. Add a chain config first.`)
      }

      const provider = context.isEmbedded
        ? embeddedSafeInfo
          ? (new SafeAppProvider(embeddedSafeInfo, sdk) as unknown as EIP1193Provider)
          : undefined
        : window.ethereum

      if (!provider) {
        throw new Error('No EIP-1193 provider available for token allowance checks.')
      }

      return createPublicClient({
        chain: {
          id: chainConfig.chainId,
          name: chainConfig.name,
          nativeCurrency: {
            name: chainConfig.nativeSymbol,
            symbol: chainConfig.nativeSymbol,
            decimals: 18
          },
          rpcUrls: {
            default: {
              http: []
            }
          }
        },
        transport: custom(provider)
      })
    })
  }

  return publicClientPromise
}

export const sendSafeTransactions = async (txs: SafeTx[]) => {
  const context = await getSafeContext()

  if (!context.isEmbedded) {
    if (localWalletSendEnabled && window.ethereum) {
      await window.ethereum.request({
        method: 'eth_requestAccounts'
      })

      const txHashes: string[] = []

      for (const tx of txs) {
        const txRequest = {
          to: tx.to,
          data: tx.data,
          value: tx.value.startsWith('0x') ? tx.value : `0x${BigInt(tx.value).toString(16)}`
        }
        const txHash = (await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [txRequest] as unknown as never
        })) as string

        txHashes.push(txHash)
      }

      return {
        mode: 'local-wallet' as const,
        txHashes
      }
    }

    return {
      mode: 'local-dry-run' as const,
      txs
    }
  }

  const result = await sdk.txs.send({ txs })

  return {
    mode: 'safe' as const,
    safeTxHash: result.safeTxHash
  }
}
