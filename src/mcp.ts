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

    // 健康检查 / 简单首页
    if (req.url === '/' || req.url === '/health') {
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