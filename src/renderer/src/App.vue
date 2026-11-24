<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Bell,
  BellOff,
  CirclePlus,
  GripVertical,
  Lock,
  Minimize2,
  MoreVertical,
  RefreshCw,
  Trash2,
  Unlock
} from 'lucide-vue-next'
import { useWatchlistStore } from '@renderer/stores/watchlist'
import { useGoldStore } from '@renderer/stores/gold'
import { formatPct, formatPrice } from '@renderer/utils/formatters'
import { goldRefreshMs } from '../../shared/gold'
import GoldPanel from './GoldPanel.vue'

const store = useWatchlistStore()
const gold = useGoldStore()
const sectionKey = 'float-market-watch.section.v1'
const savedSection = localStorage.getItem(sectionKey)
const section = ref<'gold' | 'stocks'>(savedSection === 'stocks' ||
  (!savedSection && localStorage.getItem('float-market-watch.symbols.v1')) ? 'stocks' : 'gold')
const isGold = computed(() => section.value === 'gold')
const viewMode = ref<'mini' | 'panel'>('mini')
const locked = ref(false)
const newSymbol = ref('')
const newName = ref('')

let refreshTimer: number | undefined
let goldTimer: number | undefined
let carouselTimer: number | undefined
let removeLockListener: (() => void) | undefined
let removeRefreshListener: (() => void) | undefined
let removeViewListener: (() => void) | undefined
const activeIndex = ref(0)

const isPanel = computed(() => viewMode.value === 'panel')
const activeQuote = computed(() => {
  const quotes = store.sortedQuotes
  if (quotes.length === 0) return undefined
  return quotes[activeIndex.value % quotes.length]
})
const activeGold = computed(() => gold.rows[activeIndex.value % gold.rows.length])
const tickerCount = computed(() => isGold.value ? gold.rows.length : store.sortedQuotes.length)
const activeChangeClass = computed(() => trendClass(
  (isGold.value ? activeGold.value.quote?.changePct : activeQuote.value?.changePct) ?? 0
))

function refreshSection(): void {
  void (isGold.value ? gold.refresh() : store.refresh())
}

onMounted(async () => {
  void store.refresh()
  void gold.refresh()
  refreshTimer = window.setInterval(() => store.refresh(), 3000)
  goldTimer = window.setInterval(() => gold.refresh(), goldRefreshMs)
  carouselTimer = window.setInterval(() => {
    if (viewMode.value === 'panel' || tickerCount.value <= 1) return
    activeIndex.value = (activeIndex.value + 1) % tickerCount.value
  }, 3600)
  removeViewListener = window.marketFloat?.onViewModeChanged((mode) => { viewMode.value = mode })
  removeLockListener = window.marketFloat?.onLockChanged((value) => {
    locked.value = value
  })
  removeRefreshListener = window.marketFloat?.onRefreshRequested(refreshSection)
  const state = await window.marketFloat?.getState()
  locked.value = state?.locked ?? false
  viewMode.value = state?.viewMode ?? 'mini'
})

onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer)
  if (goldTimer) window.clearInterval(goldTimer)
  if (carouselTimer) window.clearInterval(carouselTimer)
  removeLockListener?.()
  removeRefreshListener?.()
  removeViewListener?.()
})

watch(
  tickerCount,
  (length) => {
    if (length === 0) {
      activeIndex.value = 0
      return
    }

    activeIndex.value %= length
  }
)

watch(section, (value) => {
  activeIndex.value = 0
  localStorage.setItem(sectionKey, value)
})

async function setViewMode(mode: 'mini' | 'panel'): Promise<void> {
  await window.marketFloat?.setViewMode(mode)
  viewMode.value = mode
}

async function setExpanded(value: boolean): Promise<void> {
  await setViewMode(value ? 'panel' : 'mini')
}

function submitSymbol(): void {
  store.addSymbol({
    symbol: newSymbol.value,
    name: newName.value
  })
  newSymbol.value = ''
  newName.value = ''
}

function showMenu(): void {
  window.marketFloat?.showMenu()
}

function onAlertInput(symbol: string, field: 'alertAbove' | 'alertBelow', event: Event): void {
  store.updateAlert(symbol, field, (event.target as HTMLInputElement).value)
}

function trendClass(changePct: number): string {
  if (changePct > 0) return 'trend-up'
  if (changePct < 0) return 'trend-down'
  return 'trend-flat'
}

</script>

