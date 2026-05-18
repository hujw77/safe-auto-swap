import SafeAppsSDK, { type SafeInfo } from '@safe-global/safe-apps-sdk'
import { SafeAppProvider } from '@safe-global/safe-apps-provider'
import type { EIP1193Provider, PublicClient } from 'viem'
import { createPublicClient, custom, getAddress } from 'viem'
import { getChainConfig } from '../config/chains'
import type { SafeContext, SafeTx } from '../types'

const sdk = new SafeAppsSDK()

let publicClientPromise: Promise<PublicClient> | null = null
let safeContextPromise: Promise<SafeContext> | null = null
let embeddedSafeInfo: SafeInfo | null = null

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

export const getSafeContext = async (): Promise<SafeContext> => {
  if (!safeContextPromise) {
    safeContextPromise = sdk.safe
      .getInfo()
      .then((info) => {
        embeddedSafeInfo = info

        return {
          safeAddress: getAddress(info.safeAddress),
          chainId: Number(info.chainId),
          isEmbedded: true
        }
      })
      .catch(() => createFallbackContext())
  }

  return safeContextPromise
}

export const preloadSafeContext = (): Promise<SafeContext> => getSafeContext()

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
    throw new Error('Transaction sending is only available inside Safe Wallet.')
  }

  return sdk.txs.send({ txs })
}
