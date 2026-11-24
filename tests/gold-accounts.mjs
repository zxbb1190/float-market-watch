import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { createServer } from 'vite'

test('holdings migrate and stay separate when the watched accounts change', async (t) => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' })
  t.after(() => vite.close())
  const { useGoldStore } = await vite.ssrLoadModule('/src/renderer/src/stores/gold.ts')
  const memory = new Map([['float-market-watch.cmb-cost-per-gram.v1', '770.1234']])
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) }
  const requests = []
  globalThis.window = { marketFloat: {
    fetchGoldQuotes: ids => new Promise(resolve => requests.push({ ids, resolve }))
  } }
  const reopen = () => { setActivePinia(createPinia()); return useGoldStore() }
  const gold = reopen()
  assert.deepEqual(gold.selected, ['CMB'])
  assert.deepEqual(gold.rows.map(row => row.symbol), ['CMB', 'XAU'])
  assert.equal(gold.positions.CMB.cost, 770.1234)
  gold.setAccounts(['CMB', 'CCB'])
  const old = requests.shift()
  gold.savePosition('CCB', '799.995', '1')
  gold.savePosition('CMB', '770.1234', '2.75')
  assert.throws(() => gold.savePosition('CMB', '801', '-1'), /购买克重/)
  assert.equal(gold.positions.CMB.cost, 770.1234)
  gold.setAccounts(['CCB'])
  const current = requests.shift()
  assert.deepEqual(current.ids, ['CCB'])
  const quote = { price: 801, customerBuy: 805, quotedAt: Date.now() }
  current.resolve({ CCB: quote })
  await new Promise(resolve => setImmediate(resolve))
  old.resolve({ CMB: quote, CCB: { ...quote, price: 100 } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(gold.rows[0].total, 1.01)
  assert.deepEqual(gold.rows.map(row => row.symbol), ['CCB', 'XAU'])
  const refresh = gold.refresh()
  requests.shift().resolve({ CCB: { ...quote, closed: true } })
  await refresh
  assert.equal(gold.rows[0].total, undefined)
  assert.deepEqual(reopen().positions.CMB, { cost: 770.1234, grams: 2.75 })
  gold.setAccounts([])
  requests.shift().resolve({})
  assert.deepEqual(reopen().rows.map(row => row.symbol), ['XAU'])
  gold.savePosition('CMB', '', '')
  assert.equal(reopen().positions.CMB.cost, undefined)
})
