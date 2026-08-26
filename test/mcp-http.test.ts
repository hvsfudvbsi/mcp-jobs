import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import vm from 'node:vm';
import pkg from '../package.json';

// 将爬虫边界替换为桩实现：不访问真实站点，专注验证 HTTP/Web 链路
vi.mock('../src/index', () => ({
  searchJobList: vi.fn(),
  crawlJobDetail: vi.fn(),
}));

import { searchJobList } from '../src/index';
import { runHttpServer } from '../src/mcp';
import { buildSummary } from '../src/services/summaryService';

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
    expect(html).toContain("exportData('md')");
    // 调用 /api/search 并展示来源列
    expect(html).toContain("fetch('/api/search?'");
    expect(html).toContain('来源');
    // 岗位要求总结面板 + 汇总/导出逻辑
    expect(html).toContain('id="summaryPanel"');
    expect(html).toContain('岗位要求总结');
    expect(html).toContain('function buildSummary');
    expect(html).toContain('function buildMarkdown');
    expect(html).toContain('function parseSalary');
    expect(html).toContain('function normalizeTitle');
    expect(html).toContain('id="sumGroups"');
    expect(html).toContain('薪资中位数');
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

  it('tools/call mcp_search_job 返回职位列表并附带岗位要求总结', async () => {
    vi.mocked(searchJobList).mockResolvedValue([
      { title: '前端开发', salary: '20-30万', company: 'A公司', address: '北京', source: '51job', tags: ['Vue', 'TypeScript'] },
      { title: 'Web前端工程师', salary: '25-35万·13薪', company: 'B公司', address: '深圳', source: 'zhaopin-jobs', tags: ['React'] },
      { title: 'Java开发', salary: '30-40万', company: 'C公司', address: '上海', source: '51job', tags: ['Java', 'Spring'] },
    ]);
    const payload = await mcpRequest('tools/call', {
      name: 'mcp_search_job',
      arguments: { keyword: '前端' },
    });
    expect(payload.result.isError).toBe(false);
    const data = JSON.parse(payload.result.content[0].text);
    expect(data.jobs).toHaveLength(3);
    expect(data.metadata.totalResults).toBe(3);
    // 总结数据：总数/来源/技能/薪资/分组
    expect(data.summary.total).toBe(3);
    expect(Object.keys(data.summary.sources)).toContain('51job');
    expect(data.summary.topSkills.length).toBeGreaterThan(0);
    // 前端开发 / Web前端工程师 归一为同一组
    const front = data.summary.groupList.find((g: { title: string }) => g.title === '前端');
    expect(front).toBeTruthy();
    expect(front.count).toBe(2);
    expect(front.salary).not.toBe('—');
    expect(front.salaryMedian).not.toBe('—');
    expect(data.summary.salaryMin).toBeGreaterThan(0);
  });
});

// 在 Node vm 沙箱中执行首页内嵌脚本并暴露纯函数（同时校验脚本可被浏览器解析）
function evalPageFns(html: string) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error('页面中未找到 <script> 块');
  const el = () => ({
    textContent: '', innerHTML: '', style: {}, dataset: {},
    firstChild: { textContent: '' },
    classList: { add() {}, toggle() {}, contains: () => false },
    addEventListener() {},
  });
  const sandbox: Record<string, unknown> = {
    console,
    location: { origin: 'http://localhost' },
    document: { querySelector: () => el() },
    FormData: class {
      get() { return null; }
    },
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(script, ctx);
  return ctx as unknown as {
    normalizeTitle: (t: string) => string;
    buildSummary: (jobs: unknown[]) => {
      groupList: { title: string; count: number; salary: string; salaryMedian: string; skills: string }[];
    };
  };
}

describe('前后端总结逻辑一致性', () => {
  it('后端 buildSummary 与页面内嵌前端逻辑输出一致（防止分叉）', async () => {
    const res = await fetch(`${base}/`);
    const html = await res.text();
    const { buildSummary: frontBuildSummary } = evalPageFns(html);
    const jobs = [
      { title: '前端开发', salary: '20-30万', company: 'A公司', address: '北京', source: '51job', tags: ['Vue', 'TypeScript'] },
      { title: 'Web前端开发工程师', salary: '25-35万·13薪', company: 'B公司', address: '深圳', source: 'zhaopin-jobs', tags: ['React', 'Node.js'] },
      { title: '中级web前端开发工程师', salary: '2-3万', company: 'C公司', address: '杭州', source: 'shixiseng', tags: ['Vue', 'CSS'] },
      { title: 'Java后端开发工程师', salary: '35-50万/年', company: 'D公司', address: '上海', source: '51job', tags: ['Java', 'Spring'] },
      { title: '前端', salary: '30-40K·14薪', company: 'E公司', address: '广州', source: 'zhaopin-jobs', tags: [] },
    ];
    expect(buildSummary(jobs)).toEqual(frontBuildSummary(jobs));
  });
});

describe('岗位标题归一化与分组薪资', () => {
  it('前端/前端开发/Web前端/web前端 合并为一组，且薪资按组统计', async () => {
    const res = await fetch(`${base}/`);
    const html = await res.text();
    const { normalizeTitle, buildSummary } = evalPageFns(html);

    // 各类写法归一到同一组
    expect(normalizeTitle('前端')).toBe('前端');
    expect(normalizeTitle('前端开发')).toBe('前端');
    expect(normalizeTitle('Web前端')).toBe('前端');
    expect(normalizeTitle('web前端')).toBe('前端');
    expect(normalizeTitle('前端开发工程师')).toBe('前端');
    expect(normalizeTitle('Web前端开发工程师')).toBe('前端');
    // 词间空格不影响归并：前端开发 实习生 / web 前端 也归入前端
    expect(normalizeTitle('前端开发 实习生')).toBe('前端');
    expect(normalizeTitle('web 前端')).toBe('前端');
    // 级别词在 web 前不影响归并；业务线后缀/竖线/方括号内容被剔除
    expect(normalizeTitle('中级web前端开发工程师')).toBe('前端');
    expect(normalizeTitle('前端开发-证券项目')).toBe('前端');
    expect(normalizeTitle('前端｜小程序工程师')).toBe('前端');
    expect(normalizeTitle('前端开发【到12月底~全额五险一金】')).toBe('前端');
    // web 前缀只在中文字符前剥离，避免误伤 webgl 等
    expect(normalizeTitle('WebGL开发')).toBe('webgl');

    const jobs = [
      { title: '前端', salary: '20-30万', source: 'a', tags: [] },
      { title: '前端开发', salary: '25-35万·13薪', source: 'a', tags: [] },
      { title: 'Web前端', salary: '30-40万/年', source: 'b', tags: [] },
      { title: 'web前端', salary: '2-3万', source: 'c', tags: [] },
      { title: 'Java后端', salary: '35-50万', source: 'a', tags: [] },
    ];
    const sum = buildSummary(jobs);
    expect(sum.groupList).toHaveLength(2);
    const front = sum.groupList.find((g) => g.title === '前端');
    expect(front).toBeTruthy();
    expect(front!.count).toBe(4);
    // 前端组薪资来自 4 个职位（月薪×12 / 年薪混算），区间与中位数均被统计
    expect(front!.salary).not.toBe('—');
    expect(front!.salaryMedian).not.toBe('—');
  });
});
