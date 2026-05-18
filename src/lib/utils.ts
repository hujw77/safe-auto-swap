export const formatCurrency = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) {
    return 'N/A'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 2 : 4
  }).format(value)
}

export const formatNumber = (value: string | number, maxFractionDigits = 6): string => {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) {
    return '0'
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: maxFractionDigits
  }).format(parsed)
}

export const shortenAddress = (value: string): string =>
  `${value.slice(0, 6)}...${value.slice(-4)}`

export const lowerCaseEqual = (left: string, right: string): boolean =>
  left.toLowerCase() === right.toLowerCase()

export const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
