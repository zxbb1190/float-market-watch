import { contextBridge, ipcRenderer } from 'electron'

const api = {
  setExpanded: (expanded: boolean) => ipcRenderer.invoke('float:set-expanded', expanded),
  fetchGoldQuotes: () => ipcRenderer.invoke('quotes:fetch-gold'),
  setViewMode: (mode: 'mini' | 'panel') => ipcRenderer.invoke('float:set-view-mode', mode),
  getState: () => ipcRenderer.invoke('float:get-state') as Promise<{ locked: boolean; viewMode: 'mini' | 'panel' }>,
  onViewModeChanged: (callback: (mode: 'mini' | 'panel') => void) => {
    const listener = (_event: Electron.IpcRendererEvent, mode: 'mini' | 'panel') => callback(mode)
    ipcRenderer.on('float:view-mode-changed', listener)
    return () => ipcRenderer.removeListener('float:view-mode-changed', listener)
  },
  showMenu: () => ipcRenderer.invoke('float:show-menu'),
  openExternal: (url: string) => ipcRenderer.invoke('float:open-external', url),
  notifyAlert: (title: string, body: string) => ipcRenderer.invoke('float:notify-alert', { title, body }),
  fetchAStockQuotes: (symbols: Array<{ symbol: string; name?: string }>) =>
    ipcRenderer.invoke('quotes:fetch-a-stock', symbols),
  onLockChanged: (callback: (locked: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, locked: boolean) => callback(locked)
    ipcRenderer.on('float:lock-changed', listener)
    return () => ipcRenderer.removeListener('float:lock-changed', listener)
  },
  onRefreshRequested: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('quotes:refresh-requested', listener)
    return () => ipcRenderer.removeListener('quotes:refresh-requested', listener)
  }
}

contextBridge.exposeInMainWorld('marketFloat', api)
