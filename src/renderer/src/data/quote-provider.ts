export type Market = 'CN'

export interface Quote {
  symbol: string
  name: string
  market: Market
  price: number
  preClose: number
  change: number
  changePct: number
  open: number
  high: number
  low: number
  volume: number
  amount: number
  updateTime: string
  sparkline: number[]
}

export interface WatchSymbol {
  symbol: string
  name: string
  market: Market
  alertAbove?: number
  alertBelow?: number
}

export interface QuoteProvider {
  getQuotes(symbols: WatchSymbol[]): Promise<Quote[]>
}
