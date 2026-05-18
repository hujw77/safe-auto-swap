import type { Address } from 'viem'
import { getAddress, zeroAddress } from 'viem'
import type { QuoteExecution, QuoteRequest, TokenBalance } from '../types'

type OkxTokenAsset = {
  tokenAddress?: string
  symbol?: string
  balance?: string
  rawBalance?: string
  tokenPrice?: string
  isRiskToken?: boolean
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const sorRouterBaseUrl = (
  import.meta.env.VITE_SOR_ROUTER_BASE_URL || 'https://sor-router.helixbox.ai'
).replace(/\/$/, '')
const okxBaseUrl = (
  import.meta.env.VITE_OKX_BASE_URL || 'https://web3.okx.com'
).replace(/\/$/, '')
const okxAccessKey = import.meta.env.VITE_OKX_ACCESS_KEY || ''
const okxSecretKey = import.meta.env.VITE_OKX_SECRET_KEY || ''
const okxAccessPassphrase = import.meta.env.VITE_OKX_ACCESS_PASSPHRASE || ''
const okxAccessProject = import.meta.env.VITE_OKX_ACCESS_PROJECT || ''

const shouldUseDirectOkx =
  okxAccessKey.length > 0 &&
  okxSecretKey.length > 0 &&
  okxAccessPassphrase.length > 0 &&
  okxAccessProject.length > 0

const apiUrl = (path: string): string => {
  if (!apiBaseUrl) {
    return path
  }

  return `${apiBaseUrl}${path}`
}

const okxUrl = (path: string): string => `${okxBaseUrl}${path}`

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

const signOkxRequest = async (
  timestamp: string,
  method: string,
  requestPath: string
): Promise<string> => {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(okxSecretKey),
    {
      name: 'HMAC',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}${method.toUpperCase()}${requestPath}`)
  )

  return arrayBufferToBase64(signature)
}

const fetchJson = async <T>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init)

  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `Request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

const normalizeAddress = (value?: string): Address | null => {
  if (!value) {
    return null
  }

  try {
    return getAddress(value)
  } catch {
    return null
  }
}

const coerceBigInt = (value: unknown, fallback = 0n): bigint => {
  if (typeof value === 'bigint') {
    return value
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value))
  }

  if (typeof value === 'string' && value.length > 0) {
    try {
      return BigInt(value)
    } catch {
      return fallback
    }
  }

  return fallback
}

const coerceString = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return undefined
}

const pickFirst = <T>(payload: Record<string, unknown>, keys: string[]): T | undefined => {
  for (const key of keys) {
    const value = payload[key]
    if (value !== undefined && value !== null) {
      return value as T
    }
  }

  return undefined
}

export const fetchTokenBalances = async (
  address: Address,
  chainId: number
): Promise<TokenBalance[]> => {
  const response = shouldUseDirectOkx
    ? await (async () => {
        const requestPath = `/api/v5/wallet/asset/all-token-balances-by-address?address=${encodeURIComponent(
          address
        )}&chains=${encodeURIComponent(String(chainId))}&filter=0`
        const timestamp = new Date().toISOString()
        const signature = await signOkxRequest(timestamp, 'GET', requestPath)

        const directResponse = await fetchJson<{
          code?: string
          msg?: string
          data?: Array<{
            tokenAssets?: Array<
              OkxTokenAsset & {
                name?: string
                decimals?: number
                chainId?: number
              }
            >
          }>
        }>(okxUrl(requestPath), {
          headers: {
            'Content-Type': 'application/json',
            'OK-ACCESS-KEY': okxAccessKey,
            'OK-ACCESS-PASSPHRASE': okxAccessPassphrase,
            'OK-ACCESS-PROJECT': okxAccessProject,
            'OK-ACCESS-SIGN': signature,
            'OK-ACCESS-TIMESTAMP': timestamp
          }
        })

        return {
          tokens:
            directResponse.data?.flatMap((item) =>
              (item.tokenAssets ?? []).map((token) => ({
                ...token,
                chainId
              }))
            ) ?? []
        }
      })()
    : await fetchJson<{
    tokens: Array<
      OkxTokenAsset & {
        name?: string
        decimals?: number
        chainId?: number
      }
    >
  }>(apiUrl(`/api/tokens?address=${address}&chainId=${chainId}`))

  return response.tokens
    .map((token): TokenBalance | null => {
      const tokenAddress = normalizeAddress(token.tokenAddress) ?? zeroAddress
      const decimals = Number(token.decimals ?? 18)
      const rawBalance = coerceBigInt(token.rawBalance)
      const balance = token.balance ?? '0'
      const usdPrice = token.tokenPrice ? Number(token.tokenPrice) : null
      const usdValue = usdPrice === null ? null : Number(balance) * usdPrice

      if (rawBalance <= 0n && Number(balance) <= 0) {
        return null
      }

      return {
        chainId: token.chainId ?? chainId,
        address: tokenAddress,
        symbol: token.symbol ?? 'UNKNOWN',
        name: token.name ?? token.symbol ?? 'Unknown token',
        decimals,
        balance,
        rawBalance,
        usdPrice,
        usdValue,
        isRiskToken: Boolean(token.isRiskToken),
        isNative: tokenAddress === zeroAddress
      }
    })
    .filter((token): token is TokenBalance => token !== null)
    .sort((left, right) => (right.usdValue ?? 0) - (left.usdValue ?? 0))
}

