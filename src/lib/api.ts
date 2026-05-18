import type { Address, Hex } from 'viem'
import { encodeAbiParameters, encodeFunctionData, getAddress, zeroAddress } from 'viem'
import { universalRouterAbi } from './abi'
import type {
  HelixboxSingleExecutor,
  HelixboxSplitExecutor,
  QuoteExecution,
  QuotePreview,
  QuoteRequest,
  TokenBalance
} from '../types'

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
const HELIXBOX_ROUTER_ADDRESS = getAddress('0xc702faf72e4dff8c7241023321ebaa0c72f7420a')

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

const coerceObject = (value: unknown): Record<string, unknown> | undefined => {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return undefined
}

const coerceArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const pickFirst = <T>(payload: Record<string, unknown>, keys: string[]): T | undefined => {
  for (const key of keys) {
    const value = payload[key]
    if (value !== undefined && value !== null) {
      return value as T
    }
  }

  return undefined
}

const buildQuotePayload = (requests: QuoteRequest[]) => ({
  chain_id: requests[0]?.chainId,
  ids: requests.map((request, index) => request.id ?? String(index)),
  token_ins: requests.map((request) => request.tokenIn),
  token_outs: requests.map((request) => request.tokenOut),
  amounts: requests.map((request) => request.amount.toString()),
  sender: requests[0]?.sender,
  excludes: ['bebop', 'native', 'renegade'],
  has_detail: true,
  split_threshold: 0
})

const parseQuotePreview = (quoteRecord: Record<string, unknown>): QuotePreview | null => {
  const nestedData = coerceObject(quoteRecord.data)
  const payload = nestedData ?? quoteRecord
  const quoteInfo = coerceObject(payload.info)
  const txdata = coerceObject(payload.txdata)
  const minAmountOutData = coerceObject(txdata?.min_amount_out)

  const id = coerceString(payload.id ?? quoteRecord.id)
  const error = coerceString(quoteRecord.error ?? payload.error)
  const amountOut = coerceBigInt(
    pickFirst(payload, ['amount_out', 'amountOut']) ??
      pickFirst(quoteInfo ?? {}, ['amount_out', 'amountOutCalculated', 'amountOut']) ??
      pickFirst(txdata ?? {}, ['amount_out', 'amountOut'])
  )
  const minAmountOut = coerceBigInt(
    pickFirst(payload, ['min_amount_out', 'minAmountOut']) ??
      pickFirst(minAmountOutData ?? {}, ['calculated', 'predicted', 'simulated']) ??
      amountOut
  )

  if (!id) {
    return null
  }

  return {
    id,
    amountOut,
    minAmountOut,
    error
  }
}

const normalizeHex = (value: unknown): Hex => {
  const hex = coerceString(value)
  return (hex && hex.startsWith('0x') ? hex : '0x') as Hex
}

const parseSingleExecutors = (value: unknown): HelixboxSingleExecutor[] =>
  coerceArray(value)
    .map((item) => {
      const executor = coerceObject(item)
      const path = coerceArray(executor?.path)
        .map((node) => {
          const pathNode = coerceObject(node)
          const token = normalizeAddress(coerceString(pathNode?.token))
          if (!token) {
            return null
          }

          return {
            token,
            data: normalizeHex(pathNode?.data)
          }
        })
        .filter((node): node is HelixboxSingleExecutor['path'][number] => node !== null)
      const addr = normalizeAddress(coerceString(executor?.addr))
      const acceptor = normalizeAddress(coerceString(executor?.acceptor))

      if (!addr || !acceptor) {
        return null
      }

      return {
        addr,
        acceptor,
        path
      }
    })
    .filter((executor): executor is HelixboxSingleExecutor => executor !== null)

const parseSplitExecutors = (value: unknown): HelixboxSplitExecutor[] =>
  coerceArray(value)
    .map((item) => {
      const executor = coerceObject(item)
      const addr = normalizeAddress(coerceString(executor?.addr))
      const tokenIn = normalizeAddress(
        coerceString(pickFirst(executor ?? {}, ['tokenIn', 'token_in']))
      )
      const tokenOut = normalizeAddress(
        coerceString(pickFirst(executor ?? {}, ['tokenOut', 'token_out']))
      )

      if (!addr || !tokenIn || !tokenOut) {
        return null
      }

      return {
        addr,
        tokenIn,
        tokenOut,
        weight: coerceBigInt(executor?.weight),
        weightOut: coerceBigInt(pickFirst(executor ?? {}, ['weightOut', 'weight_out'])),
        data: normalizeHex(executor?.data)
      }
    })
    .filter((executor): executor is HelixboxSplitExecutor => executor !== null)

