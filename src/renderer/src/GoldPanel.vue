<script setup lang="ts">
import { ref } from 'vue'
import { Bell } from 'lucide-vue-next'
import type { GoldSymbol } from '../../shared/gold'
import { useGoldStore } from './stores/gold'
import { formatPct, formatPrice } from './utils/formatters'

const gold = useGoldStore()
const editing = ref<GoldSymbol>()

function changeLimit(symbol: GoldSymbol, limit: 'above' | 'below', event: Event): void {
  gold.setAlert(symbol, limit, (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="quote-list gold-list">
    <article v-for="row in gold.rows" :key="row.symbol" class="gold-row" :class="{ 'bank-row': row.symbol === 'CMB' }">
      <div class="gold-heading">
        <div>
          <strong>{{ row.name }}</strong>
          <small>{{ row.detail }}</small>
        </div>
        <button class="icon-button gold-alert" type="button"
          :class="{ configured: gold.alerts[row.symbol]?.above || gold.alerts[row.symbol]?.below }"
          :title="row.name + '到价提醒'" :aria-label="row.name + '到价提醒'" :aria-expanded="editing === row.symbol"
          @click="editing = editing === row.symbol ? undefined : row.symbol">
          <Bell :size="14" />
        </button>
      </div>

      <div v-if="row.symbol === 'CMB'" class="bank-prices">
        <div><span>客户卖出 · 元/克</span><b>{{ formatPrice(row.quote?.price) }}</b></div>
        <div><span>客户买入 · 元/克</span><b>{{ formatPrice(row.quote?.customerBuy) }}</b></div>
      </div>
      <div v-else class="gold-price-line">
        <b>{{ formatPrice(row.quote?.price) }}</b>
        <small>{{ row.unit }}</small>
        <span v-if="row.quote?.changePct !== undefined" :class="row.quote.changePct > 0 ? 'trend-up' : row.quote.changePct < 0 ? 'trend-down' : 'trend-flat'">
          {{ formatPct(row.quote.changePct) }}
        </span>
      </div>

      <div class="gold-time">
        <span v-if="row.quote">{{ row.quote.time }}</span>
        <em v-if="row.status">{{ row.status }}</em>
      </div>
      <div v-if="editing === row.symbol" class="gold-limits">
        <small>{{ row.symbol === 'CMB' ? '客户卖出价' : '最新价' }}提醒（{{ row.unit }}）</small>
        <div class="alert-controls">
          <label>上限<input type="number" step="any" min="0" :value="gold.alerts[row.symbol]?.above" @change="changeLimit(row.symbol, 'above', $event)" /></label>
          <label>下限<input type="number" step="any" min="0" :value="gold.alerts[row.symbol]?.below" @change="changeLimit(row.symbol, 'below', $event)" /></label>
        </div>
      </div>
    </article>
  </div>
</template>
