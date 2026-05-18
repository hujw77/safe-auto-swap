import type { PublicClient } from 'viem'
import { parseUnits } from 'viem'
import { erc20Abi } from './abi'
import type { TokenBalance } from '../types'

const parseRawBalance = (balance: string, decimals: number): bigint => {
  try {
    return parseUnits(balance, decimals)
  } catch {
    return 0n
  }
}

export const hydrateTokenBalances = async (
  publicClient: PublicClient,
  tokens: TokenBalance[]
): Promise<TokenBalance[]> => {
  const contracts = tokens
    .filter((token) => !token.isNative)
    .flatMap((token) => [
      {
        address: token.address,
        abi: erc20Abi,
        functionName: 'decimals' as const
      },
      {
        address: token.address,
        abi: erc20Abi,
        functionName: 'symbol' as const
      },
      {
        address: token.address,
        abi: erc20Abi,
        functionName: 'name' as const
      }
    ])

  if (contracts.length === 0) {
    return tokens
  }

  const results = await publicClient.multicall({
    contracts,
    allowFailure: true
  })

  let cursor = 0

  return tokens.map((token) => {
    if (token.isNative) {
      return token
    }

    const decimalsResult = results[cursor++]
    const symbolResult = results[cursor++]
    const nameResult = results[cursor++]

    const decimals =
      decimalsResult?.status === 'success' ? Number(decimalsResult.result) : token.decimals
    const symbol =
      symbolResult?.status === 'success' && typeof symbolResult.result === 'string'
        ? symbolResult.result
        : token.symbol
    const name =
      nameResult?.status === 'success' && typeof nameResult.result === 'string'
        ? nameResult.result
        : token.name
    const rawBalance =
      token.rawBalance > 0n ? token.rawBalance : parseRawBalance(token.balance, decimals)
    const usdValue = token.usdPrice === null ? token.usdValue : Number(token.balance) * token.usdPrice

    return {
      ...token,
      decimals,
      symbol,
      name,
      rawBalance,
      usdValue
    }
  })
}
