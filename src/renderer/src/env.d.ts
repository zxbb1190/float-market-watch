/// <reference types="vite/client" />

interface QuoteSnapshot {
  symbol: string
  name: string
  market: 'CN'
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
}

interface MarketFloatApi {
  fetchGoldQuotes(accounts: import('../../shared/gold').AccountId[]): Promise<import('../../shared/gold').GoldQuotes>
  setExpanded(expanded: boolean): Promise<void>
  setViewMode(mode: 'mini' | 'panel'): Promise<void>
  getState(): Promise<{ locked: boolean; viewMode: 'mini' | 'panel' }>
  onViewModeChanged(callback: (mode: 'mini' | 'panel') => void): () => void
  showMenu(): Promise<void>
  openExternal(url: string): Promise<void>
  notifyAlert(title: string, body: string): Promise<void>
  fetchAStockQuotes(symbols: Array<{ symbol: string; name?: string }>): Promise<QuoteSnapshot[]>
  onLockChanged(callback: (locked: boolean) => void): () => void
  onRefreshRequested(callback: () => void): () => void
}

interface Window {
  marketFloat?: MarketFloatApi
}
