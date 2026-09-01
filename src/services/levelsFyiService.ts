// Levels.fyi 公司薪资参考服务：搜索结果中附带公司薪资（按级别 Total/Base/Stock/Bonus）。
//
// Levels.fyi 是薪资数据站而非职位列表站，不参与 jobSearchUrls 聚合；
// 本服务在搜索完成后按公司名解析 slug、抓取薪资页并把参考附加到响应。
//
// 探测结论（2026-09-01，probes/probe-levelsfyi-salary.js）：
// - SSR 渲染无验证墙，单页 ~8-10s；页面含两张表：
//   1) 汇总表（表头 Level Name/Total/Base/Stock (/yr)/Bonus）—— 部分公司没有这张表；
//   2) 报告表（Level Name + Total Compensation）—— 无汇总表时按级别聚合兜底。
// - 页标题带薪资区间：`{Company} {Role} Salary | {range} | Levels.fyi`。

import { chromium, Browser, BrowserContext, Page } from 'playwright';

export interface SalaryLevelRow {
  level: string;   // 级别名（如 P6 / T5 / 2-2）
  total: string;   // 总包
  base: string;    // 基础薪资
  stock: string;   // 股票（每年）
  bonus: string;   // 奖金
}

export interface CompanySalaryRef {
  company: string;             // 搜索结果中的公司名
  slug: string;                // Levels.fyi 公司 slug（如 tencent / alibaba）
  url: string;                 // 薪资页 URL
  range: string;               // 页标题薪资区间，如 "CN¥347K-CN¥2M+"
  currency: 'CN¥' | '$' | '';  // 币种标记
  levels: SalaryLevelRow[];    // 汇总表级别薪资；无汇总表时为报告聚合结果
}

export interface SalaryRefTarget {
  name: string;
  count: number;   // 该公司在搜索结果中的职位数（用于排序取 Top N）
}

export interface SalaryRefOptions {
  limit?: number;         // 最多抓取几家公司（默认 5）
  concurrency?: number;   // 并发页数（默认 2）
  pageTimeout?: number;   // 单页超时 ms（默认 20000）
  maxRetryMs?: number;    // 等待表格渲染的最大重试窗口 ms（默认 8000）
  cacheTtlMs?: number;    // 缓存 TTL（默认 12h）
  fetcher?: (slug: string, url: string) => Promise<CompanySalaryRef | null>; // 测试注入
}