export const fetchQuote = async (request: QuoteRequest): Promise<QuoteExecution> => {
  const payload = {
    chain_id: request.chainId,
    ids: ['1'],
    token_ins: [request.tokenIn],
    token_outs: [request.tokenOut],
    amounts: [request.amount.toString()],
    sender: request.sender,
    excludes: ['bebop', 'native', 'renegade'],
    has_detail: true,
    split_threshold: 0
  }
  const response = apiBaseUrl
    ? await fetchJson<Record<string, unknown>>(apiUrl('/api/quote'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
    : await fetchJson<Record<string, unknown>>(
        `${sorRouterBaseUrl}/api/chain/${request.chainId}/quotesV2`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      )

  const data = Array.isArray(response.data) ? response.data[0] : response.data
  const quote = (typeof data === 'object' && data !== null ? data : response) as Record<string, unknown>
  const txData = (pickFirst<Record<string, unknown>>(quote, [
    'tx_data',
    'txData',
    'transaction',
    'tx'
  ]) ?? {}) as Record<string, unknown>
  const swapData = (pickFirst<Record<string, unknown>>(quote, [
    'swap_data',
    'swapData',
    'detail'
  ]) ?? {}) as Record<string, unknown>

  const routerAddress = normalizeAddress(
    coerceString(
      pickFirst(txData, ['to', 'router', 'contractAddress']) ??
        pickFirst(swapData, ['router', 'routerAddress'])
    )
  )
  const calldata = coerceString(pickFirst(txData, ['data', 'callData', 'txData']))
  const allowanceTarget = normalizeAddress(
    coerceString(
      pickFirst(txData, ['allowance_target', 'allowanceTarget', 'approveTo']) ??
        pickFirst(swapData, ['allowanceTarget', 'allowance_target', 'approveTo'])
    )
  )
  const amountOut = coerceBigInt(
    pickFirst(quote, [
      'amount_out',
      'amountOut',
      'toTokenAmount',
      'outputAmount',
      'quoteAmountOut'
    ]) ?? pickFirst(swapData, ['amountOut', 'minOut'])
  )
  const minAmountOut = coerceBigInt(
    pickFirst(quote, ['min_amount_out', 'minAmountOut']) ??
      pickFirst(swapData, ['minAmountOut', 'minOut']) ??
      amountOut
  )
  const executorsRaw = (pickFirst<unknown[]>(swapData, ['executors']) ?? []).filter(
    (value): value is string => typeof value === 'string'
  )
  const executors = executorsRaw
    .map((value) => normalizeAddress(value))
    .filter((value): value is Address => value !== null)

  if (!routerAddress || !calldata) {
    throw new Error('Quote response does not include executable tx_data')
  }

  return {
    routerAddress,
    calldata: calldata as `0x${string}`,
    value: coerceBigInt(pickFirst(txData, ['value', 'txValue']), 0n),
    allowanceTarget: allowanceTarget ?? routerAddress,
    amountOut,
    minAmountOut,
    executors,
    extDataCount: Array.isArray(swapData.extData) ? swapData.extData.length : 0
  }
}
