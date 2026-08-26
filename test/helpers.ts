import vm from 'node:vm';

export interface ParsedSalaryShape {
  lo: number;
  hi: number;
  mid: number;
  text: string;
}

export interface SummaryShape {
  total: number;
  sources: Record<string, number>;
  topSkills: [string, number][];
  topCompanies: [string, number][];
  groupList: { title: string; count: number; salary: string; salaryMedian: string; skills: string }[];
  salaryMin?: number;
  salaryMax?: number;
  salaryMedian?: number;
  [key: string]: unknown;
}

export interface PageFns {
  parseSalary: (s: string | null | undefined) => ParsedSalaryShape | null;
  normalizeTitle: (t: string | null | undefined) => string;
  buildSummary: (jobs: unknown[]) => SummaryShape;
  buildMarkdown: (sum: unknown, jobs: unknown[]) => string;
  mdTable: (headers: string[], rows: string[][]) => string;
  csvCell: (v: unknown) => string;
}

// 在 Node vm 沙箱中执行页面内嵌脚本并暴露纯函数。
// 转义回归防线：WEB_UI_HTML 模板字符串若把内嵌 JS 的 \n、\d、\| 等转义吞掉，
// 整段脚本将成为非法 JS，vm.runInContext 直接抛错，所有依赖本函数的测试立即失败。
export function evalPageFns(html: string): PageFns {
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
  const anyCtx = ctx as unknown as Record<string, unknown>;
  return {
    parseSalary: anyCtx.parseSalary as PageFns['parseSalary'],
    normalizeTitle: anyCtx.normalizeTitle as PageFns['normalizeTitle'],
    buildSummary: anyCtx.buildSummary as PageFns['buildSummary'],
    buildMarkdown: anyCtx.buildMarkdown as PageFns['buildMarkdown'],
    mdTable: anyCtx.mdTable as PageFns['mdTable'],
    csvCell: anyCtx.csvCell as PageFns['csvCell'],
  };
}
