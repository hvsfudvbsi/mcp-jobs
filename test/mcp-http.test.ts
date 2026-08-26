import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import pkg from '../package.json';

// 将爬虫边界替换为桩实现：不访问真实站点，专注验证 HTTP/Web 链路
vi.mock('../src/index', () => ({
  searchJobList: vi.fn(),
  crawlJobDetail: vi.fn(),
}));

import { searchJobList } from '../src/index';
import { runHttpServer } from '../src/mcp';

let server: Server;
let base: string;

beforeAll(async () => {
  server = await runHttpServer(0, '127.0.0.1');
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
});

beforeEach(() => {
  vi.resetAllMocks();
});

// 解析 MCP 端点的 SSE 响应：取最后一个 data: 行作为 JSON-RPC 响应
async function mcpRequest(method: string, params?: unknown): Promise<any> {
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const text = await res.text();
  const dataLines = text
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => l.slice(6));
  expect(dataLines.length).toBeGreaterThan(0);
  return JSON.parse(dataLines[dataLines.length - 1]);
}

describe('HTTP 服务', () => {
  it('/health 返回服务信息，版本号与 package.json 一致', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.name).toBe('mcp-jobs');
    expect(body.version).toBe(pkg.version);
    expect(body.status).toBe('running');
    expect(body.tools).toEqual(expect.arrayContaining(['mcp_search_job', 'mcp_job_detail']));
  });

  it('首页返回 Web 搜索界面（表单/筛选/分页/导出/进度条）', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    // 搜索表单
    expect(html).toContain('<form id="f"');
    expect(html).toContain('name="keyword"');
    expect(html).toContain('name="city"');
    // 来源筛选 / 分页 / 进度条 / 导出
    expect(html).toContain('id="filterBar"');
    expect(html).toContain('id="pager"');
    expect(html).toContain('id="progress"');
    expect(html).toContain("exportData('csv')");
    expect(html).toContain("exportData('json')");
    // 调用 /api/search 并展示来源列
    expect(html).toContain("fetch('/api/search?'");
    expect(html).toContain('来源');
  });

  it('OPTIONS 预检返回 204 与 CORS 头', async () => {
    const res = await fetch(`${base}/mcp`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('未知路径返回 404', async () => {
    const res = await fetch(`${base}/no-such-path`);
    expect(res.status).toBe(404);
  });
});

describe('/api/search', () => {
  it('返回带 source 来源标签的职位 JSON', async () => {
    vi.mocked(searchJobList).mockResolvedValue([
      { title: '前端工程师', salary: '20-30万', company: 'A公司', address: '北京', jobDetail: 'https://x/job/1', tags: ['vue'], source: '51job' },
      { title: '后端工程师', salary: '30-40万', company: 'B公司', address: '上海', jobDetail: 'https://x/job/2', tags: [], source: 'zhaopin-jobs' },
    ]);
    const res = await fetch(
      `${base}/api/search?keyword=${encodeURIComponent('前端')}&city=${encodeURIComponent('北京')}&page=2`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.jobs).toHaveLength(2);
    expect(body.jobs[0]).toMatchObject({ title: '前端工程师', source: '51job' });
    expect(body.jobs[1]).toMatchObject({ source: 'zhaopin-jobs' });
    // 参数按预期透传给搜索函数
    expect(vi.mocked(searchJobList)).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: '前端', city: '北京', page: 2 })
    );
  });

  it('缺少 keyword 参数返回 400', async () => {
    const res = await fetch(`${base}/api/search`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(vi.mocked(searchJobList)).not.toHaveBeenCalled();
  });

  it('搜索异常时返回 500 且携带错误信息', async () => {
    vi.mocked(searchJobList).mockRejectedValue(new Error('爬取服务暂时不可用'));
    const res = await fetch(`${base}/api/search?keyword=java`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('爬取服务暂时不可用');
  });
});

describe('/mcp 端点', () => {
  it('tools/list 返回 mcp_search_job 与 mcp_job_detail 两个工具', async () => {
    const payload = await mcpRequest('tools/list');
    const names = payload.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(['mcp_search_job', 'mcp_job_detail']));
  });
});
