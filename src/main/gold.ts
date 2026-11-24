import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { goldAccounts, type GoldAccount, type GoldQuote, type GoldQuotes } from '../shared/gold'

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
  for (const [, row] of text.matchAll(/hq_str_hf_XAU\s*=\s*"([^"]*)"/g)) {
    const fields = row.split(',')
    const price = positive(fields[0])
    const timestamp = quoteTime(`${fields[12]} ${fields[6]}`)
    if (!price || !timestamp) continue
    const reference = positive(fields[7])
    quotes.XAU = { price, ...timestamp, changePct: reference ? (price / reference - 1) * 100 : undefined }
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
  const quote = bankQuote(data.FQAMBPRCZ1?.zBuyPrc, data.FQAMBPRCZ1?.zSelPrc,
    data.NowTime, data.MarketDay !== true || data.QuotedPrice !== true)
  return quote ? { CMB: quote } : {}
}

async function readSinaGold(): Promise<GoldQuotes> {
  const response = await fetch(`https://hq.sinajs.cn/rn=${Date.now()}&list=hf_XAU`, {
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

function bankQuote(buy: unknown, sell: unknown, time: unknown, closed = false): GoldQuote | undefined {
  const price = positive(sell)
  const customerBuy = positive(buy)
  const timestamp = quoteTime(time)
  if (!price || !customerBuy || price > customerBuy || !timestamp) return
  return { price, customerBuy, ...timestamp, closed }
}

const ccbBase = 'https://gold.ccb.com/tran/WCCMainPlatV5?CCB_IBSVersion=V5&SERVLET_NAME=WCCMainPlatV5&TXCODE='
let ccbCookie = ''

async function readCcbGold(): Promise<GoldQuotes> {
  const signal = AbortSignal.timeout(6000)
  const headers = { 'User-Agent': 'Mozilla/5.0' }
  if (!ccbCookie) {
    const session = await fetch(ccbBase + '100119', { headers, signal })
    await session.arrayBuffer()
    if (!session.ok) return {}
    ccbCookie = session.headers.getSetCookie().map((item) => item.split(';')[0]).join('; ')
  }
  try {
    const response = await fetch(ccbBase + 'NGJS01', { headers: { ...headers, Cookie: ccbCookie }, signal })
    if (!response.ok) throw new Error(`建设银行 HTTP ${response.status}`)
    const data = await response.json()
    if (data?.SUCCESS !== 'true' || data.CcyCd !== '156' || data.PM_Txn_Vrty_Cd !== '33') {
      ccbCookie = ''
      return {}
    }
    return { CCB: bankQuote(data.Cst_Buy_Prc, data.Cst_Sell_Prc, data.Tms?.split('.')[0]) }
  } catch (error) {
    ccbCookie = ''
    throw error
  }
}

// The ICBC site uses a TLS configuration supported by Windows' system HTTP client.
const runFile = promisify(execFile)
async function readIcbcGold(): Promise<GoldQuotes> {
  const curl = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'curl.exe') : 'curl'
  const { stdout } = await runFile(curl, ['--disable', '--fail', '--silent', '--show-error', '--max-time', '5',
    '--data', 'tranCode=A00622', 'https://mybank.icbc.com.cn/servlet/AsynGetDataServlet'],
    { windowsHide: true, timeout: 6000, maxBuffer: 128 * 1024 })
  const data = JSON.parse(stdout)
  const item = data.rf?.find((row: { goldTypeNo?: string }) => row.goldTypeNo === 'JC001')
  if (!item || data.TranErrorCode || typeof data.sysdate !== 'string') return {}
  const currentDay = data.sysdate.slice(0, 10) === item.ActiveDate
  return { ICBC: bankQuote(item.ActivePrice, item.SellPrice, data.sysdate, !currentDay) }
}

const shanghaiTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
})

async function readAccount(account: GoldAccount): Promise<GoldQuotes> {
  if (account.symbol === 'CMB') return readCmbGold()
  if (account.symbol === 'CCB') return readCcbGold()
  if (account.symbol === 'ICBC') return readIcbcGold()
  const response = await fetch('https://api.jdjygold.com/gw2/generic/hj/h5/m/cfGetLatestPriceInfo', {
    method: 'POST', body: new URLSearchParams({ reqData: JSON.stringify({ productSku: account.sku }) }),
    signal: AbortSignal.timeout(6000)
  })
  if (!response.ok) throw new Error(`京东金融 HTTP ${response.status}`)
  const payload = await response.json()
  const item = payload?.resultData?.data
  const epoch = Number(item?.time)
  if (!payload.success || payload.resultData?.code !== '00000000' || item?.productSku !== account.sku ||
    !Number.isFinite(new Date(epoch).getTime()) || epoch <= 0) return {}
  return { [account.symbol]: bankQuote(item.buyPrice, item.sellPrice, shanghaiTime.format(epoch), item.demode !== false) }
}

export async function fetchGoldQuotes(requested: unknown = ['CMB']): Promise<GoldQuotes> {
  const accounts = goldAccounts.filter((account) => Array.isArray(requested) && requested.includes(account.symbol))
  const results = await Promise.allSettled([readSinaGold(), ...accounts.map(readAccount)])
  const quotes: GoldQuotes = {}
  for (const result of results) {
    if (result.status === 'fulfilled') Object.assign(quotes, result.value)
    else console.warn('[gold]', result.reason)
  }
  return quotes
}