// 公司名 → Levels.fyi slug 别名表（越长越具体越靠前，contains 匹配）
const COMPANY_ALIASES: Array<[string, string]> = [
  // 中国大厂
  ['字节跳动', 'bytedance'], ['字节', 'bytedance'],
  ['阿里巴巴', 'alibaba'], ['阿里', 'alibaba'],
  ['蚂蚁集团', 'antgroup'], ['蚂蚁', 'antgroup'],
  ['哔哩哔哩', 'bilibili'], ['B站', 'bilibili'],
  ['腾讯', 'tencent'],
  ['百度', 'baidu'],
  ['美团', 'meituan'],
  ['京东', 'jd.com'],
  ['拼多多', 'pinduoduo'],
  ['网易', 'netease'],
  ['华为', 'huawei'],
  ['小米', 'xiaomi'],
  ['滴滴', 'didi'],
  ['快手', 'kuaishou'],
  ['携程', 'ctrip'],
  ['联想', 'lenovo'],
  ['大疆', 'dji'],
  ['OPPO', 'oppo'],
  ['vivo', 'vivo'],
  // 中小厂/硬件/新消费（2026-09 逐站验证收录，无效 slug 已剔除）
  ['比亚迪', 'byd'],
  ['蔚来', 'nio'],
  ['海康威视', 'hikvision'],
  ['一加', 'oneplus'],
  ['传音控股', 'transsion'],
  ['富士康', 'foxconn'],
  ['荣耀', 'honor'],
  ['米哈游', 'mihoyo'],
  ['货拉拉', 'lalamove'],
  ['软通动力', 'isoftstone'],
  ['商汤科技', 'sensetime'],
  ['旷视科技', 'megvii'],
  ['云从科技', 'cloudwalk'],
  ['名创优品', 'miniso'],
  ['Keep', 'keep'],
  ['SHEIN', 'shein'],
  ['希音', 'shein'],
  ['Anker', 'anker'],
  // 海外
  ['微软', 'microsoft'],
  ['谷歌', 'google'],
  ['苹果', 'apple'],
  ['亚马逊', 'amazon'],
  ['甲骨文', 'oracle'],
  ['英特尔', 'intel'],
  ['英伟达', 'nvidia'],
  ['三星', 'samsung'],
  ['特斯拉', 'tesla'],
  ['推特', 'twitter'],
  ['领英', 'linkedin'],
  ['脸书', 'facebook'],
  ['Microsoft', 'microsoft'],
  ['Google', 'google'],
  ['Apple', 'apple'],
  ['Amazon', 'amazon'],
  ['Meta', 'meta'],
  ['facebook', 'facebook'],
  ['Netflix', 'netflix'],
  ['Oracle', 'oracle'],
  ['Salesforce', 'salesforce'],
  ['IBM', 'ibm'],
  ['Intel', 'intel'],
  ['NVIDIA', 'nvidia'],
  ['Nvidia', 'nvidia'],
  ['AMD', 'amd'],
  ['Samsung', 'samsung'],
  ['Tesla', 'tesla'],
  ['Uber', 'uber'],
  ['Airbnb', 'airbnb'],
  ['Twitter', 'twitter'],
  ['LinkedIn', 'linkedin'],
  ['Zoom', 'zoom'],
  ['Shopify', 'shopify'],
  ['Stripe', 'stripe'],
  ['Snowflake', 'snowflake'],
  ['Databricks', 'databricks'],
  ['Mozilla', 'mozilla'],
  ['Canonical', 'canonical'],
  // 海外中小厂/企业软件（2026-09 逐站验证收录）
  ['思科', 'cisco'],
  ['惠普', 'hp'],
  ['ServiceNow', 'servicenow'],
  ['Workday', 'workday'],
  ['JetBrains', 'jetbrains'],
  ['Atlassian', 'atlassian'],
  ['Figma', 'figma'],
  ['bilibili', 'bilibili'],
];

// 公司名 → slug：先查别名表（contains），未收录的中文名返回 null，纯英文名 slugify 兜底
export function resolveCompanySlug(name: string | null | undefined): string | null {
  const n = String(name || '').trim();
  if (!n) return null;
  for (const [alias, slug] of COMPANY_ALIASES) {
    if (n.includes(alias)) return slug;
  }
  // 含中文且不在别名表 → 无法可靠映射，跳过
  if (/[\u4e00-\u9fa5]/.test(n)) return null;
  const slug = n
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/\.{2,}/g, '.');
  return slug || null;
}

// 按职位数排序并去重，取 Top N（最多 limit 家）
export function pickTopCompanies(companies: SalaryRefTarget[], limit: number): SalaryRefTarget[] {
  const byName = new Map<string, SalaryRefTarget>();
  for (const t of companies) {
    const name = String(t.name || '').trim();
    if (!name) continue;
    const prev = byName.get(name);
    byName.set(name, { name, count: Math.max(prev ? prev.count : 0, t.count || 1) });
  }
  return Array.from(byName.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, Math.max(1, limit));
}

const DEFAULT_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 小时

// 内存缓存：同一 slug 在 TTL 内不重复抓取（null 表示 404/无数据，同样缓存）
const cache = new Map<string, { ts: number; ref: CompanySalaryRef | null }>();

// 仅供测试：清空缓存，避免用例间互相污染
export function clearSalaryRefCache(): void {
  cache.clear();
}

