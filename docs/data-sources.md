# 行情数据接入方案

这个项目把行情读取放在 `QuoteProvider` 接口后面，UI 只调用 `getQuotes()`。当前运行路径使用 `SinaQuoteProvider`，通过 Electron 主进程请求新浪 A 股/场内基金行情接口，再经 preload IPC 返回给 Renderer。

## 推荐接入顺序

1. 新浪 A 股/场内基金行情：用于自用 MVP，字段覆盖最新价、涨跌幅、成交量、成交额、最高、最低、今开、昨收。
2. AKShare 本地服务：后续可以用 Python/FastAPI 封装，补充更多 A 股数据。
3. 基础信息源：Tushare 适合补股票列表、交易日历、历史日线和财务数据，不建议作为盘中盯盘唯一数据源。
4. 正式授权源：如果公开发布或商业化展示行情，需要重新评估交易所、券商和数据商授权。

## Provider 约定

```ts
export interface QuoteProvider {
  getQuotes(symbols: WatchSymbol[]): Promise<Quote[]>
}
```

新增真实源时建议放在：

```text
src/renderer/src/data/providers/
```

如果数据源需要 token、签名或跨域处理，不要直接放在 Renderer。更稳妥的做法是：

```text
Electron Main Process / 本地服务
  -> 数据源 SDK 或 HTTP API
  -> IPC 返回标准 Quote
Renderer
  -> 只消费 QuoteProvider
```

## 当前新浪字段

请求由 Electron 主进程发起，接口地址：

```text
https://hq.sinajs.cn/
```

当前使用字段：

```text
0 名称
1 今开
2 昨收
3 最新价
4 最高
5 最低
8 成交量
9 成交额
30 日期
31 时间
```

## 合规边界

自用盯盘和公开分发行情是两件事。A 股实时行情通常涉及交易所、券商或数据商授权；如果未来把这个工具发给别人用，数据源必须单独做合规确认。
