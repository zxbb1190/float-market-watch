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

## 黄金行情

黄金面板使用独立的 `quotes:fetch-gold` IPC，每 15 秒查询两个公开来源，各自超时 6 秒。一个来源失败时，其他已返回的品种仍然显示。时间按北京时间解析。来源时间超过五分钟的报价标记为「非最新报价」，暂停、过旧和缺失报价均不参与到价提醒。

| 品种 | 行情来源 | 价格口径 |
| --- | --- | --- |
| 招行黄金账户 | 招行市场中心 `https://mbmodule-openapi.paas.cmbchina.com/product/v1/func/market-center` | 表单 POST，`params=[{"prdType":"H","prdCode":""}]`。取 `FQAMBPRCZ1.zSelPrc` 客户卖出、`zBuyPrc` 客户买入和 `NowTime`。仅在 `MarketDay` 和 `QuotedPrice` 都为真时启用提醒。 |
| 上金所 Au99.99 | 新浪 `gds_AU9999` | 国内现货，人民币元/克 |
| 伦敦现货金 | 新浪 `hf_XAU` | XAU/USD 现货参考，美元/金衡盎司 |
| 纽约黄金 | 新浪 `hf_GC` | 纽约黄金期货参考（新浪 GC CFD），美元/金衡盎司 |

三个新浪黄金代码共用一次请求，最新价取字段 0，对比价取字段 7，日期和时间取字段 12 和 6。招行买卖报价按银行返回的双边价格分别展示。[招行黄金账户业务协议](https://s3gw.cmbimg.com/lb50.01-cmbweb-prd/cmbcms/20241121/9af46a53-b8c1-4e36-9aa3-40eeb999311d.pdf) · [新浪伦敦金](https://finance.sina.com.cn/futures/quotes/XAU.shtml) · [新浪纽约黄金](https://finance.sina.com.cn/futures/quotes/GC.shtml)

## 合规边界

自用盯盘和公开分发行情是两件事。A 股实时行情通常涉及交易所、券商或数据商授权；如果未来把这个工具发给别人用，数据源必须单独做合规确认。
