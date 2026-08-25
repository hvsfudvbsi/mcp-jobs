# mcp-jobs 本地部署版使用说明

基于 [mergedao/mcp-jobs](https://github.com/mergedao/mcp-jobs)（MIT License）的本地部署版，
用于聚合获取常见招聘网站的职位信息。

## 当前可用状态（2026-08 实测）

| 网站 | 状态 | 说明 |
|------|------|------|
| **51job（前程无忧）** | ✅ 可用 | we.51job.com/pc/search，异步渲染 |
| **智联招聘** | ✅ 可用 | www.zhaopin.com/jobs，SSR 渲染（薪资需登录才显示具体数字） |
| BOSS直聘 | ❌ 反爬 | 跳转登录/安全验证页 + API 需 __zp_stoken__ 签名 |
| 猎聘 | ❌ 反爬 | 被反爬清空页面 + API 返回 400 |
| 拉勾 | ❌ 反爬 | 阿里云 WAF 拦截 |

> 后三者需提供登录态 Cookie 或 stealtH浏览器指纹后可尝试启用，
> 在 `src/config/urlConfig.ts` 中取消对应注释。

## 环境要求

- Node.js >= 18（本项目测试于 v18.19.1；原项目要求 >=16）
- 已安装 Playwright Chromium（本仓库已装好）

## 快速开始

```bash
# 1. 安装依赖（如已装可跳过）
npm install
npx playwright install chromium

# 2. 构建
npm run build        # 等价于 npx tsc，产物在 dist/

# 3. 直接运行搜索测试（默认搜"前端开发 北京"）
node dist/index.js

# 4. 以 MCP 服务方式启动（供 Cursor / Claude Desktop / Windsurf 等接入）
node dist/mcp.js     # 或：npx -y mcp-jobs
```

## 以 MCP 服务接入 AI 客户端

在 Cursor / Claude Desktop / Windsurf / Cline 中添加 MCP Server：

- **Name**: `mcp-jobs`
- **Command**: `node /绝对路径/mcp-jobs/dist/mcp.js`
  - 若使用 npx：`npx -y mcp-jobs`（走 npm 在线包，未包含 51job 修复，建议用本地路径）

接入后可直接用自然语言搜索职位：
- "搜索北京的前端开发职位"
- "查找上海的数据分析师岗位"

## 作为代码库使用

```js
const { searchJobList, crawlJobDetail } = require('./dist/index.js');

// 搜索职位列表
const jobs = await searchJobList({ keyword: '前端开发', city: '北京', page: 1 });

// 获取职位详情（需职位详情页 URL）
const detail = await crawlJobDetail('https://jobs.51job.com/all/xxx.html');
```

### 搜索参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `keyword` | string | 搜索关键词（必填） |
| `city` | string | 城市名称 |
| `page` | number | 页码，默认 1 |
| `salary` | string | 薪资范围（如 `10-15万`） |
| `workYear` | string | 工作经验（如 `1-3年`） |

> 51job 规则会忽略 `salary`/`workYear`（51job 搜索 URL 目前只拼 keyword 与 pageNum）。

## 抓取结果

- 每次搜索自动保存原始数据到 `/tmp/data/<站点>_<时间戳>.json`
- 职位字段：`title`（职位名）、`salary`（薪资）、`company`（公司）、
  `address`（地区）、`tags`（标签）、`jobDetail`（详情页链接）

## 故障排查

| 现象 | 处理 |
|------|------|
| 页面能打开但职位为 0 | 网站改版，需更新 `src/config/crawlerConfig.ts` 中对应选择器 |
| Node 版本过低 | Playwright 1.62+ 需 Node 20+，本项目已锁定 `playwright@1.41.2` |
| 被反爬拦截 | 改用真实浏览器 UA、降低请求频率、或提供登录 Cookie |
