import type { Address, Hex } from 'viem'

export type TokenBalance = {
  chainId: number
  address: Address
  symbol: string
  name: string
  decimals: number
  balance: string
  rawBalance: bigint
  usdPrice: number | null
  usdValue: number | null
  isRiskToken: boolean
  isNative: boolean
}

export type TargetTokenConfig = {
  symbol: string
  address: Address
  decimals: number
}

export type ChainConfig = {
  chainId: number
  name: string
  nativeSymbol: string
  routerSpender?: Address
  targets: TargetTokenConfig[]
  defaultTargetSymbol: string
}

export type SafeContext = {
  safeAddress: Address
  chainId: number
  isEmbedded: boolean
}

export type SafeTx = {
  to: Address
  value: string
  data: Hex
}

export type QuoteRequest = {
  id?: string
  chainId: number
  tokenIn: Address
  tokenOut: Address
  amount: bigint
  sender: Address
}

export type QuotePreview = {
  id: string
  amountOut: bigint
  minAmountOut: bigint
  error?: string
}

export type HelixboxPathNode = {
  token: Address
  data: Hex
}

export type HelixboxSingleExecutor = {
  addr: Address
  acceptor: Address
  path: HelixboxPathNode[]
}

export type HelixboxSplitExecutor = {
  addr: Address
  tokenIn: Address
  tokenOut: Address
  weight: bigint
  weightOut: bigint
  data: Hex
}

export type QuoteExecution = {
  routerAddress: Address
  calldata: Hex
  value: bigint
  allowanceTarget?: Address
  amountOut: bigint
  minAmountOut: bigint
  executors: Address[]
  extDataCount: number
}

export type QuoteExecutionResult =
  | {
      id: string
      execution: QuoteExecution
    }
  | {
      id: string
      error: string
    }

export type SwapPlanItem = {
  token: TokenBalance
  targetToken: TargetTokenConfig
  amountIn: bigint
  execution: QuoteExecution
  requiresApproval: boolean
}

export type AppError = {
  title: string
  detail: string
}
