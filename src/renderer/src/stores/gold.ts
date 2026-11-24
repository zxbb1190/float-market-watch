import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { goldAccounts, goldMarkets, goldStatus, type AccountId, type GoldQuotes, type GoldSymbol } from '../../../shared/gold'
import { formatPrice } from '../utils/formatters'

type Limit = 'above' | 'below'
type Alerts = Partial<Record<GoldSymbol, Partial<Record<Limit, number>>>>
const storageKey = 'float-market-watch.gold-alerts.v1'
const costKey = 'float-market-watch.cmb-cost-per-gram.v1'
const accountsKey = 'float-market-watch.gold-accounts.v1'
const positionsKey = 'float-market-watch.gold-positions.v1'
type Position = { cost?: number; grams?: number }
type Positions = Partial<Record<AccountId, Position>>

function parseAmount(value: unknown): number | undefined {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
  if (!/^(?:\d+(?:\.\d{0,4})?|\.\d{1,4})$/.test(text)) return
  const cost = Number(text)
  return cost > 0 && Number.isSafeInteger(Math.round(cost * 10_000)) ? cost : undefined
}

function readSaved(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') } catch { return null }
}

function loadPositions(): Positions {
  const saved = readSaved(positionsKey)
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    return { CMB: { cost: parseAmount(localStorage.getItem(costKey)) } }
  }
  const positions: Positions = {}
  for (const { symbol } of goldAccounts) {
    const entry = (saved as Positions)[symbol]
    if (entry) positions[symbol] = { cost: parseAmount(entry.cost), grams: parseAmount(entry.grams) }
  }
  return positions
}

function loadAccounts(): AccountId[] {
  const saved = readSaved(accountsKey)
  return Array.isArray(saved) ? goldAccounts.map((item) => item.symbol).filter((id) => saved.includes(id)) : ['CMB']
}

function holdingProfit(perGram: number, grams: number): number {
  // Each input has four decimal places. Round the product once to whole fen.
  const units = BigInt(Math.round(Math.abs(perGram) * 10_000)) * BigInt(Math.round(grams * 10_000))
  const fen = (units + 500_000n) / 1_000_000n
  return Math.sign(perGram) * Number(fen) / 100
}

function loadAlerts(): Alerts {
  const alerts: Alerts = {}
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    for (const { symbol } of [...goldAccounts, ...goldMarkets]) {
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
  const selected = ref(loadAccounts())
  const positions = ref(loadPositions())
  let generation = 0
  const triggered = new Set<string>()
  const rows = computed(() => {
    const instruments = [
      ...goldAccounts.filter((account) => selected.value.includes(account.symbol)),
      ...goldMarkets
    ]
    return instruments.map((instrument) => {
      const symbol = instrument.symbol
      const quote = quotes.value[symbol]
      const status = checkedAt.value ? goldStatus(quote, checkedAt.value) : '获取中'
      const accountId = 'sku' in instrument ? instrument.symbol : undefined
      const unit = 'unit' in instrument ? instrument.unit : '元/克'
      const position = accountId ? positions.value[accountId] : undefined
      const perGram = quote && !status && position?.cost !== undefined
        ? Number((quote.price - position.cost).toFixed(4)) : undefined
      const total = perGram !== undefined && position?.grams !== undefined
        ? holdingProfit(perGram, position.grams) : undefined
      const profit = total ?? perGram
      const profitLabel = profit === undefined ? '' : profit === 0 ? '持平'
        : `${profit > 0 ? '浮盈' : '浮亏'} ${formatPrice(Math.abs(profit))} ${total !== undefined ? '元' : '元/克'}`
      return { ...instrument, accountId, unit, quote, status, position, perGram, total, profit, profitLabel }
    })
  })

  function setAccounts(ids: AccountId[]): void {
    const next = goldAccounts.map((item) => item.symbol).filter((id) => ids.includes(id))
    localStorage.setItem(accountsKey, JSON.stringify(next))
    for (const id of selected.value.filter((id) => !next.includes(id))) {
      delete quotes.value[id]
      triggered.delete(`${id}:above`)
      triggered.delete(`${id}:below`)
    }
    selected.value = next
    void refresh(true)
  }

  function savePosition(id: AccountId, costInput: string, gramsInput: string): void {
    const cost = parseAmount(costInput)
    const grams = parseAmount(gramsInput)
    if (costInput.trim() && cost === undefined) throw new RangeError('成本均价须大于 0，最多四位小数。')
    if (gramsInput.trim() && grams === undefined) throw new RangeError('购买克重须大于 0，最多四位小数。')
    const next = { ...positions.value, [id]: { cost, grams } }
    localStorage.setItem(positionsKey, JSON.stringify(next))
    positions.value = next
  }

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
    for (const { symbol, accountId, name, detail, quote, status, unit } of rows.value) {
      if (!quote || status) continue
      for (const limit of ['above', 'below'] as const) {
        const threshold = alerts.value[symbol]?.[limit]
        const key = `${symbol}:${limit}`
        const hit = threshold !== undefined && (limit === 'above' ? quote.price >= threshold : quote.price <= threshold)
        if (!hit) triggered.delete(key)
        else if (!triggered.has(key)) {
          triggered.add(key)
          const side = accountId ? '客户卖出价' : '最新价'
          void window.marketFloat?.notifyAlert(`${name} · ${detail} 到价提醒`,
            `${side} ${formatPrice(quote.price)} ${unit}，已达${limit === 'above' ? '上限' : '下限'} ${threshold}。`)
        }
      }
    }
  }

  async function refresh(selectionChanged = false): Promise<void> {
    if (loading.value && !selectionChanged) return
    const request = ++generation
    loading.value = true
    try {
      const result = await window.marketFloat?.fetchGoldQuotes([...selected.value]) ?? {}
      if (request !== generation) return
      quotes.value = result
    } catch {
      if (request !== generation) return
      quotes.value = {}
    } finally {
      if (request === generation) {
        checkedAt.value = Date.now()
        loading.value = false
      }
    }
    checkAlerts()
  }

  return { rows, alerts, loading, refresh, setAlert, selected, setAccounts, positions, savePosition }
})
