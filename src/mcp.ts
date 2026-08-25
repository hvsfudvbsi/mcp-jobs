#!/usr/bin/env node

import http from 'http';
import { webcrypto } from 'crypto';

// Node 18 下全局 crypto 未默认启用，SDK 依赖它，这里做兼容 polyfill
if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = webcrypto;
}
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  Tool,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { searchJobList, crawlJobDetail, SearchParams } from './index';


dotenv.config();

// Web 搜索页面（内嵌单文件，无需额外静态资源）
const WEB_UI_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>mcp-jobs 职位搜索</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; background: #f5f7fa; color: #333; padding: 24px; }
  .container { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .sub { color: #888; font-size: 13px; margin-bottom: 20px; }
  form { display: flex; flex-wrap: wrap; gap: 10px; background: #fff; padding: 16px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 20px; }
  input { padding: 9px 12px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 14px; }
  input.kw { flex: 1 1 220px; }
  input.sm { width: 110px; }
  button { padding: 9px 26px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
  button:disabled { background: #93b4f5; cursor: wait; }
  .status { margin: 12px 2px; color: #666; font-size: 14px; min-height: 20px; }
  .export-bar { display: none; gap: 10px; margin: 0 2px 12px; align-items: center; }
  .export-bar.show { display: flex; }
  .export-bar button { background: #fff; color: #2563eb; border: 1px solid #2563eb; padding: 6px 16px; font-size: 13px; }
  .export-bar button:hover { background: #eff6ff; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid #eef1f5; font-size: 14px; vertical-align: top; }
  th { background: #f0f4f8; color: #555; font-weight: 600; white-space: nowrap; }
  tr:hover td { background: #f8fbff; }
  .salary { color: #e6532e; font-weight: 600; white-space: nowrap; }
  .name a { color: #2563eb; text-decoration: none; }
  .empty { text-align: center; color: #999; padding: 40px 0 !important; }
</style>
</head>
<body>
<div class="container">
  <h1>🔍 mcp-jobs 职位搜索</h1>
  <div class="sub">多平台招聘信息聚合 · MCP 端点：<code id="mcpUrl">/mcp</code></div>
  <form id="f">
    <input class="kw" name="keyword" placeholder="关键词，如：前端开发" required>
    <input class="sm" name="city" placeholder="城市（可选）">
    <input class="sm" name="salary" placeholder="薪资（可选）">
    <input class="sm" name="workYear" placeholder="经验（可选）">
    <input class="sm" name="page" type="number" value="1" min="1" style="width:70px">
    <button id="btn" type="submit">搜 索</button>
  </form>
  <div class="status" id="status">提示：搜索会实时爬取多个招聘网站，可能需要 30~90 秒。</div>
  <div class="export-bar" id="exportBar">
    <span style="color:#999;font-size:13px">导出结果：</span>
    <button type="button" onclick="exportData('csv')">⬇ 导出 CSV</button>
    <button type="button" onclick="exportData('json')">⬇ 导出 JSON</button>
  </div>
  <table id="tbl" style="display:none">
    <thead><tr><th>职位</th><th>公司</th><th>薪资</th><th>地点</th><th>发布时间</th></tr></thead>
    <tbody id="tbody"><tr><td colspan="5" class="empty">暂无结果</td></tr></tbody>
  </table>
</div>
<script>
const $ = s => document.querySelector(s);
$('#mcpUrl').textContent = location.origin + '/mcp';
$('#f').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target), q = new URLSearchParams();
  for (const [k, v] of fd.entries()) if (v && !(k === 'page' && v === '1')) q.set(k, v);
  $('#btn').disabled = true;
  $('#status').textContent = '⏳ 正在爬取招聘网站，请耐心等待…';
  try {
    const r = await fetch('/api/search?' + q.toString());
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    lastJobs = data.jobs || [];
    render(lastJobs);
    $('#exportBar').classList.toggle('show', lastJobs.length > 0);
    $('#status').textContent = '✅ 共找到 ' + (data.total || 0) + ' 个职位';
  } catch (err) {
    $('#status').textContent = '❌ 搜索失败：' + err.message;
  } finally {
    $('#btn').disabled = false;
  }
});
let lastJobs = [];
const EXPORT_FIELDS = ['title', 'company', 'salary', 'address', 'jobDetail', 'tags'];
const EXPORT_HEADERS = ['职位', '公司', '薪资', '地点', '详情链接', '标签'];
function csvCell(v) {
  const s = Array.isArray(v) ? v.join(' | ') : String(v ?? '');
  return '"' + s.replace(/"/g, '""') + '"';
}
function exportData(fmt) {
  if (!lastJobs.length) return;
  let blob;
  if (fmt === 'csv') {
    const rows = [EXPORT_HEADERS].concat(lastJobs.map(j => EXPORT_FIELDS.map(f => csvCell(j[f]))));
    // BOM 头，保证 Excel 打开 CSV 中文不乱码
    blob = new Blob(['\\uFEFF' + rows.map(r => r.join(',')).join('\\r\\n')], { type: 'text/csv;charset=utf-8' });
  } else {
    blob = new Blob([JSON.stringify(lastJobs, null, 2)], { type: 'application/json;charset=utf-8' });
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mcp-jobs-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + fmt;
  a.click();
  URL.revokeObjectURL(a.href);
}
function esc(s) { return String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\\"':'&quot;',"'":'&#39;'}[c])); }
function render(jobs) {
  const tb = $('#tbody');
  if (!jobs.length) { tb.innerHTML = '<tr><td colspan="5" class="empty">未找到职位（部分站点可能有反爬限制）</td></tr>'; }
  else {
    tb.innerHTML = jobs.map(j => {
      const link = j.jobDetail || j.link || j.url;
      const title = link ? '<a href="' + esc(link) + '" target="_blank">' + esc(j.title) + '</a>' : esc(j.title);
      const tags = Array.isArray(j.tags) && j.tags.length ? '<div style="color:#999;font-size:12px;margin-top:4px">' + esc(j.tags.slice(0, 6).join(' · ')) + '</div>' : '';
      return '<tr><td class="name">' + title + tags + '</td><td>' + esc(j.company) + '</td><td class="salary">' + esc(j.salary) + '</td><td>' + esc(j.address || j.location || '') + '</td><td>' + esc(j.publishTime || j.time || '') + '</td></tr>';
    }).join('');
  }
  $('#tbl').style.display = 'table';
}
</script>
</body>
</html>`;

// 职位搜索工具定义
const SEARCH_JOB_TOOL: Tool = {
  name: 'mcp_search_job',
  description: '搜索职位信息，包括职位名称、公司名称、薪资范围、工作地点、发布时间等。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: '搜索关键词',
      },
      city: {
        type: 'string',
        description: '城市名称',
      },
      salary: {
        type: 'string',
        description: '薪资范围',
      },
      workYear: {
        type: 'string',
        description: '工作经验',
      },
      page: {
        type: 'number',
        description: '页码',
      }
    },
    required: ['keyword'],
  },
};

// 职位详情工具定义
const JOB_DETAIL_TOOL: Tool = {
  name: 'mcp_job_detail',
  description: '获取职位详情信息，包括职位名称、公司名称、薪资范围、工作地点、发布时间等。',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '职位详情页URL',
      },
    },
    required: ['url'],
  },
};

// 职位搜索参数接口定义
type SearchJobParams = SearchParams & {
  keyword: string; // 使其成为必需参数
};

// 职位详情参数接口定义
interface JobDetailParams {
  url: string;
}

// 参数验证函数 - 职位搜索
function isValidSearchJobParams(args: unknown): args is SearchJobParams {
  return (
    typeof args === 'object' &&
    args !== null &&
    'keyword' in args &&
    typeof (args as { keyword: unknown }).keyword === 'string' &&
    (('city' in args && typeof (args as { city: unknown }).city === 'string') || !('city' in args)) &&
    (('page' in args && typeof (args as { page: unknown }).page === 'number') || !('page' in args))
  );
}

// 参数验证函数 - 职位详情
function isValidJobDetailParams(args: unknown): args is JobDetailParams {
  return (
    typeof args === 'object' &&
    args !== null &&
    'url' in args &&
    typeof (args as { url: unknown }).url === 'string'
  );
}


// 创建 MCP 服务器实例的工厂函数（HTTP 无状态模式下每个请求创建独立实例）
function createMcpServer(): Server {
  const server = new Server(
  {
    name: 'mcp-jobs',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      logging: {},
    },
  }
);


// 注册工具列表处理器
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [SEARCH_JOB_TOOL, JOB_DETAIL_TOOL],
}));

// 注册工具调用处理器
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const startTime = Date.now();
  try {
    const { name, arguments: args } = request.params;

    // 记录请求日志
    server.sendLoggingMessage({
      level: 'info',
      data: `[${new Date().toISOString()}] 收到工具调用请求: ${name}`,
    });

    if (!args) {
      throw new Error('未提供调用参数');
    }

    switch (name) {
      case 'mcp_search_job': {
        if (!isValidSearchJobParams(args)) {
          throw new Error('搜索职位的参数格式无效，请检查输入参数');
        }
        
        const { keyword, city, page, salary, workYear } = args;
        
        server.sendLoggingMessage({
          level: 'info',
          data: `开始搜索职位，关键词: ${keyword}, 城市: ${city || '全国'}, 页码: ${page || 1}`,
        });

        try {
          const results = await searchJobList({ keyword, city, page, salary, workYear });

          server.sendLoggingMessage({
            level: 'info',
            data: `搜索完成，找到 ${results.length} 个职位`,
          });

          // Add metadata about authentication status
          const responseData = {
            jobs: results,
            metadata: {
              totalResults: results.length,
              searchParams: { keyword, city, page, salary, workYear },
            }
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(responseData) }],
            isError: false,
          };
        } catch (error) {
          server.sendLoggingMessage({
            level: 'error',
            data: `搜索失败: ${error instanceof Error ? error.message : String(error)}`,
          });

          // Provide fallback response even when search fails
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                jobs: [],
                metadata: {
                  totalResults: 0,
                  searchParams: { keyword, city, page, salary, workYear },
                  error: '搜索服务暂时不可用，请稍后重试',
                }
              })
            }],
            isError: false,
          };
        }
      }
      
      case 'mcp_job_detail': {
        if (!isValidJobDetailParams(args)) {
          throw new Error('获取职位详情的参数格式无效，请检查输入参数');
        }
        
        const { url } = args;
        
        server.sendLoggingMessage({
          level: 'info',
          data: `开始获取职位详情，URL: ${url}`,
        });

        try {
          const detail = await crawlJobDetail(url);

          if (!detail) {
            const responseData = {
              jobDetail: null,
              metadata: {
                url: url,
                error: '未找到职位详情',
              }
            };

            return {
              content: [{ type: 'text', text: JSON.stringify(responseData) }],
              isError: false,
            };
          }

          server.sendLoggingMessage({
            level: 'info',
            data: `职位详情获取成功: ${detail.title || '未知职位'}`,
          });

          const responseData = {
            jobDetail: detail,
            metadata: {
              url: url,
            }
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(responseData) }],
            isError: false,
          };
        } catch (error) {
          server.sendLoggingMessage({
            level: 'error',
            data: `获取职位详情失败: ${error instanceof Error ? error.message : String(error)}`,
          });

          const responseData = {
            jobDetail: null,
            metadata: {
              url: url,
              error: '职位详情获取失败，请检查URL或稍后重试',
            }
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(responseData) }],
            isError: false,
          };
        }
      }
    
      default:
        return {
          content: [{ type: 'text', text: `未知工具: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    // 记录错误日志
    server.sendLoggingMessage({
      level: 'error',
      data: {
        message: `请求失败: ${error instanceof Error ? error.message : String(error)}`,
        tool: request.params.name,
        arguments: request.params.arguments,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      },
    });
    return {
      content: [
        {
          type: 'text',
          text: `错误: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  } finally {
    // 记录请求完成日志
    server.sendLoggingMessage({
      level: 'info',
      data: `请求处理完成，耗时 ${Date.now() - startTime}ms`,
    });
  }
});
  return server;
}

// 启动 stdio 模式服务器（默认，供 Cursor / Claude Desktop 等 AI 客户端使用）
async function runStdioServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  server.sendLoggingMessage({
    level: 'info',
    data: '职位搜索服务初始化成功',
  });

  console.error('职位搜索服务已启动（stdio 模式），正在运行中...');
}

// 启动 HTTP 模式服务器（通过 --http 参数或 MCP_HTTP=1 环境变量开启）
async function runHttpServer(port: number, host: string) {
  const httpServer = http.createServer(async (req, res) => {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Authorization',
    };

    // CORS 预检请求
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    // 健康检查（保留 JSON 输出供脚本探活）
    if (req.url === '/health') {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        name: 'mcp-jobs',
        version: '1.0.0',
        status: 'running',
        mcpEndpoint: `http://${req.headers.host}/mcp`,
        tools: ['mcp_search_job', 'mcp_job_detail'],
      }, null, 2));
      return;
    }

    // 搜索 API：/api/search?keyword=xxx&city=xxx&page=1&salary=xx&workYear=x
    if (req.url?.startsWith('/api/search')) {
      try {
        const query = new URL(req.url, 'http://localhost').searchParams;
        const keyword = (query.get('keyword') || '').trim();
        if (!keyword) {
          res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: '缺少 keyword 参数' }));
          return;
        }
        const params: SearchParams = {
          keyword,
          city: query.get('city') || undefined,
          page: parseInt(query.get('page') || '1', 10) || 1,
          salary: query.get('salary') || undefined,
          workYear: query.get('workYear') || undefined,
        };
        console.error(`[Web] 搜索职位: ${JSON.stringify(params)}`);
        const jobs = await searchJobList(params);
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ total: jobs.length, jobs }));
      } catch (error) {
        console.error('[Web] 搜索失败:', error);
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }

    // 首页：Web 搜索界面
    if (req.url === '/') {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' });
      res.end(WEB_UI_HTML);
      return;
    }

    // MCP 端点：无状态模式，每个请求使用独立的 server/transport 实例
    if (req.url === '/mcp') {
      try {
        const mcpServer = createMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });

        res.on('close', () => {
          transport.close();
          mcpServer.close();
        });

        // 预设 CORS 响应头（writeHead 会保留未覆盖的 setHeader 项）
        Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error('处理 MCP 请求出错:', error);
        if (!res.headersSent) {
          res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }));
      }
      return;
    }

    // 其他路径返回 404
    res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not Found', hint: '请访问 / 查看服务信息，或连接 /mcp 端点' }, null, 2));
  });

  return new Promise<void>((resolve, reject) => {
    httpServer.on('error', reject);
    httpServer.listen(port, host, () => {
      console.error(`职位搜索服务已启动（HTTP 模式）`);
      console.error(`  服务信息页面: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/`);
      console.error(`  MCP 端点:     http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/mcp`);
      resolve();
    });
  });
}

async function main() {
  const useHttp = process.argv.includes('--http') || process.env.MCP_HTTP === '1';
  const port = parseInt(process.env.MCP_PORT || process.env.PORT || '3000', 10);
  const host = process.env.MCP_HOST || '0.0.0.0';

  try {
    console.error('正在初始化职位搜索服务...');

    if (useHttp) {
      await runHttpServer(port, host);
    } else {
      await runStdioServer();
    }
  } catch (error) {
    console.error('服务器启动失败:', error);
    process.exit(1);
  }
}

main().catch((error: any) => {
  console.error('服务器运行出错:', error);
  process.exit(1);
});