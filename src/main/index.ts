import { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, shell, screen } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { fetchGoldQuotes } from './gold'

type FloatViewMode = 'mini' | 'panel'

const MINI_SIZE = { width: 218, height: 74 }
const PANEL_SIZE = { width: 360, height: 468 }
const VIEW_SIZES: Record<FloatViewMode, { width: number; height: number }> = {
  mini: MINI_SIZE,
  panel: PANEL_SIZE
}

let floatWindow: BrowserWindow | null = null
let tray: Tray | null = null
let currentViewMode: FloatViewMode = 'mini'
let locked = false

interface AStockQuoteRequest {
  symbol: string
  name?: string
}

function createWindow(): void {
  const { workArea } = screen.getPrimaryDisplay()

  floatWindow = new BrowserWindow({
    width: MINI_SIZE.width,
    height: MINI_SIZE.height,
    x: workArea.x + workArea.width - MINI_SIZE.width - 24,
    y: workArea.y + 180,
    minWidth: MINI_SIZE.width,
    minHeight: MINI_SIZE.height,
    maxWidth: PANEL_SIZE.width,
    maxHeight: PANEL_SIZE.height,
    frame: false,
    resizable: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  floatWindow.setAlwaysOnTop(true, 'screen-saver')
  floatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  floatWindow.once('ready-to-show', () => floatWindow?.show())

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    floatWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    floatWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function setFloatViewMode(mode: FloatViewMode): Electron.Rectangle | undefined {
  if (!floatWindow) return

  currentViewMode = mode
  const target = VIEW_SIZES[mode]
  const bounds = floatWindow.getBounds()
  const nextX = bounds.x + bounds.width - target.width

  floatWindow.setBounds({
    x: nextX,
    y: bounds.y,
    width: target.width,
    height: target.height
  })
  floatWindow.webContents.send('float:view-mode-changed', mode)

  return floatWindow.getBounds()
}

function showFloatWindow(mode: FloatViewMode = currentViewMode): void {
  if (!floatWindow) {
    createWindow()
    return
  }

  floatWindow.show()
  setFloatViewMode(mode)
  floatWindow.focus()
}

function openContextMenu(): void {
  if (!floatWindow) return

  const menu = Menu.buildFromTemplate([
    {
      label: locked ? '解锁位置' : '锁定位置',
      click: () => {
        locked = !locked
        floatWindow?.webContents.send('float:lock-changed', locked)
        tray?.setContextMenu(buildTrayMenu())
      }
    },
    {
      label: '展开窗口',
      click: () => showFloatWindow('panel')
    },
    {
      label: '刷新行情',
      click: () => floatWindow?.webContents.send('quotes:refresh-requested')
    },
    {
      label: '打开开发者工具',
      visible: is.dev,
      click: () => floatWindow?.webContents.openDevTools({ mode: 'detach' })
    },
    {
      label: '重新加载',
      click: () => floatWindow?.reload()
    },
    {
      type: 'separator'
    },
    {
      label: '临时隐藏',
      click: () => floatWindow?.hide()
    },
    {
      label: '退出',
      click: () => app.quit()
    }
  ])

  menu.popup({ window: floatWindow })
}

function createTray(): void {
  if (tray) return

  const icon = createTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('悬浮盯盘')
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', () => {
    if (!floatWindow || !floatWindow.isVisible()) {
      showFloatWindow('mini')
      return
    }

    floatWindow.hide()
  })
}

function createTrayIcon(): Electron.NativeImage {
  const image = nativeImage.createFromPath(join(app.getAppPath(), 'resources/tray-icon.svg'))
  if (!image.isEmpty()) return image

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="3" y="4" width="26" height="24" rx="6" fill="#0b1115"/>
    <path d="M8 22h16" stroke="#65d7c2" stroke-width="2" stroke-linecap="round"/>
    <path d="M8 18l5-6 4 4 7-8" fill="none" stroke="#ff5b6e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="24" cy="8" r="2.4" fill="#65d7c2"/>
  </svg>`

  return nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: '显示悬浮窗',
      click: () => showFloatWindow('mini')
    },
    {
      label: '展开行情面板',
      click: () => showFloatWindow('panel')
    },
    {
      label: '刷新行情',
      click: () => floatWindow?.webContents.send('quotes:refresh-requested')
    },
    {
      label: locked ? '解锁位置' : '锁定位置',
      click: () => {
        locked = !locked
        floatWindow?.webContents.send('float:lock-changed', locked)
        tray?.setContextMenu(buildTrayMenu())
      }
    },
    {
      label: '隐藏悬浮窗',
      click: () => floatWindow?.hide()
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      click: () => app.quit()
    }
  ])
}

function toSinaSymbol(symbol: string): { requestSymbol: string; normalizedSymbol: string } | null {
  const raw = symbol.trim().toUpperCase()
  const normalized = raw
    .replace(/^SH/, '')
    .replace(/^SZ/, '')
    .replace(/^BJ/, '')
    .replace(/^(.*)\.SS$/, '$1.SH')

  const match = normalized.match(/^(\d{6})(?:\.(SH|SZ|BJ))?$/)
  if (!match) return null

  const code = match[1]
  const suffix = match[2] ?? inferExchange(code)
  if (!suffix) return null

  return {
    requestSymbol: `${suffix.toLowerCase()}${code}`,
    normalizedSymbol: `${code}.${suffix}`
  }
}

function inferExchange(code: string): 'SH' | 'SZ' | 'BJ' | null {
  if (code.startsWith('5') || code.startsWith('6')) return 'SH'
  if (code.startsWith('0') || code.startsWith('1') || code.startsWith('2') || code.startsWith('3')) return 'SZ'
  if (code.startsWith('4') || code.startsWith('8')) return 'BJ'
  return null
}

function numberValue(value: string | undefined, fallback = 0): number {
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

async function fetchAStockQuotes(symbols: AStockQuoteRequest[]) {
  const requests = symbols
    .map((item) => ({ ...item, normalized: toSinaSymbol(item.symbol) }))
    .filter((item): item is AStockQuoteRequest & { normalized: NonNullable<ReturnType<typeof toSinaSymbol>> } =>
      Boolean(item.normalized)
    )

  if (requests.length === 0) return []

  const sinaList = requests.map((item) => item.normalized.requestSymbol).join(',')
  const url = `https://hq.sinajs.cn/rn=${Date.now()}&list=${sinaList}`

  const response = await fetch(url, {
    headers: {
      Referer: 'https://finance.sina.com.cn',
      'User-Agent': 'Mozilla/5.0'
    }
  })

  if (!response.ok) {
    throw new Error(`新浪行情请求失败：${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const text = new TextDecoder('gbk').decode(buffer)
  const quotes = parseSinaQuotes(text)
  const parsedSymbols = [...quotes.keys()]

  if (parsedSymbols.length === 0) {
    console.warn('[quotes] Sina returned no parsable quotes', {
      requested: requests.map((item) => item.normalized.requestSymbol),
      status: response.status,
      length: text.length,
      preview: text.slice(0, 240)
    })
  }

  return requests
    .map((item) => {
      const quote = quotes.get(item.normalized.requestSymbol)
      return quote ? { ...quote, symbol: item.normalized.normalizedSymbol } : undefined
    })
    .filter(Boolean)
}

function parseSinaQuotes(text: string) {
  const quotes = new Map<string, Record<string, number | string>>()
  const pattern = /hq_str_([a-z]{2}\d{6})\s*=\s*"([^"]*)"/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    const requestSymbol = match[1].toLowerCase()
    const fields = match[2].split(',')
    if (fields.length < 10 || !fields[0]) continue

    const open = numberValue(fields[1])
    const preClose = numberValue(fields[2])
    const price = numberValue(fields[3], preClose)
    const high = numberValue(fields[4], price)
    const low = numberValue(fields[5], price)
    const volume = numberValue(fields[8])
    const amount = numberValue(fields[9])
    const change = Math.round((price - preClose) * 100) / 100
    const changePct = preClose > 0 ? Math.round((change / preClose) * 10000) / 100 : 0

    quotes.set(requestSymbol, {
      symbol: requestSymbol,
      name: fields[0],
      market: 'CN',
      price,
      preClose,
      change,
      changePct,
      open,
      high,
      low,
      volume,
      amount,
      updateTime: fields[31] || new Date().toLocaleTimeString('zh-CN', { hour12: false })
    })
  }

  return quotes
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.local.float-market-watch')
  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('float:set-expanded', (_event, expanded: boolean) => {
  return setFloatViewMode(expanded ? 'panel' : 'mini')
})

ipcMain.handle('float:set-view-mode', (_event, mode: FloatViewMode) => {
  if (!['mini', 'panel'].includes(mode)) return floatWindow?.getBounds()
  return setFloatViewMode(mode)
})

ipcMain.handle('float:get-state', () => ({ locked, viewMode: currentViewMode }))

ipcMain.handle('quotes:fetch-gold', fetchGoldQuotes)

ipcMain.handle('float:show-menu', () => {
  openContextMenu()
})

ipcMain.handle('float:open-external', (_event, url: string) => {
  if (url.startsWith('https://') || url.startsWith('http://')) {
    shell.openExternal(url)
  }
})

ipcMain.handle('float:notify-alert', (_event, payload: { title: string; body: string }) => {
  if (!Notification.isSupported()) return

  new Notification({
    title: payload.title,
    body: payload.body,
    silent: false
  }).show()
})

ipcMain.handle('quotes:fetch-a-stock', async (_event, symbols: AStockQuoteRequest[]) => {
  try {
    return await fetchAStockQuotes(symbols)
  } catch (err) {
    console.error('[quotes] fetch A stock quotes failed', err)
    throw new Error('行情请求失败，请检查网络或稍后重试')
  }
})
