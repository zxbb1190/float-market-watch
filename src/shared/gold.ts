export const goldInstruments = [
  { symbol: 'CMB', name: '招行积存金', detail: '黄金账户', unit: '元/克' },
  { symbol: 'AU9999', name: '上金所 Au99.99', detail: '国内现货', unit: '元/克' },
  { symbol: 'XAU', name: '伦敦金', detail: 'XAU/USD · 现货', unit: '美元/盎司' },
  { symbol: 'GC', name: '纽约黄金', detail: 'GC · 期货参考', unit: '美元/盎司' }
] as const

export type GoldSymbol = (typeof goldInstruments)[number]['symbol']

export interface GoldQuote {
  price: number
  customerBuy?: number
  changePct?: number
  time: string
  quotedAt: number
  closed?: boolean
}

export type GoldQuotes = Partial<Record<GoldSymbol, GoldQuote>>
export const goldRefreshMs = 15_000

export function goldStatus(quote: GoldQuote | undefined, now: number): string {
  if (!quote) return '暂无报价'
  if (quote.closed) return '暂停报价'
  if (now - quote.quotedAt > 5 * 60_000 || quote.quotedAt > now + 60_000) return '非最新报价'
  return ''
}
