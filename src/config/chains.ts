import { getAddress } from 'viem'
import type { ChainConfig } from '../types'

const addr = (value: string) => getAddress(value)

export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  1: {
    chainId: 1,
    name: 'Ethereum',
    nativeSymbol: 'ETH',
    defaultTargetSymbol: 'WETH',
    targets: [
      {
        symbol: 'WETH',
        address: addr('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
        decimals: 18
      },
      {
        symbol: 'USDC',
        address: addr('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
        decimals: 6
      }
    ]
  },
  10: {
    chainId: 10,
    name: 'Optimism',
    nativeSymbol: 'ETH',
    defaultTargetSymbol: 'WETH',
    targets: [
      {
        symbol: 'WETH',
        address: addr('0x4200000000000000000000000000000000000006'),
        decimals: 18
      },
      {
        symbol: 'USDC',
        address: addr('0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85'),
        decimals: 6
      }
    ]
  },
  100: {
    chainId: 100,
    name: 'Gnosis',
    nativeSymbol: 'xDAI',
    defaultTargetSymbol: 'USDC',
    targets: [
      {
        symbol: 'USDC',
        address: addr('0xddafbb505ad214d7b80b1f830fccc89b60fb7a83'),
        decimals: 6
      },
      {
        symbol: 'WETH',
        address: addr('0x6A023CCD1ff6F2045C3309768eAd9E68F978f6e1'),
        decimals: 18
      }
    ]
  },
  137: {
    chainId: 137,
    name: 'Polygon',
    nativeSymbol: 'POL',
    defaultTargetSymbol: 'USDC',
    targets: [
      {
        symbol: 'USDC',
        address: addr('0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'),
        decimals: 6
      },
      {
        symbol: 'WETH',
        address: addr('0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'),
        decimals: 18
      }
    ]
  },
  42161: {
    chainId: 42161,
    name: 'Arbitrum',
    nativeSymbol: 'ETH',
    defaultTargetSymbol: 'WETH',
    targets: [
      {
        symbol: 'WETH',
        address: addr('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'),
        decimals: 18
      },
      {
        symbol: 'USDC',
        address: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'),
        decimals: 6
      }
    ]
  },
  8453: {
    chainId: 8453,
    name: 'Base',
    nativeSymbol: 'ETH',
    defaultTargetSymbol: 'USDC',
    targets: [
      {
        symbol: 'USDC',
        address: addr('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
        decimals: 6
      },
      {
        symbol: 'WETH',
        address: addr('0x4200000000000000000000000000000000000006'),
        decimals: 18
      }
    ]
  }
}

export const getChainConfig = (chainId: number): ChainConfig | null =>
  CHAIN_CONFIGS[chainId] ?? null
