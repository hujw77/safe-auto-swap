import type { TokenBalance } from '../types'
import { formatCurrency, formatNumber, shortenAddress } from '../lib/utils'

type TokenTableProps = {
  tokens: TokenBalance[]
  selected: Record<string, boolean>
  disabled?: boolean
  onToggle: (address: string) => void
  onToggleAll: (checked: boolean) => void
}

export function TokenTable({
  tokens,
  selected,
  disabled = false,
  onToggle,
  onToggleAll
}: TokenTableProps) {
  const selectableTokens = tokens.filter((token) => !token.isNative)
  const allSelected =
    selectableTokens.length > 0 && selectableTokens.every((token) => selected[token.address])

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h2>Select tokens to swap</h2>
        </div>
        <label className="toggle-all">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={disabled || selectableTokens.length === 0}
            onChange={(event) => onToggleAll(event.target.checked)}
          />
          <span>{allSelected ? 'Clear all' : 'Select all ERC20'}</span>
        </label>
      </div>

      <div className="token-table">
        <div className="token-row token-row--head">
          <span />
          <span>Token</span>
          <span>Balance</span>
          <span>Value</span>
          <span>Status</span>
        </div>

        {tokens.map((token) => (
          <label key={token.address} className="token-row">
            <span>
              <input
                type="checkbox"
                checked={Boolean(selected[token.address])}
                disabled={disabled || token.isNative}
                onChange={() => onToggle(token.address)}
              />
            </span>
            <span className="token-meta">
              <strong>{token.symbol}</strong>
              <small>{shortenAddress(token.address)}</small>
            </span>
            <span>{formatNumber(token.balance)}</span>
            <span>{formatCurrency(token.usdValue)}</span>
            <span className="status-chip">
              {token.isNative ? 'Native unsupported' : token.isRiskToken ? 'Risk flag' : 'Ready'}
            </span>
          </label>
        ))}
      </div>
    </section>
  )
}
