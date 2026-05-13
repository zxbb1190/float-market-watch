import type { Quote, QuoteProvider, WatchSymbol } from '../quote-provider'

type QuoteSnapshot = Omit<Quote, 'sparkline'>

export class SinaQuoteProvider implements QuoteProvider {
  private readonly sparklines = new Map<string, number[]>()

  async getQuotes(symbols: WatchSymbol[]): Promise<Quote[]> {
    const requests = symbols.map((item) => ({
      symbol: item.symbol,
      name: item.name
    }))

    const snapshots = await window.marketFloat?.fetchAStockQuotes(requests)
    if (!snapshots) {
      throw new Error('行情通道未初始化')
    }

    if (snapshots.length === 0 && symbols.length > 0) {
      throw new Error('没有获取到行情，请检查股票或场内基金代码')
    }

    return snapshots.map((snapshot) => ({
      ...snapshot,
      sparkline: this.nextSparkline(snapshot)
    }))
  }

  private nextSparkline(snapshot: QuoteSnapshot): number[] {
    const previous = this.sparklines.get(snapshot.symbol)
    const sparkline = previous
      ? [...previous.slice(-29), snapshot.price]
      : Array.from({ length: 24 }, () => snapshot.price)

    this.sparklines.set(snapshot.symbol, sparkline)
    return sparkline
  }
}