<template>
  <main
    class="float-shell"
    :class="{ expanded: isPanel, locked }"
    @contextmenu.prevent="showMenu"
  >
    <section
      v-if="!isPanel"
      class="ticker-card"
      :class="activeChangeClass"
      role="button"
      tabindex="0"
      @click="setViewMode('panel')"
      @keydown.enter="setViewMode('panel')"
    >
      <div class="drag-zone" :class="{ locked }">
        <GripVertical v-if="!locked" :size="14" aria-hidden="true" />
        <Lock v-else :size="13" aria-hidden="true" />
      </div>

      <div v-if="isGold" :key="activeGold.symbol" class="ticker-summary">
        <div class="ticker-name">
          <strong>{{ activeGold.name }}</strong>
          <span>{{ activeGold.accountId ? (activeGold.detail === '京东金融' ? '京东卖出' : '客户卖出') : activeGold.symbol }} · {{ activeGold.unit }}</span>
        </div>
        <div class="ticker-value">
          <strong>{{ formatPrice(activeGold.quote?.price) }}</strong>
          <span v-if="activeGold.status" class="gold-status">{{ activeGold.status }}</span>
          <span v-else-if="activeGold.profitLabel" class="ticker-profit"
            :class="trendClass(activeGold.profit ?? 0)" :title="activeGold.profitLabel">{{ activeGold.profitLabel }}</span>
          <span v-else-if="activeGold.quote?.changePct !== undefined" :class="activeChangeClass">{{ formatPct(activeGold.quote.changePct) }}</span>
          <span v-else class="gold-clock">{{ activeGold.quote?.time.slice(-8) }}</span>
        </div>
      </div>
      <div v-else-if="activeQuote" :key="activeQuote.symbol" class="ticker-summary">
        <div class="ticker-name">
          <strong>{{ activeQuote.name }}</strong>
          <span>{{ activeQuote.symbol }}</span>
        </div>
        <div class="ticker-value">
          <strong>{{ formatPrice(activeQuote.price) }}</strong>
          <span :class="trendClass(activeQuote.changePct)">{{ formatPct(activeQuote.changePct) }}</span>
        </div>
      </div>

      <div v-else class="ticker-summary">
        <div class="ticker-name">
          <strong>悬浮盯盘</strong>
          <span>{{ store.error || '等待行情' }}</span>
        </div>
        <div class="ticker-value">
          <strong>--</strong>
          <span>--</span>
        </div>
      </div>

    </section>

    <section v-else class="panel">
      <header class="panel-header" :class="{ locked }">
        <div>
          <p class="eyebrow">悬浮盯盘</p>
          <nav class="market-switch" aria-label="行情市场">
            <button type="button" :aria-pressed="!isGold" @click="section = 'stocks'">自选行情</button>
            <button type="button" :aria-pressed="isGold" @click="section = 'gold'">黄金</button>
          </nav>
        </div>
        <div class="header-actions">
          <span v-if="!isGold" class="live-dot" :class="{ loading: store.loading }"></span>
          <button class="icon-button" type="button" title="刷新" @click="refreshSection">
            <RefreshCw :size="16" />
          </button>
          <button class="icon-button" type="button" title="收起" @click="setExpanded(false)">
            <Minimize2 :size="16" />
          </button>
          <button class="icon-button" type="button" title="菜单" @click="showMenu">
            <MoreVertical :size="16" />
          </button>
        </div>
      </header>

      <GoldPanel v-if="isGold" />
      <template v-else>
      <div class="lead-strip" v-if="store.leadQuote">
        <div>
          <span>{{ store.leadQuote.name }}</span>
          <strong>{{ formatPrice(store.leadQuote.price) }}</strong>
        </div>
        <b :class="trendClass(store.leadQuote.changePct)">{{ formatPct(store.leadQuote.changePct) }}</b>
      </div>

      <div class="quote-list">
        <article v-for="quote in store.sortedQuotes" :key="quote.symbol" class="quote-row">
          <div class="quote-main">
            <strong>{{ quote.name }}</strong>
            <span>{{ quote.symbol }} · {{ quote.updateTime }}</span>
          </div>

          <div class="quote-price">
            <strong>{{ formatPrice(quote.price) }}</strong>
            <span :class="trendClass(quote.changePct)">{{ formatPct(quote.changePct) }}</span>
          </div>

          <div class="quote-meta">
            <span>高 {{ formatPrice(quote.high) }}</span>
            <span>低 {{ formatPrice(quote.low) }}</span>
          </div>

          <div class="alert-controls">
            <label title="上穿提醒">
              <Bell :size="13" />
              <input
                type="number"
                placeholder="上穿"
                :value="store.symbols.find((item) => item.symbol === quote.symbol)?.alertAbove ?? ''"
                @input="onAlertInput(quote.symbol, 'alertAbove', $event)"
              />
            </label>
            <label title="下破提醒">
              <BellOff :size="13" />
              <input
                type="number"
                placeholder="下破"
                :value="store.symbols.find((item) => item.symbol === quote.symbol)?.alertBelow ?? ''"
                @input="onAlertInput(quote.symbol, 'alertBelow', $event)"
              />
            </label>
            <button class="icon-button danger" type="button" title="删除" @click="store.removeSymbol(quote.symbol)">
              <Trash2 :size="15" />
            </button>
          </div>
        </article>
      </div>

      <form class="add-form" @submit.prevent="submitSymbol">
        <input v-model="newSymbol" required placeholder="股票/基金代码" />
        <input v-model="newName" placeholder="名称" />
        <button class="add-button" type="submit" title="添加">
          <CirclePlus :size="17" />
        </button>
      </form>
      </template>

      <footer class="panel-footer">
        <span>{{ isGold ? '北京时间 · 15秒刷新' : store.error || '新浪股票/基金行情 · 3秒刷新' }}</span>
        <span class="lock-state">
          <Unlock v-if="!locked" :size="12" />
          <Lock v-else :size="12" />
          {{ locked ? '已锁定' : '可拖动' }}
        </span>
      </footer>
    </section>
  </main>
</template>
