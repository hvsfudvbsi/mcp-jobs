# mcp-jobs

🚀 **零配置** 的多平台职位聚合服务！基于 MCP 架构，支持从主流招聘网站获取职位信息，**开箱即用，无需任何设置**。

[![NPM Version][npm-image]][npm-url]
[![Node.js Version][node-version-image]][node-version-url]
[![License][license-image]][license-url]

## ⚡ 30 秒快速开始

### 🚀 第一步：启动服务（零配置）

```bash
# 一行命令，立即启动
npx -y mcp-jobs
```

### 🤖 第二步：配置 AI 客户端

在您的 AI 客户端（如 Cursor、Claude Desktop）中添加：
- **服务名称**: `mcp-jobs`
- **命令**: `npx -y mcp-jobs`
- **环境变量**: 留空

### 💬 第三步：开始使用

直接向 AI 助手说：*"搜索北京的前端开发职位"*

**就这么简单！** 🎉 无需注册、无需 API Key、无需配置文件。

## 🌟 核心特性

- **🔓 零门槛**：无需 API Key，无需注册，无需配置
- **📦 开箱即用**：一行命令即可启动完整服务
- **🔍 智能搜索**：支持按职位名称、城市、薪资范围等条件筛选
- **🌐 多平台聚合**：自动从多个主流招聘网站获取数据
- **📊 标准化输出**：统一的数据格式，便于大模型处理
- **⚡ 实时更新**：保证职位信息的时效性
- **🌐 Web 搜索界面**：`--http` 模式内置浏览器页面，支持来源筛选、分页与 CSV/JSON 导出
- **🔧 可选增强**：支持 API Key 解锁额外功能（完全可选）

## 📦 安装方式

### 🚀 即时运行（推荐）

**无需安装，无需配置，立即使用：**

```bash
# 一行命令，立即启动
npx -y mcp-jobs
```

### 🔧 全局安装（可选）

如果您需要频繁使用：

```bash
# 全局安装
npm install -g mcp-jobs

# 直接运行
mcp-jobs
```

### 📁 项目内安装（可选）

```bash
# 安装到项目依赖中
npm install mcp-jobs
# 或使用 yarn
yarn add mcp-jobs
# 或使用 pnpm
pnpm add mcp-jobs
```

## 🎯 使用说明

### 🚀 基础使用（零配置）

**无需任何设置，立即开始：**

```bash
# 启动服务
npx -y mcp-jobs

# 服务将自动提供以下功能：
# ✅ 职位搜索
# ✅ 职位详情获取
# ✅ 多平台数据聚合
# ✅ 标准化数据输出
```

**就是这么简单！** 

### 🔧 高级配置（完全可选）

如果您需要额外的增强功能，可以选择性配置以下参数：

```bash
# 可选：复制配置模板
cp .env.example .env

# 可选：编辑配置文件，取消注释您需要的功能
# USERNAME=your_username            # 可选：基础认证
# PASSWORD=your_password            # 可选：基础认证

# 可选：爬虫配置
# CRAWLER_HEADLESS=true             # 可选：无头模式 (调试时可设为 false)
# CRAWLER_TIMEOUT=30000             # 可选：页面超时时间 (毫秒)
# CRAWLER_VIEWPORT_WIDTH=1280       # 可选：浏览器视窗宽度
# CRAWLER_VIEWPORT_HEIGHT=800       # 可选：浏览器视窗高度
# CRAWLER_DEBUG=false               # 可选：调试模式
```

#### 可选配置说明

| 配置项 | 用途 | 是否必需 |
|--------|------|----------|
| `USERNAME` | 基础认证用户名 | ❌ 可选 |
| `PASSWORD` | 基础认证密码 | ❌ 可选 |
| `CRAWLER_HEADLESS` | 浏览器无头模式 (true/false) | ❌ 可选 |
| `CRAWLER_TIMEOUT` | 页面超时时间 (毫秒) | ❌ 可选 |
| `CRAWLER_VIEWPORT_WIDTH` | 浏览器视窗宽度 | ❌ 可选 |
| `CRAWLER_VIEWPORT_HEIGHT` | 浏览器视窗高度 | ❌ 可选 |
| `CRAWLER_DEBUG` | 调试模式 (true/false) | ❌ 可选 |

