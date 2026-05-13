import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Quote, WatchSymbol } from '@renderer/data/quote-provider'
import { SinaQuoteProvider } from '@renderer/data/providers/sina-quote-provider'

const STORAGE_KEY = 'float-market-watch.symbols.v1'
const provider = new SinaQuoteProvider()

const defaultSymbols: WatchSymbol[] = [
  { symbol: '000001.SH', name: '上证指数', market: 'CN' },
  { symbol: '399001.SZ', name: '深证成指', market: 'CN' },
  { symbol: '600519.SH', name: '贵州茅台', market: 'CN' },
  { symbol: '300750.SZ', name: '宁德时代', market: 'CN' }
]

export const useWatchlistStore = defineStore('watchlist', () => {
  const symbols = ref<WatchSymbol[]>(loadSymbols())
  const quotes = ref<Quote[]>([])
  const loading = ref(false)
  const error = ref('')
  const lastAlertAt = ref<Record<string, number>>({})

  const leadQuote = computed(() => quotes.value[0])
  const sortedQuotes = computed(() => {
    const map = new Map(quotes.value.map((quote) => [quote.symbol, quote]))
    return symbols.value.map((item) => map.get(item.symbol)).filter(Boolean) as Quote[]
  })

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = ''

    try {
      quotes.value = await provider.getQuotes(symbols.value)
      notifyTriggeredAlerts()
    } catch (err) {
      console.error('[quotes] refresh failed', err)
      error.value = err instanceof Error ? err.message : '行情刷新失败'
    } finally {
      loading.value = false
    }
  }

  function addSymbol(payload: { symbol: string; name: string }): void {
    const symbol = normalizeAStockSymbol(payload.symbol)
    const name = payload.name.trim() || symbol

    if (!symbol || symbols.value.some((item) => item.symbol === symbol)) return

    symbols.value = [...symbols.value, { symbol, name, market: 'CN' }]
    persist()
  }

  function removeSymbol(symbol: string): void {
    symbols.value = symbols.value.filter((item) => item.symbol !== symbol)
    quotes.value = quotes.value.filter((quote) => quote.symbol !== symbol)
    persist()
  }

  function updateAlert(symbol: string, field: 'alertAbove' | 'alertBelow', value: string): void {
    const parsed = Number(value)
    symbols.value = symbols.value.map((item) => {
      if (item.symbol !== symbol) return item
      return {
        ...item,
        [field]: Number.isFinite(parsed) && value !== '' ? parsed : undefined
      }
    })
    persist()
  }

  function clearAlerts(symbol: string): void {
    symbols.value = symbols.value.map((item) => {
      if (item.symbol !== symbol) return item
      return { symbol: item.symbol, name: item.name, market: item.market }
    })
    persist()
  }

  function persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols.value))
  }

  function notifyTriggeredAlerts(): void {
    for (const quote of quotes.value) {
      const config = symbols.value.find((item) => item.symbol === quote.symbol)
      if (!config) continue

      const aboveHit = config.alertAbove !== undefined && quote.price >= config.alertAbove
      const belowHit = config.alertBelow !== undefined && quote.price <= config.alertBelow
      if (!aboveHit && !belowHit) continue

      const now = Date.now()
      const key = `${quote.symbol}:${aboveHit ? 'above' : 'below'}`
      if (now - (lastAlertAt.value[key] ?? 0) < 60_000) continue

      lastAlertAt.value[key] = now
      window.marketFloat?.notifyAlert(
        `${quote.name} 价格提醒`,
        `${quote.symbol} 当前 ${quote.price.toFixed(2)}，触发${aboveHit ? '上穿' : '下破'}提醒`
      )
    }
  }

  return {
    symbols,
    quotes,
    sortedQuotes,
    leadQuote,
    loading,
    error,
    refresh,
    addSymbol,
    removeSymbol,
    updateAlert,
    clearAlerts
  }
})

function loadSymbols(): WatchSymbol[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return defaultSymbols

  try {
    const parsed = JSON.parse(raw) as WatchSymbol[]
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultSymbols

    const cnSymbols = parsed.filter((item) => item?.market === 'CN')
    const nextSymbols = cnSymbols.length > 0 ? cnSymbols : defaultSymbols
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSymbols))
    return nextSymbols
  } catch {
    return defaultSymbols
  }
}

function normalizeAStockSymbol(value: string): string {
  const raw = value
    .trim()
    .toUpperCase()
    .replace(/^SH/, '')
    .replace(/^SZ/, '')
    .replace(/^BJ/, '')
    .replace(/^(.*)\.SS$/, '$1.SH')

  const match = raw.match(/^(\d{6})(?:\.(SH|SZ|BJ))?$/)
  if (!match) return raw

  const code = match[1]
  const suffix = match[2] ?? inferExchange(code)
  return suffix ? `${code}.${suffix}` : raw
}

function inferExchange(code: string): 'SH' | 'SZ' | 'BJ' | null {
  if (code.startsWith('5') || code.startsWith('6')) return 'SH'
  if (code.startsWith('0') || code.startsWith('1') || code.startsWith('2') || code.startsWith('3')) return 'SZ'
  if (code.startsWith('4') || code.startsWith('8')) return 'BJ'
  return null
}
