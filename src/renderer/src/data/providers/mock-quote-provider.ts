import type { Quote, QuoteProvider, WatchSymbol } from '../quote-provider'

interface MockState {
  price: number
  preClose: number
  open: number
  high: number
  low: number
  volume: number
  amount: number
  sparkline: number[]
}

const seedPrices: Record<string, number> = {
  '000001.SH': 3168.23,
  '399001.SZ': 10241.82,
  '600519.SH': 1712.4,
  '300750.SZ': 198.3
}

export class MockQuoteProvider implements QuoteProvider {
  private readonly states = new Map<string, MockState>()

  async getQuotes(symbols: WatchSymbol[]): Promise<Quote[]> {
    return symbols.map((item) => this.nextQuote(item))
  }

  private nextQuote(item: WatchSymbol): Quote {
    const state = this.states.get(item.symbol) ?? this.createState(item.symbol)
    const drift = (Math.random() - 0.48) * Math.max(state.price * 0.0035, 0.02)
    const nextPrice = Math.max(0.01, state.price + drift)

    state.price = round(nextPrice)
    state.high = Math.max(state.high, state.price)
    state.low = Math.min(state.low, state.price)
    state.volume += Math.floor(1000 + Math.random() * 16000)
    state.amount = round(state.volume * state.price)
    state.sparkline = [...state.sparkline.slice(-29), state.price]
    this.states.set(item.symbol, state)

    const change = round(state.price - state.preClose)

    return {
      symbol: item.symbol,
      name: item.name,
      market: item.market,
      price: state.price,
      preClose: state.preClose,
      change,
      changePct: round((change / state.preClose) * 100),
      open: state.open,
      high: state.high,
      low: state.low,
      volume: state.volume,
      amount: state.amount,
      updateTime: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      sparkline: state.sparkline
    }
  }

  private createState(symbol: string): MockState {
    const seed = seedPrices[symbol] ?? fallbackSeed(symbol)
    const preClose = round(seed * (1 + (Math.random() - 0.5) * 0.03))
    const sparkline = Array.from({ length: 24 }, (_, index) =>
      round(seed * (1 + Math.sin(index / 4) * 0.003 + (Math.random() - 0.5) * 0.005))
    )

    return {
      price: round(seed),
      preClose,
      open: round(seed * (1 + (Math.random() - 0.5) * 0.01)),
      high: round(seed * 1.006),
      low: round(seed * 0.994),
      volume: Math.floor(120000 + Math.random() * 600000),
      amount: round(seed * 260000),
      sparkline
    }
  }
}

function fallbackSeed(symbol: string): number {
  const code = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return round(12 + (code % 220) * 1.7)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
