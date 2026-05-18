export const erc20Abi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }]
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }]
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }]
  }
] as const

export const universalRouterAbi = [
  {
    type: 'function',
    name: 'swapExactInBySolver',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'inputToken', type: 'address' },
      { name: 'outputToken', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOutSimulate', type: 'uint256' },
      { name: 'minAmountOutExecution', type: 'uint256' },
      { name: 'expireSimulate', type: 'uint256' },
      {
        name: 'executors',
        type: 'tuple[]',
        components: [
          { name: 'addr', type: 'address' },
          { name: 'acceptor', type: 'address' },
          {
            name: 'path',
            type: 'tuple[]',
            components: [
              { name: 'token', type: 'address' },
              { name: 'data', type: 'bytes' }
            ]
          }
        ]
      },
      { name: 'extData', type: 'bytes' }
    ],
    outputs: [{ name: 'outAmount', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'swapSplitExactInBySolver',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOutSimulate', type: 'uint256' },
      { name: 'minAmountOutExecution', type: 'uint256' },
      { name: 'expireSimulate', type: 'uint256' },
      {
        name: 'executors',
        type: 'tuple[]',
        components: [
          { name: 'addr', type: 'address' },
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'weight', type: 'uint256' },
          { name: 'weightOut', type: 'uint256' },
          { name: 'data', type: 'bytes' }
        ]
      },
      { name: 'extData', type: 'bytes' }
    ],
    outputs: [{ name: 'outAmount', type: 'uint256' }]
  }
] as const
