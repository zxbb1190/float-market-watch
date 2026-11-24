import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { goldInstruments, goldStatus, type GoldQuotes, type GoldSymbol } from '../../../shared/gold'
import { formatPrice } from '../utils/formatters'

type Limit = 'above' | 'below'
type Alerts = Partial<Record<GoldSymbol, Partial<Record<Limit, number>>>>
const storageKey = 'float-market-watch.gold-alerts.v1'

function loadAlerts(): Alerts {
  const alerts: Alerts = {}
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    for (const { symbol } of goldInstruments) {
      for (const limit of ['above', 'below'] as const) {
        const value = saved?.[symbol]?.[limit]
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
          alerts[symbol] = { ...alerts[symbol], [limit]: value }
        }
      }
    }
  } catch { /* Start with empty limits if saved settings are unreadable. */ }
  return alerts
}

export const useGoldStore = defineStore('gold', () => {
  const quotes = ref<GoldQuotes>({})
  const loading = ref(false)
  const checkedAt = ref(0)
  const alerts = ref(loadAlerts())
  const triggered = new Set<string>()
  const rows = computed(() => goldInstruments.map((instrument) => {
    const quote = quotes.value[instrument.symbol]
    const status = checkedAt.value ? goldStatus(quote, checkedAt.value) : '获取中'
    return { ...instrument, quote, status }
  }))

  function setAlert(symbol: GoldSymbol, limit: Limit, input: string): void {
    const value = Number(input)
    alerts.value[symbol] = {
      ...alerts.value[symbol],
      [limit]: value > 0 && Number.isFinite(value) ? value : undefined
    }
    triggered.delete(`${symbol}:${limit}`)
    localStorage.setItem(storageKey, JSON.stringify(alerts.value))
  }

  function checkAlerts(): void {
    for (const { symbol, name, quote, status, unit } of rows.value) {
      if (!quote || status) continue
      for (const limit of ['above', 'below'] as const) {
        const threshold = alerts.value[symbol]?.[limit]
        const key = `${symbol}:${limit}`
        const hit = threshold !== undefined && (limit === 'above' ? quote.price >= threshold : quote.price <= threshold)
        if (!hit) triggered.delete(key)
        else if (!triggered.has(key)) {
          triggered.add(key)
          const side = symbol === 'CMB' ? '客户卖出价' : '最新价'
          void window.marketFloat?.notifyAlert(`${name} 到价提醒`,
            `${side} ${formatPrice(quote.price)} ${unit}，已达${limit === 'above' ? '上限' : '下限'} ${threshold}。`)
        }
      }
    }
  }

  async function refresh(): Promise<void> {
    if (loading.value) return
    loading.value = true
    try {
      quotes.value = await window.marketFloat?.fetchGoldQuotes() ?? {}
    } catch {
      quotes.value = {}
    } finally {
      checkedAt.value = Date.now()
      loading.value = false
    }
    checkAlerts()
  }

  return { rows, alerts, loading, refresh, setAlert }
})