// 页内提取：汇总表级别行 + 标题薪资区间；无汇总表时从报告表按级别聚合
export async function extractSalaryPage(page: Page): Promise<{ levels: SalaryLevelRow[]; range: string; title: string }> {
  return page.evaluate(() => {
    // 打码/解锁引导行（Levels.fyi 请求频繁时把值遮成 *** / Add Salary 引导）视为无数据
    const isMasked = (rowText: string) => /unlock by adding|add salary|\*\*\*|\*\*/i.test(rowText);

    const tables = Array.from(document.querySelectorAll('table'));
    const headText = (t: Element) =>
      Array.from(t.querySelectorAll('thead th')).map((h) => (h.textContent || '').trim()).join(' ');

    // 1) 汇总表：列布局固定为 Level Name | Total | Base | Stock | Bonus。
    //    必须逐列校验第 1 列 Level Name、第 2 列 Total、第 3 列 Base——
    //    报告表的表头（Company | Level NameTag | Years | Total Compensation (USD) Base | Stock | Bonus）
    //    会同时包含 Level Name/Total/Base，只做 includes 会把报告表误判成汇总表导致整列错位。
    const summary = tables.find((t) => {
      const heads = Array.from(t.querySelectorAll('thead th')).map((h) => (h.textContent || '').trim());
      return heads.length >= 3 && heads[0].includes('Level Name') && heads[1].includes('Total') && heads[2].includes('Base');
    });
    let levels: SalaryLevelRow[] = [];
    if (summary) {
      levels = Array.from(summary.querySelectorAll('tbody tr')).map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td')).map((c) => (c.textContent || '').trim());
        if (!cells.length || !cells[0]) return null;
        const [raw, total, base, stock, bonus] = cells;
        if (isMasked(cells.join(' '))) return null;
        return {
          level: (raw || '').split('\n')[0].trim(),
          total: total || '',
          base: base || '',
          stock: stock || '',
          bonus: bonus || '',
        };
      }).filter((x): x is SalaryLevelRow => !!x);
    }

    // 2) 兜底：报告表（Level Name + Total Compensation）按级别聚合出 min ~ max
    if (!levels.length) {
      const reports = tables.find((t) => {
        const joined = headText(t);
        return joined.includes('Level Name') && joined.includes('Total Compensation');
      });
      if (reports) {
        // 按表头定位列索引（不同公司报告表列顺序可能不同，不能写死下标）
        const heads = Array.from(reports.querySelectorAll('thead th')).map((h) => (h.textContent || '').trim());
        const idxLevel = heads.findIndex((h) => h.includes('Level Name'));
        const idxTotal = heads.findIndex((h) => h.includes('Total'));
        const agg: Record<string, { totals: number[] }> = {};
        reports.querySelectorAll('tbody tr').forEach((tr) => {
          const cells = Array.from(tr.querySelectorAll('td')).map((c) => (c.textContent || '').trim());
          if (idxLevel < 0 || idxTotal < 0 || cells.length <= Math.max(idxLevel, idxTotal)) return;
          const level = (cells[idxLevel] || '').split('\n')[0].trim();
          const totalRaw = (cells[idxTotal] || '').split('\n')[0] || '';
          if (!level) return;
          if (isMasked(cells.join(' '))) return;
          const num = parseFloat(totalRaw.replace(/[^0-9.]/g, ''));
          (agg[level] = agg[level] || { totals: [] });
          if (!isNaN(num)) agg[level].totals.push(num);
        });
        levels = Object.entries(agg).map(([level, v]) => {
          v.totals.sort((a, b) => a - b);
          const total = v.totals.length
            ? v.totals[0].toLocaleString('en-US') + ' ~ ' + v.totals[v.totals.length - 1].toLocaleString('en-US')
            : '';
          return { level, total, base: '', stock: '', bonus: '' };
        });
        // 级别词校验：页面积载期间的瞬时表格列会错位（级别格混入公司/地点），
        // 只保留短且无 , | 分隔符的级别名，保证兜底数据不出现错位脏数据
        levels = levels.filter((r) => r.level && r.level.length <= 16 && !/[,|]/.test(r.level));
        // 错位时 numbers 解析出的 total 可能落在非数字单元格，低于 2 条真实行则放弃兜底
        if (levels.length < 2) levels = [];
      }
    }

    const title = document.title || '';
    const m = title.match(/Salary\s*\|\s*(.+?)\s*\|\s*Levels\.fyi/i);
    const range = m ? m[1].trim() : '';
    return { levels, range, title };
  });
}

