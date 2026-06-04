const PRICE_DECIMALS = 4

export function formatPrice(value?: number): string {
  return value === undefined ? '--' : value.toFixed(PRICE_DECIMALS)
}