> 💡 **重要提示**：所有配置都是**完全可选的**。服务在没有任何配置的情况下提供完整的核心功能。

## 🤖 AI 客户端配置

### 🚀 Cursor 配置（零配置）

#### 最简配置（推荐）

1. 打开 Cursor 设置
2. 进入 Features > MCP Servers
3. 点击 "+ Add New MCP Server"
4. 输入以下信息：
   - **Name**: `mcp-jobs`
   - **Type**: `command`
   - **Command**: `npx -y mcp-jobs`



#### JSON 配置方式

**基础配置（开箱即用）：**

```json
{
  "mcpServers": {
    "mcp-jobs": {
      "command": "npx",
      "args": ["-y", "mcp-jobs"]
    }
  }
}
```

**高级配置（可选增强）：**

```json
{
  "mcpServers": {
    "mcp-jobs": {
      "command": "npx",
      "args": ["-y", "mcp-jobs"],
      "env": {
        "USERNAME": "your-username",
        "PASSWORD": "your-password"
      }
    }
  }
}
```

> 💡 **提示**：推荐使用基础配置，已提供完整的职位搜索功能！

### 🤖 Claude Desktop 配置

**零配置设置：**

1. 打开 Claude Desktop
2. 点击左下角 Settings 图标
3. 选择 "MCP Servers" 选项
4. 点击 "Add New Server"
5. 输入以下信息：
   - **Name**: `mcp-jobs`
   - **Type**: `command`
   - **Command**: `npx -y mcp-jobs`
   - **Environment Variables**: 留空（无需任何变量）

**就这样！** 无需 API Key，立即可用。

### 🚀 Windsurf 配置

**基础配置（零设置）：**

```json
{
  "mcpServers": {
    "mcp-jobs": {
      "command": "npx",
      "args": ["-y", "mcp-jobs"]
    }
  }
}
```

### 🚀 Cline 配置

**基础配置（零设置）：**

```yaml
mcp:
  servers:
    mcp-jobs:
      command: npx
      args: ["-y", "mcp-jobs"]
```


## 🔧 高级配置（完全可选）

> ⚠️ **重要提示**：以下所有配置都是**完全可选的**！服务在无任何配置的情况下即可提供完整功能。

如果您需要自定义服务行为，可以选择性配置以下环境变量：

```bash
# 可选：MCP API 密钥（用于解锁高级功能）
# 可选：基础认证
# USERNAME=your-username
# PASSWORD=your-password

# 可选：自定义 MCP 服务地址
```

> 💡 **再次提醒**：无需任何配置即可使用完整的职位搜索功能！

## 🎯 立即开始使用

配置完成后（只需一行命令！），您就可以通过自然语言向 AI 助手描述职位搜索需求：

### 💬 使用示例

**直接搜索职位：**
- "搜索上海地区的前端开发工程师职位"
- "查找北京的数据分析师岗位，要求 3 年以上经验"
- "找出杭州地区薪资最高的产品经理职位"

**获取职位详情：**
- "获取这个职位的详细信息：[职位链接]"
- "分析这个岗位的要求和薪资情况"

**智能分析：**
- "比较不同城市的同类职位薪资水平"
- "总结当前市场上热门的技能要求"

> 🚀 **零门槛体验**：无需学习复杂的 API 调用，直接用自然语言即可获得专业的职位搜索服务！

大模型会自动调用 mcp-jobs 服务获取相关信息并为您展示结果。

## 🌐 Web 搜索界面（HTTP 模式）

除了 MCP 接入，服务还内置一个开箱即用的 Web 搜索页面（无需前端工程）：

```bash
# 以 HTTP 模式启动（端口可用 MCP_PORT 或 PORT 覆盖，默认 3000）
npx -y mcp-jobs --http
```

启动后会打印所有可访问地址：本机用 `http://localhost:3000/`，其他设备用打印出的局域网地址（如 `http://192.168.x.x:3000/`）。若部署在云服务器上需公网访问，请在安全组/防火墙放行端口，或用 SSH 隧道 `ssh -L 3000:localhost:3000 <用户>@<服务器地址>`。页面功能：

