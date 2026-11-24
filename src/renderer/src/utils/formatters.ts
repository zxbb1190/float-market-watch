const priceFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
  useGrouping: false
})

export function formatPrice(value?: number): string {
  return value === undefined ? '--' : priceFormatter.format(value)
}

export function formatPct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}
