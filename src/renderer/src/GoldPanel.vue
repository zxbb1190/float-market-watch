<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { Bell, Pencil } from 'lucide-vue-next'
import { goldAccounts, type AccountId, type GoldSymbol } from '../../shared/gold'
import { useGoldStore } from './stores/gold'
import { formatPct, formatPrice } from './utils/formatters'

const gold = useGoldStore()
const editing = ref<GoldSymbol>()
const editingPosition = ref<AccountId>()
const choosing = ref(false)
const accountDraft = ref<AccountId[]>([])
const accountError = ref('')
const costDraft = ref('')
const gramsDraft = ref('')
const costError = ref('')
const costInput = ref<HTMLInputElement[]>([])

function toggleChooser(): void {
  accountDraft.value = [...gold.selected]
  accountError.value = ''
  choosing.value = !choosing.value
}

function applyAccounts(): void {
  try {
    gold.setAccounts(accountDraft.value)
    if (editingPosition.value && !accountDraft.value.includes(editingPosition.value)) editingPosition.value = undefined
    choosing.value = false
  } catch { accountError.value = '账户选择保存失败，请重试。' }
}

async function editPosition(id: AccountId): Promise<void> {
  costDraft.value = gold.positions[id]?.cost?.toString() ?? ''
  gramsDraft.value = gold.positions[id]?.grams?.toString() ?? ''
  costError.value = ''
  editingPosition.value = id
  await nextTick()
  costInput.value[0]?.focus()
  costInput.value[0]?.select()
}

function submitPosition(id: AccountId, clear = false): void {
  try {
    gold.savePosition(id, clear ? '' : costDraft.value, clear ? '' : gramsDraft.value)
    editingPosition.value = undefined
  } catch (error) {
    costError.value = error instanceof RangeError ? error.message : '本地保存失败，请重试。'
  }
}

function changeLimit(symbol: GoldSymbol, limit: 'above' | 'below', event: Event): void {
  gold.setAlert(symbol, limit, (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="quote-list gold-list">
    <div class="account-toolbar">
      <span>黄金账户 · 已选 {{ gold.selected.length }}</span>
      <button type="button" :aria-expanded="choosing" @click="toggleChooser">选择账户</button>
    </div>
    <form v-if="choosing" class="account-chooser" @submit.prevent="applyAccounts">
      <label v-for="account in goldAccounts" :key="account.symbol">
        <input v-model="accountDraft" type="checkbox" :value="account.symbol" />
        <span>{{ account.name }}<small>{{ account.detail }}</small></span>
      </label>
      <div class="cost-actions">
        <button type="submit" class="cost-save">应用</button>
        <button type="button" @click="choosing = false">取消</button>
      </div>
      <small v-if="accountError" role="alert">{{ accountError }}</small>
    </form>
    <article v-for="row in gold.rows" :key="row.symbol" class="gold-row" :class="{ 'bank-row': row.accountId }">
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

      <div v-if="row.accountId" class="bank-prices">
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
        <span v-if="row.quote">{{ row.symbol === 'ICBC' ? '官网查询 ' : '' }}{{ row.quote.time }}</span>
        <em v-if="row.status">{{ row.status }}</em>
      </div>
      <template v-if="row.accountId">
        <form v-if="editingPosition === row.accountId" class="cost-editor" @submit.prevent="submitPosition(row.accountId)" @keydown.esc.prevent="editingPosition = undefined">
          <div class="position-fields">
            <label>成本均价（元/克）
              <input ref="costInput" v-model="costDraft" inputmode="decimal" autocomplete="off" @input="costError = ''" />
            </label>
            <label>购买克重（克）
              <input v-model="gramsDraft" inputmode="decimal" autocomplete="off" @input="costError = ''" />
            </label>
          </div>
          <div class="cost-actions">
            <button type="submit" class="cost-save">保存</button>
            <button type="button" @click="editingPosition = undefined">取消</button>
            <button v-if="row.position?.cost || row.position?.grams" type="button" @click="submitPosition(row.accountId, true)">清除持仓</button>
          </div>
          <small v-if="costError" id="cost-error" role="alert">{{ costError }}</small>
        </form>
        <div v-else class="cost-summary">
          <button type="button" @click="editPosition(row.accountId)">
            {{ row.position?.cost || row.position?.grams ? '编辑持仓' : '设置持仓' }}
            <Pencil :size="12" aria-hidden="true" />
          </button>
          <span v-if="row.profit !== undefined" :class="{ 'trend-up': row.profit > 0, 'trend-down': row.profit < 0 }">
            {{ row.total !== undefined && row.total !== 0 ? '总' : '' }}{{ row.profitLabel }}
          </span>
          <div v-if="row.position?.cost || row.position?.grams" class="position-detail">
            <span v-if="row.position?.cost">成本均价 {{ formatPrice(row.position.cost) }} 元/克</span>
            <span v-if="row.position?.grams">持有 {{ row.position.grams }} 克</span>
            <span v-if="row.total !== undefined && row.perGram !== undefined">每克盈亏 {{ formatPrice(row.perGram) }} 元</span>
            <span v-if="row.total !== undefined">按卖出价估算 · 未计手续费</span>
          </div>
        </div>
      </template>
      <div v-if="editing === row.symbol" class="gold-limits">
        <small>{{ row.accountId ? '客户卖出价' : '最新价' }}提醒（{{ row.unit }}）</small>
        <div class="alert-controls">
          <label>上限<input type="number" step="any" min="0" :value="gold.alerts[row.symbol]?.above" @change="changeLimit(row.symbol, 'above', $event)" /></label>
          <label>下限<input type="number" step="any" min="0" :value="gold.alerts[row.symbol]?.below" @change="changeLimit(row.symbol, 'below', $event)" /></label>
        </div>
      </div>
    </article>
  </div>
</template>
