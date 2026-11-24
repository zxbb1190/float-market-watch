export const goldAccounts = [
  { symbol: 'CMB', name: '招行积存金', detail: '招商银行', sku: null },
  { symbol: 'CCB', name: '建行积存金', detail: '建设银行', sku: null },
  { symbol: 'ICBC', name: '工行积存金', detail: '工商银行', sku: null },
  { symbol: 'JD_CMBC', name: '民生积存金', detail: '京东金融', sku: '21001001000001' },
  { symbol: 'JD_CZB', name: '浙商积存金', detail: '京东金融', sku: '1961543816' },
  { symbol: 'JD_ICBC', name: '工行积存金', detail: '京东金融', sku: '2005453243' },
  { symbol: 'JD_CGB', name: '广发积存金', detail: '京东金融', sku: '2024345112' },
  { symbol: 'JD_CIB', name: '兴业积存金', detail: '京东金融', sku: '2039007297' },
  { symbol: 'JD_CNCB', name: '中信积存金', detail: '京东金融', sku: '2045976593' },
  { symbol: 'JD_SPDB', name: '浦发积存金', detail: '京东金融', sku: '2060033613' }
] as const

export type GoldAccount = (typeof goldAccounts)[number]
export type AccountId = GoldAccount['symbol']
export const goldMarkets = [
  { symbol: 'XAU', name: '伦敦金', detail: 'XAU/USD · 现货', unit: '美元/盎司', sinaCode: 'hf_XAU' },
  { symbol: 'GC', name: '纽约黄金', detail: 'GC · 期货参考', unit: '美元/盎司', sinaCode: 'hf_GC' },
  { symbol: 'AU9999', name: '上金所 Au99.99', detail: '国内现货', unit: '元/克', sinaCode: 'gds_AU9999' }
] as const

export type GoldSymbol = AccountId | (typeof goldMarkets)[number]['symbol']

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
