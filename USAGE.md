# mcp-jobs 本地部署版使用说明

基于 [mergedao/mcp-jobs](https://github.com/mergedao/mcp-jobs)（MIT License）的本地部署版，
用于聚合获取常见招聘网站的职位信息。

## 当前可用状态（2026-08 实测）

| 网站 | 状态 | 说明 |
|------|------|------|
| **51job（前程无忧）** | ✅ 可用 | we.51job.com/pc/search，异步渲染 |
| **智联招聘** | ✅ 可用 | www.zhaopin.com/jobs，SSR 渲染（薪资需登录才显示具体数字） |
| BOSS直聘 | ⚠️ 实验性 | m.zhipin.com 移动端 + stealth，受 IP 限速影响不稳定 |
| **实习僧** | ⚠️ 部分可用 | shixiseng.com 可抓公司/城市/标签，但标题与薪资字体混淆（Nuxt SSR） |
| 猎聘 | ❌ 反爬 | 被反爬清空页面 + API 返回 400 |
| 拉勾 | ❌ 反爬 | 阿里云 WAF 拦截 |
| 牛客网 | ❌ 反爬 | 阿里云 WAF 拦截（square-search API 返回验证码） |
| 应届生求职网 | ❌ 反爬 | 滑块验证码拦截（51job 系） |
| Levels.fyi | ✅ 可抓取 | 技术薪资数据站（非职位列表），SSR 渲染无验证墙，薪资表可按级别提取；未纳入搜索聚合 |

> 无法直连的站点需提供登录态 Cookie 或真实浏览器指纹后可尝试启用，
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

# 5.（可选）以 HTTP 模式启动，内置 Web 搜索界面
node dist/mcp.js --http
```

启动后会打印所有可访问地址：本机用 `http://localhost:3000/`；
从其他设备访问请用打印出的**局域网地址**（如 `http://192.168.x.x:3000/`）。

> 服务默认监听 `0.0.0.0`，可用环境变量调整：`MCP_HOST` / `MCP_PORT`。
> 若部署在云服务器上需要公网 IP 访问，需在安全组/防火墙放行对应端口；
> 或在本地机器建 SSH 隧道：`ssh -L 3000:localhost:3000 <用户>@<服务器地址>`。

## Web 搜索界面（HTTP 模式）

```bash
node dist/mcp.js --http
# 或
npx -y mcp-jobs --http
```

访问 http://localhost:3000/ 可获得开箱即用的搜索页面：

- 职位搜索表单（关键词/城市/薪资/经验/页码），实时爬取多个招聘网站
- 结果表格支持**按来源站点筛选**、分页浏览
- 搜索完成后展示**岗位要求总结**：技能要求 Top、薪资分布/区间/中位数、不同岗位（要求/技能/薪资）分组、热门公司
- **导出 CSV / JSON / MD**（CSV 带 BOM 头，Excel 打开中文不乱码；MD 含完整总结文档与职位明细）
- 搜索期间显示进度条与已用时间

内置接口：

| 路径 | 说明 |
|------|------|
| `/` | Web 搜索界面 |
| `/api/search?keyword=前端&city=北京&page=1` | 搜索 API |
| `/mcp` | MCP 端点（StreamableHTTP） |
| `/health` | 健康检查 |

## 以 MCP 服务接入 AI 客户端

在 Cursor / Claude Desktop / Windsurf / Cline 中添加 MCP Server：

- **Name**: `mcp-jobs`
- **Command**: `node /绝对路径/mcp-jobs/dist/mcp.js`
  - 若使用 npx：`npx -y mcp-jobs`（走 npm 在线包，未包含 51job 修复，建议用本地路径）

接入后可直接用自然语言搜索职位：
- "搜索北京的前端开发职位"
- "查找上海的数据分析师岗位"

`mcp_search_job` 返回结构：

```jsonc
{
  "jobs": [ /* 职位列表：title/salary/company/address/tags/jobDetail/source */ ],
  "summary": {
    "total": 40,
    "sources": { "51job": 25, "zhaopin-jobs": 15 },
    "topSkills": [["Vue", 18], ["本科", 12]],
    "salaryMin": 1.9, "salaryMax": 34, "salaryMedian": 21,   // 万/年
    "bands": { "<10万": 2, "10-20万": 8, "20-30万": 20, "30-50万": 10, "50万+": 0 },
    "groupList": [  // 不同岗位（要求/技能/薪资），按归一化后的岗位方向聚合
      { "title": "前端", "count": 35, "salary": "1.9万 ~ 34万", "salaryMedian": "21万", "skills": "Vue、javascript、css" }
    ],
    "topCompanies": [["某公司", 5]]
  },
  "metadata": { "totalResults": 40, "searchParams": { "keyword": "前端开发" } }
}
```

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

## 测试

```bash
npm test          # 单元/集成测试（vitest）：/health、Web 界面 HTML、/mcp tools/list、
                  # /api/search 链路（爬虫边界为桩实现，秒级完成，不访问真实站点）
npm run test:live # 真实链路冒烟：启动 HTTP 服务并真实爬取招聘网站调用 /api/search
                  # （约 1~3 分钟，需先 npm run build；站点反爬可能导致 0 职位，链路正常即通过）
```

测试文件位于 `test/`，不参与 `npm run build` 产物。

## 故障排查

| 现象 | 处理 |
|------|------|
| 页面能打开但职位为 0 | 网站改版，需更新 `src/config/crawlerConfig.ts` 中对应选择器 |
| Node 版本过低 | Playwright 1.62+ 需 Node 20+，本项目已锁定 `playwright@1.41.2` |
| 被反爬拦截 | 改用真实浏览器 UA、降低请求频率、或提供登录 Cookie |
