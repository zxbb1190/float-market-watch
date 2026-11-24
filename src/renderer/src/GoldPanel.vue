<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { Bell, Pencil } from 'lucide-vue-next'
import type { GoldSymbol } from '../../shared/gold'
import { useGoldStore } from './stores/gold'
import { formatPct, formatPrice } from './utils/formatters'

const gold = useGoldStore()
const editing = ref<GoldSymbol>()
const editingCost = ref(false)
const costDraft = ref('')
const costError = ref('')
const costInput = ref<HTMLInputElement[]>([])

async function editCost(): Promise<void> {
  costDraft.value = gold.costPerGram?.toString() ?? ''
  costError.value = ''
  editingCost.value = true
  await nextTick()
  costInput.value[0]?.focus()
  costInput.value[0]?.select()
}

function submitCost(value: string | null): void {
  try {
    if (gold.saveCost(value)) editingCost.value = false
    else costError.value = '请输入大于 0 的成本均价，最多保留四位小数。'
  } catch {
    costError.value = '本地保存失败，请重试。'
  }
}

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
      <template v-if="row.symbol === 'CMB'">
        <form v-if="editingCost" class="cost-editor" @submit.prevent="submitCost(costDraft)" @keydown.esc.prevent="editingCost = false">
          <label for="cmb-cost">成本均价（元/克）</label>
          <div class="cost-actions">
            <input id="cmb-cost" ref="costInput" v-model="costDraft" inputmode="decimal" autocomplete="off"
              :aria-invalid="Boolean(costError)" :aria-describedby="costError ? 'cost-error' : undefined" @input="costError = ''" />
            <button type="submit" class="cost-save">保存</button>
            <button type="button" @click="editingCost = false">取消</button>
            <button v-if="gold.costPerGram !== undefined" type="button" @click="submitCost(null)">清除</button>
          </div>
          <small v-if="costError" id="cost-error" role="alert">{{ costError }}</small>
        </form>
        <div v-else class="cost-summary">
          <button type="button" @click="editCost">
            {{ gold.costPerGram === undefined ? '设置成本均价' : '成本均价 ' + formatPrice(gold.costPerGram) + ' 元/克' }}
            <Pencil :size="12" aria-hidden="true" />
          </button>
          <span v-if="gold.profitPerGram !== undefined" :class="{ 'trend-up': gold.profitPerGram > 0, 'trend-down': gold.profitPerGram < 0 }">
            {{ gold.profitLabel }}
          </span>
        </div>
      </template>
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
