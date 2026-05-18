import { useEffect, useMemo, useState } from 'react'
import { encodeFunctionData, formatUnits, parseUnits } from 'viem'
import { getChainConfig } from './config/chains'
import { TokenTable } from './components/TokenTable'
import { erc20Abi } from './lib/abi'
import { fetchQuote, fetchTokenBalances } from './lib/api'
import { getSafeContext, getSafePublicClient, sendSafeTransactions } from './lib/safe'
import { hydrateTokenBalances } from './lib/token-metadata'
import {
  formatCurrency,
  formatNumber,
  lowerCaseEqual,
  shortenAddress,
  toErrorMessage
} from './lib/utils'
import type { AppError, SafeTx, SwapPlanItem, TargetTokenConfig, TokenBalance } from './types'

const buildApprovalTx = (tokenAddress: TokenBalance['address'], spender: TokenBalance['address'], amount: bigint) =>
  ({
    to: tokenAddress,
    value: '0',
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, amount]
    })
  }) satisfies SafeTx

function App() {
  const [safeAddress, setSafeAddress] = useState<string>('')
  const [chainId, setChainId] = useState<number | null>(null)
  const [embedded, setEmbedded] = useState(false)
  const [tokens, setTokens] = useState<TokenBalance[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [targetAddress, setTargetAddress] = useState<string>('')
  const [minOutput, setMinOutput] = useState('0')
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [quoteSummary, setQuoteSummary] = useState<string>('')
  const [appError, setAppError] = useState<AppError | null>(null)

  const chainConfig = useMemo(() => (chainId ? getChainConfig(chainId) : null), [chainId])
  const targetOptions = chainConfig?.targets ?? []

  const loadBalances = async (address: `0x${string}`, nextChainId: number) => {
    const balances = await fetchTokenBalances(address, nextChainId)

    try {
      const publicClient = await getSafePublicClient()
      return await hydrateTokenBalances(publicClient, balances)
    } catch {
      return balances
    }
  }

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      try {
        setLoading(true)
        setAppError(null)
        const context = await getSafeContext()
        if (cancelled) return

        setSafeAddress(context.safeAddress)
        setChainId(context.chainId)
        setEmbedded(context.isEmbedded)

        const config = getChainConfig(context.chainId)
        if (!config) {
          throw new Error(`Chain ${context.chainId} is not configured yet.`)
        }

        const defaultTarget = config.targets.find(
          (token) => token.symbol === config.defaultTargetSymbol
        )

        setTargetAddress(defaultTarget?.address ?? config.targets[0]?.address ?? '')

        const balances = await loadBalances(context.safeAddress, context.chainId)
        if (cancelled) return

        setTokens(balances)
      } catch (error) {
        if (!cancelled) {
          setAppError({
            title: 'Unable to initialize Safe context',
            detail: toErrorMessage(error)
          })
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  const selectedTokens = useMemo(
    () => tokens.filter((token) => selected[token.address]),
    [tokens, selected]
  )

  const selectedTarget = useMemo<TargetTokenConfig | null>(
    () => targetOptions.find((option) => lowerCaseEqual(option.address, targetAddress)) ?? null,
    [targetAddress, targetOptions]
  )

  const portfolioValue = useMemo(
    () => tokens.reduce((sum, token) => sum + (token.usdValue ?? 0), 0),
    [tokens]
  )

  const refreshTokens = async () => {
    if (!safeAddress || !chainId) {
      return
    }

    try {
      setLoading(true)
      setAppError(null)
      const balances = await loadBalances(safeAddress as `0x${string}`, chainId)
      setTokens(balances)
      setQuoteSummary('')
    } catch (error) {
      setAppError({
        title: 'Unable to refresh balances',
        detail: toErrorMessage(error)
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleToken = (address: string) => {
    setSelected((current) => ({
      ...current,
      [address]: !current[address]
    }))
  }

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {}

    for (const token of tokens) {
      if (!token.isNative) {
        next[token.address] = checked
      }
    }

    setSelected(next)
  }

  const prepareSwapPlan = async (): Promise<{ plan: SwapPlanItem[]; txs: SafeTx[]; skipped: string[] }> => {
    if (!safeAddress || !chainId || !selectedTarget) {
      throw new Error('Missing Safe context or target token.')
    }

    const publicClient = await getSafePublicClient()
    const minOutputRaw =
      minOutput.trim().length === 0 ? 0n : parseUnits(minOutput, selectedTarget.decimals)

    const plan: SwapPlanItem[] = []
    const txs: SafeTx[] = []
    const skipped: string[] = []

    for (const token of selectedTokens) {
      if (token.isNative) {
        skipped.push(`${token.symbol}: native token routing is not enabled in this build`)
        continue
      }

      if (lowerCaseEqual(token.address, selectedTarget.address)) {
        skipped.push(`${token.symbol}: already matches the target token`)
        continue
      }

      const quote = await fetchQuote({
        chainId,
        tokenIn: token.address,
        tokenOut: selectedTarget.address,
        amount: token.rawBalance,
        sender: safeAddress as `0x${string}`
      })

      if (quote.amountOut <= minOutputRaw) {
        skipped.push(
          `${token.symbol}: output ${formatUnits(quote.amountOut, selectedTarget.decimals)} ${selectedTarget.symbol} is below threshold`
        )
        continue
      }

      const spender = quote.allowanceTarget ?? quote.routerAddress
      const allowance = await publicClient.readContract({
        abi: erc20Abi,
        address: token.address,
        functionName: 'allowance',
        args: [safeAddress as `0x${string}`, spender]
      })
      const requiresApproval = allowance < token.rawBalance

      if (requiresApproval) {
        txs.push(buildApprovalTx(token.address, spender, token.rawBalance))
      }

      txs.push({
        to: quote.routerAddress,
        value: quote.value.toString(),
        data: quote.calldata
      })

      plan.push({
        token,
        targetToken: selectedTarget,
        amountIn: token.rawBalance,
        execution: quote,
        requiresApproval
      })
    }

    return { plan, txs, skipped }
  }

  const executeSwap = async () => {
    if (!selectedTarget) {
      setAppError({
        title: 'Target token missing',
        detail: 'Choose a target token before executing swaps.'
      })
      return
    }

    try {
      setExecuting(true)
      setAppError(null)
      setQuoteSummary('Preparing quotes and Safe batch...')

      const { plan, txs, skipped } = await prepareSwapPlan()

      if (txs.length === 0) {
        throw new Error(skipped[0] ?? 'No executable swaps were produced.')
      }

      const result = await sendSafeTransactions(txs)
      const estimatedOutput = plan.reduce((sum, item) => sum + item.execution.amountOut, 0n)

      setQuoteSummary(
        [
          `Queued ${txs.length} Safe sub-transactions for ${plan.length} swaps.`,
          `Estimated output: ${formatUnits(estimatedOutput, selectedTarget.decimals)} ${selectedTarget.symbol}.`,
          skipped.length > 0 ? `Skipped ${skipped.length} token(s): ${skipped.join(' | ')}` : '',
          result.safeTxHash ? `Safe tx hash: ${result.safeTxHash}` : ''
        ]
          .filter(Boolean)
          .join(' ')
      )

      await refreshTokens()
    } catch (error) {
      setAppError({
        title: 'Swap batch failed',
        detail: toErrorMessage(error)
      })
    } finally {
      setExecuting(false)
    }
  }

  const previewSwap = async () => {
    if (!selectedTarget) {
      return
    }

    try {
      setExecuting(true)
      setAppError(null)
      const { plan, txs, skipped } = await prepareSwapPlan()

      if (plan.length === 0) {
        setQuoteSummary(skipped.join(' | ') || 'No swaps can be executed with the current selection.')
        return
      }

      const estimatedOutput = plan.reduce((sum, item) => sum + item.execution.amountOut, 0n)
      const approvals = plan.filter((item) => item.requiresApproval).length

      setQuoteSummary(
        [
          `${plan.length} token(s) are ready for swap with ${txs.length} Safe sub-transactions.`,
          `${approvals} token(s) require approval.`,
          `Estimated output: ${formatUnits(estimatedOutput, selectedTarget.decimals)} ${selectedTarget.symbol}.`,
          skipped.length > 0 ? `Skipped: ${skipped.join(' | ')}` : ''
        ]
          .filter(Boolean)
          .join(' ')
      )
    } catch (error) {
      setAppError({
        title: 'Quote preview failed',
        detail: toErrorMessage(error)
      })
    } finally {
      setExecuting(false)
    }
  }

  return (
    <main className="app-shell">
      <section className="hero panel">
        <div className="hero-copy">
          <p className="eyebrow">Safe Auto Swap</p>
          <h1>Batch convert long-tail Safe balances into one target token.</h1>
          <p className="hero-text">
            Pull balances from OKX, preview quote-backed router calls, then submit one Safe batch on
            the currently connected network.
          </p>
        </div>

        <div className="hero-metrics">
          <div>
            <span>Safe</span>
            <strong>{safeAddress ? shortenAddress(safeAddress) : 'Loading...'}</strong>
          </div>
          <div>
            <span>Network</span>
            <strong>{chainConfig?.name ?? 'Unknown'}</strong>
          </div>
          <div>
            <span>Portfolio value</span>
            <strong>{formatCurrency(portfolioValue)}</strong>
          </div>
          <div>
            <span>Mode</span>
            <strong>{embedded ? 'Safe App' : 'Fallback preview'}</strong>
          </div>
        </div>
      </section>

      <section className="controls panel">
        <div className="controls-grid">
          <label>
            <span>Target token</span>
            <select
              value={targetAddress}
              disabled={executing || targetOptions.length === 0}
              onChange={(event) => setTargetAddress(event.target.value)}
            >
              {targetOptions.map((token) => (
                <option key={token.address} value={token.address}>
                  {token.symbol}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Min output threshold</span>
            <input
              type="number"
              min="0"
              step="0.0001"
              value={minOutput}
              disabled={executing}
              onChange={(event) => setMinOutput(event.target.value)}
            />
          </label>
        </div>

        <div className="controls-actions">
          <button className="button button-secondary" disabled={loading || executing} onClick={refreshTokens}>
            Refresh balances
          </button>
          <button
            className="button button-secondary"
            disabled={loading || executing || selectedTokens.length === 0}
            onClick={previewSwap}
          >
            Preview quotes
          </button>
          <button
            className="button"
            disabled={loading || executing || selectedTokens.length === 0 || !embedded}
            onClick={executeSwap}
          >
            {executing ? 'Preparing batch...' : 'Send Safe batch'}
          </button>
        </div>
      </section>

      {appError ? (
        <section className="panel alert">
          <strong>{appError.title}</strong>
          <p>{appError.detail}</p>
        </section>
      ) : null}

      {quoteSummary ? (
        <section className="panel summary">
          <p>{quoteSummary}</p>
        </section>
      ) : null}

      <TokenTable
        tokens={tokens}
        selected={selected}
        disabled={loading || executing}
        onToggle={toggleToken}
        onToggleAll={toggleAll}
      />
    </main>
  )
}

export default App
