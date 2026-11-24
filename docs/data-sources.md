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

黄金面板使用 `quotes:fetch-gold` IPC，每 15 秒并行查询伦敦金和已选账户，单个请求最多等待 6 秒。来源时间按北京时间展示。暂停、缺失或来源时间超过五分钟的报价均跳过持仓估值和提醒。

| 品种 | 行情来源 | 价格口径 |
| --- | --- | --- |
| 招行黄金账户 | 招行市场中心 `https://mbmodule-openapi.paas.cmbchina.com/product/v1/func/market-center` | 表单 POST，`params=[{"prdType":"H","prdCode":""}]`。取 `FQAMBPRCZ1.zSelPrc` 客户卖出、`zBuyPrc` 客户买入和 `NowTime`。仅在 `MarketDay` 和 `QuotedPrice` 都为真时启用提醒。 |
| 建行黄金积存 | 建行贵金属产品页，在同一公开访问会话依次查询 `100119`、`NGJS01` | 主动积存价 `Cst_Buy_Prc` 和赎回价 `Cst_Sell_Prc`，报价时间 `Tms`。 |
| 工行积存金 | 工行 `mybank.icbc.com.cn/servlet/AsynGetDataServlet`，表单 `tranCode=A00622` | 取 `JC001` 主动积存价 `ActivePrice`、赎回价 `SellPrice`。官网仅提供报价日 `ActiveDate` 与查询时刻 `sysdate`，日期不一致时标记暂停报价。Windows 通过系统 curl 验证 TLS 并读取公开报价。 |
| 京东金融银行积存金 | 京东金融产品接口 `queryGoldProductInfo` 核对品名，行情接口 `cfGetLatestPriceInfo` 按具体 SKU 查询 | 核对返回 SKU，然后取 `buyPrice`、`sellPrice` 和毫秒时间戳 `time`。渠道双边价格与手续费独立，估值不扣手续费。无报价时允许保存持仓。 |
| 伦敦现货金 | 新浪 `hf_XAU` | XAU/USD 现货参考，美元/金衡盎司 |

伦敦金最新价取字段 0，对比价取字段 7，日期和时间取字段 12 和 6。银行账户的持仓按产品和渠道分开，伦敦金用于独立盯盘。[招行黄金账户业务协议](https://s3gw.cmbimg.com/lb50.01-cmbweb-prd/cmbcms/20241121/9af46a53-b8c1-4e36-9aa3-40eeb999311d.pdf) · [建行黄金积存](https://gold.ccb.com/chn/home/gold_new/cpjs/index.shtml) · [京东金融积存金产品页](https://m.jdjygold.com/finance-gold/gold-standard/home/?productSku=1961543816) · [新浪伦敦金](https://finance.sina.com.cn/futures/quotes/XAU.shtml)

## 合规边界

自用盯盘和公开分发行情是两件事。A 股实时行情通常涉及交易所、券商或数据商授权；如果未来把这个工具发给别人用，数据源必须单独做合规确认。
