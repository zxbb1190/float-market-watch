import type { GoldQuote, GoldQuotes } from '../shared/gold'

const sinaSymbols = { hf_XAU: 'XAU', hf_GC: 'GC', gds_AU9999: 'AU9999' } as const

function positive(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function quoteTime(value: unknown): Pick<GoldQuote, 'time' | 'quotedAt'> | undefined {
  if (typeof value !== 'string') return
  const time = value.trim().replaceAll('/', '-')
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(time)) return
  const quotedAt = Date.parse(time.replace(' ', 'T') + '+08:00')
  return Number.isFinite(quotedAt) ? { time, quotedAt } : undefined
}

export function parseSinaGold(text: string): GoldQuotes {
  const quotes: GoldQuotes = {}
  for (const [, key, row] of text.matchAll(/hq_str_(hf_XAU|hf_GC|gds_AU9999)\s*=\s*"([^"]*)"/g)) {
    const fields = row.split(',')
    const price = positive(fields[0])
    const timestamp = quoteTime(`${fields[12]} ${fields[6]}`)
    if (!price || !timestamp) continue
    const reference = positive(fields[7])
    const symbol = sinaSymbols[key as keyof typeof sinaSymbols]
    quotes[symbol] = { price, ...timestamp, changePct: reference ? (price / reference - 1) * 100 : undefined }
  }
  return quotes
}

interface CmbResponse {
  success?: boolean
  data?: {
    NowTime?: string
    MarketDay?: boolean
    QuotedPrice?: boolean
    FQAMBPRCZ1?: { zBuyPrc?: string; zSelPrc?: string }
  }
}

export function parseCmbGold(payload: CmbResponse | null): GoldQuotes {
  const data = payload?.data
  if (payload?.success !== true || !data) return {}
  const customerBuy = positive(data.FQAMBPRCZ1?.zBuyPrc)
  const price = positive(data.FQAMBPRCZ1?.zSelPrc)
  const timestamp = quoteTime(data.NowTime)
  if (!timestamp || !price || !customerBuy || price > customerBuy) return {}
  return { CMB: { price, customerBuy, ...timestamp, closed: data.MarketDay !== true || data.QuotedPrice !== true } }
}

async function readSinaGold(): Promise<GoldQuotes> {
  const list = Object.keys(sinaSymbols).join(',')
  const response = await fetch(`https://hq.sinajs.cn/rn=${Date.now()}&list=${list}`, {
    headers: { Referer: 'https://finance.sina.com.cn' },
    signal: AbortSignal.timeout(6000)
  })
  if (!response.ok) throw new Error(`新浪黄金 HTTP ${response.status}`)
  return parseSinaGold(new TextDecoder('gbk').decode(await response.arrayBuffer()))
}

async function readCmbGold(): Promise<GoldQuotes> {
  const response = await fetch('https://mbmodule-openapi.paas.cmbchina.com/product/v1/func/market-center', {
    method: 'POST',
    body: new URLSearchParams({ params: JSON.stringify([{ prdType: 'H', prdCode: '' }]) }),
    signal: AbortSignal.timeout(6000)
  })
  if (!response.ok) throw new Error(`招行黄金 HTTP ${response.status}`)
  return parseCmbGold(await response.json() as CmbResponse)
}

export async function fetchGoldQuotes(): Promise<GoldQuotes> {
  const results = await Promise.allSettled([readCmbGold(), readSinaGold()])
  const quotes: GoldQuotes = {}
  for (const result of results) {
    if (result.status === 'fulfilled') Object.assign(quotes, result.value)
    else console.warn('[gold]', result.reason)
  }
  return quotes
}