const encodeExtraData = (extData: Hex, amountOut: bigint): Hex =>
  encodeAbiParameters(
    [
      { name: 'x', type: 'bytes' },
      { name: 'y', type: 'uint256' },
      { name: 'z', type: 'uint256' }
    ],
    [extData, amountOut, amountOut]
  )

const buildHelixboxCalldata = (
  request: QuoteRequest,
  quoteRecord: Record<string, unknown>
): { calldata: Hex; executors: Address[]; extDataCount: number } => {
  const nestedData = coerceObject(quoteRecord.data)
  const payload = nestedData ?? quoteRecord
  const txdata = coerceObject(payload.txdata) ?? {}
  const kind = coerceString(payload.kind)?.toLowerCase() ?? 'single'
  const amountOut = coerceBigInt(
    pickFirst(payload, ['amount_out', 'amountOut']) ??
      pickFirst(coerceObject(payload.info) ?? {}, ['amount_out', 'amountOutCalculated', 'amountOut'])
  )
  const minAmountOut = coerceBigInt(
    pickFirst(coerceObject(txdata.min_amount_out) ?? {}, ['calculated', 'predicted']) ?? amountOut
  )
  const expireSimulate = BigInt(Math.floor(Date.now() / 1000) + 6)
  const extData = encodeExtraData(normalizeHex(txdata.ext_data), amountOut)

  if (kind === 'split') {
    const executors = parseSplitExecutors(txdata.executors)
    const calldata = encodeFunctionData({
      abi: universalRouterAbi,
      functionName: 'swapSplitExactInBySolver',
      args: [
        request.amount,
        minAmountOut,
        minAmountOut,
        expireSimulate,
        executors,
        extData
      ]
    })

    return {
      calldata,
      executors: executors.map((executor) => executor.addr),
      extDataCount: executors.length
    }
  }

  const executors = parseSingleExecutors(txdata.executors)
  const calldata = encodeFunctionData({
    abi: universalRouterAbi,
    functionName: 'swapExactInBySolver',
    args: [
      request.tokenIn,
      request.tokenOut,
      request.amount,
      minAmountOut,
      minAmountOut,
      expireSimulate,
      executors,
      extData
    ]
  })

  return {
    calldata,
    executors: executors.map((executor) => executor.addr),
    extDataCount: executors.length
  }
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
  const payload = buildQuotePayload([{ ...request, id: request.id ?? '0' }])
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

  const quote = coerceArray(response.result)[0]
  const quoteRecord = coerceObject(quote)

  if (!quoteRecord) {
    throw new Error('Quote response does not include a batch result item')
  }

  const preview = parseQuotePreview(quoteRecord)
  if (!preview) {
    throw new Error('Quote response could not be parsed')
  }

  if (preview.error) {
    throw new Error(preview.error)
  }

  const executionData = buildHelixboxCalldata(request, quoteRecord)

  return {
    routerAddress: HELIXBOX_ROUTER_ADDRESS,
    calldata: executionData.calldata,
    value: 0n,
    allowanceTarget: HELIXBOX_ROUTER_ADDRESS,
    amountOut: preview.amountOut,
    minAmountOut: preview.minAmountOut,
    executors: executionData.executors,
    extDataCount: executionData.extDataCount
  }
}

export const fetchBatchQuotePreviews = async (
  requests: QuoteRequest[]
): Promise<Record<string, QuotePreview>> => {
  if (requests.length === 0) {
    return {}
  }

  const payload = buildQuotePayload(requests)
  const response = apiBaseUrl
    ? await fetchJson<Record<string, unknown>>(apiUrl('/api/quote'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
    : await fetchJson<Record<string, unknown>>(
        `${sorRouterBaseUrl}/api/chain/${requests[0].chainId}/quotesV2`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      )

  const candidates = Array.isArray(response.result)
    ? response.result
    : Array.isArray(response.data)
      ? response.data
      : []
  const previews: Record<string, QuotePreview> = {}

  for (const candidate of candidates) {
    const preview = parseQuotePreview(coerceObject(candidate) ?? {})
    if (!preview) {
      continue
    }

    previews[preview.id] = preview
  }

  return previews
}