- **职位搜索**：关键词 + 城市 + 薪资 + 经验 + 页码，实时爬取多个招聘网站
- **结果表格**：支持按来源站点筛选、分页浏览（每页 10 条）
- **公司薪资参考**：搜索结果按公司附带 Levels.fyi 薪资参考（级别/总包），随 JSON/MD 一并导出
- **数据导出**：一键下载 CSV（含 BOM，Excel 打开中文不乱码）或 JSON
- **等待提示**：搜索期间显示进度条与已用时间

### 内置接口

| 路径 | 说明 |
|------|------|
| `/` | Web 搜索界面 |
| `/api/search?keyword=前端&city=北京&page=1` | 搜索 API（JSON，字段同 MCP 工具，含 `salaryRefs` 公司薪资参考） |
| `/mcp` | MCP 端点（StreamableHTTP 无状态模式） |
| `/health` | 健康检查 |

> 💡 MCP 客户端（Cursor / Claude Desktop 等）既可用 `npx -y mcp-jobs`（stdio），
> 也可用 `npx -y mcp-jobs --http` 后连接 `http://localhost:3000/mcp`（HTTP）。

## 🔧 调试和开发

### 🐛 调试模式

如果您需要调试爬虫行为或开发新功能，可以启用调试模式：

```bash
# 启用可视化浏览器窗口（非无头模式）
CRAWLER_HEADLESS=false npx -y mcp-jobs

# 启用调试日志
CRAWLER_DEBUG=true npx -y mcp-jobs

# 组合使用
CRAWLER_HEADLESS=false CRAWLER_DEBUG=true npx -y mcp-jobs
```

### ⚙️ 自定义浏览器配置

```bash
# 自定义视窗大小
CRAWLER_VIEWPORT_WIDTH=1920 CRAWLER_VIEWPORT_HEIGHT=1080 npx -y mcp-jobs

# 增加超时时间（适用于慢速网络）
CRAWLER_TIMEOUT=60000 npx -y mcp-jobs

# 自定义用户代理
CRAWLER_USER_AGENT="Custom Bot 1.0" npx -y mcp-jobs
```

### 📝 配置优先级

配置的优先级从高到低：
1. **站点特定配置** - 在 `crawlerConfig.ts` 中为特定网站设置的 `browserConfig`
2. **环境变量** - 通过 `CRAWLER_*` 环境变量设置
3. **默认配置** - 系统默认值

## 🌟 为什么选择 MCP Jobs？

### ✅ **真正的零门槛**
- 🚫 **无需注册账号** - 不用填写任何个人信息
- 🚫 **无需复杂配置** - 一行命令即可启动
- 🚫 **无需学习文档** - 直接用自然语言交互

### ⚡ **立即可用**
- 📦 开箱即用，无需任何准备工作
- 🔍 完整的职位搜索功能
- 🌐 多平台数据聚合
- 📊 标准化数据输出

### 🛡️ **可靠稳定**
- 🔄 自动重试机制
- ⚠️ 优雅的错误处理
- 📈 实时数据更新
- 🔧 可选的高级功能

## 📋 使用须知

1. **完全免费** - 核心功能无需任何费用
2. **遵守规范** - 请遵守各招聘平台的使用协议
3. **合理使用** - 建议控制请求频率，避免过度访问
4. **系统要求** - Node.js >= 16.0.0

## 开源协议

[MIT License](LICENSE)

## 获取帮助

如果您在使用过程中遇到任何问题，请通过以下方式获取帮助：

- 提交 [GitHub Issue](https://github.com/mergedao/mcp-jobs/issues)

[npm-image]: https://img.shields.io/npm/v/mcp-jobs.svg
[npm-url]: https://npmjs.org/package/mcp-jobs
[node-version-image]: https://img.shields.io/node/v/mcp-jobs.svg
[node-version-url]: https://nodejs.org/download/
[license-image]: https://img.shields.io/npm/l/mcp-jobs.svg
[license-url]: LICENSE