// 提取带重试：Levels.fyi 是 React SSR，domcontentloaded 后汇总表要数秒才渲染完成
// （实测 ~6s），hydration 期间表格布局会有瞬时状态（列错位）。
// 轮询直到「连续两次提取结果一致」才算稳定数据，避免抓到中间态脏数据。
async function extractWithRetry(
  page: Page,
  maxRetryMs: number
): Promise<{ levels: SalaryLevelRow[]; range: string }> {
  const attempts = Math.max(3, Math.ceil(maxRetryMs / 800));
  let last: { levels: SalaryLevelRow[]; range: string } = { levels: [], range: '' };
  let stable: { levels: SalaryLevelRow[]; range: string; hit: boolean } = { levels: [], range: '', hit: false };
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await page.waitForTimeout(800);
    try {
      const r = await extractSalaryPage(page);
      const cur = { levels: r.levels, range: r.range };
      if (r.levels.length && JSON.stringify(cur.levels) === JSON.stringify(last.levels)) {
        stable = { ...cur, hit: true };
        return stable; // 连续两次一致的级别数据，判定为稳定终态
      }
      last = cur;
    } catch {
      // 导航中 context 被销毁，下一轮重试
    }
  }
  // 未满足两次一致：退化为最后一次结果（至少 range 可用），避免返回空
  return stable.hit ? stable : last;
}

// 真实浏览器路径：单浏览器 + 多页面并发池，避免每公司起一个浏览器
async function fetchSalaryRefsWithBrowser(
  jobs: Array<{ name: string; slug: string; url: string }>,
  concurrency: number,
  pageTimeout: number,
  maxRetryMs: number
): Promise<Array<{ name: string; slug: string; ref: CompanySalaryRef | null }>> {
  const browser: Browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  });
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
  });
  const results: Array<{ name: string; slug: string; ref: CompanySalaryRef | null }> = [];
  const queue = [...jobs];
  const worker = async (): Promise<void> => {
    while (queue.length) {
      const job = queue.shift()!;
      const page: Page = await context.newPage();
      let ref: CompanySalaryRef | null = null;
      try {
        await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: pageTimeout });
        const { levels, range } = await extractWithRetry(page, maxRetryMs);
        if (levels.length || range) {
          const currency = /CN¥/.test(levels[0]?.total || range) ? 'CN¥' : '$';
          ref = { company: job.name, slug: job.slug, url: job.url, range, currency, levels };
        }
      } catch (error) {
        console.warn(`[levelsFyi] 抓取 ${job.slug} 失败: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        await page.close().catch(() => {});
      }
      results.push({ name: job.name, slug: job.slug, ref });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  return results;
}

// 主入口：给定搜索结果公司列表，返回可匹配到的公司薪资参考（按职位数取 Top limit 家）。
// 任何一步失败都降级跳过，绝不抛错——薪资参考只是搜索结果的附加信息。
export async function fetchCompanySalaryRefs(
  companies: SalaryRefTarget[],
  opts: SalaryRefOptions = {}
): Promise<CompanySalaryRef[]> {
  const limit = opts.limit ?? 5;
  const concurrency = opts.concurrency ?? 2;
  const pageTimeout = opts.pageTimeout ?? 20000;
  const maxRetryMs = opts.maxRetryMs ?? 8000;
  const cacheTtlMs = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const fetcher = opts.fetcher;

  const picked = pickTopCompanies(companies, limit);
  const now = Date.now();
  const refs: CompanySalaryRef[] = [];
  const pending: Array<{ name: string; slug: string; url: string }> = [];

  for (const t of picked) {
    const slug = resolveCompanySlug(t.name);
    if (!slug) continue;
    const url = `https://www.levels.fyi/companies/${slug}/salaries/software-engineer`;
    const hit = cache.get(slug);
    if (hit && now - hit.ts < cacheTtlMs) {
      if (hit.ref) refs.push(hit.ref);
      continue;
    }
    pending.push({ name: t.name, slug, url });
  }

  if (!pending.length) return refs;

  let results: Array<{ name: string; slug: string; ref: CompanySalaryRef | null }>;
  if (fetcher) {
    // 测试注入路径：单家失败不影响其余（逐家捕获）
    results = await Promise.all(
      pending.map(async (job) => {
        let ref: CompanySalaryRef | null = null;
        try {
          ref = await fetcher(job.slug, job.url);
        } catch (error) {
          console.warn(`[levelsFyi] ${job.slug} 获取失败（忽略）: ${error instanceof Error ? error.message : String(error)}`);
        }
        return { name: job.name, slug: job.slug, ref };
      })
    );
  } else {
    results = await fetchSalaryRefsWithBrowser(pending, concurrency, pageTimeout, maxRetryMs);
  }

  for (const r of results) {
    if (r.ref) refs.push({ ...r.ref, company: r.name });
    cache.set(r.slug, { ts: Date.now(), ref: r.ref });
  }

  return refs;
}
