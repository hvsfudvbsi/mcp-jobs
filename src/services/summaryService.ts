// 岗位要求总结服务：与 Web 页面内嵌的前端逻辑保持一一对应（见 src/mcp.ts WEB_UI_HTML）
// 供 mcp_search_job 等后端入口直接计算总结数据，避免重复实现造成分叉。
// 注意：修改此处逻辑时，必须同步更新前端内嵌的同名函数。

export interface ParsedSalary {
  lo: number;
  hi: number;
  mid: number;
  text: string;
}

export interface SummaryGroupAcc {
  title: string;
  count: number;
  salaries: ParsedSalary[];
  skills: Record<string, number>;
}

export interface SummaryGroup {
  title: string;
  count: number;
  salary: string;
  salaryMedian: string;
  skills: string;
}

export interface Summary {
  total: number;
  sources: Record<string, number>;
  skills: Record<string, number>;
  companies: Record<string, number>;
  groups: Record<string, SummaryGroupAcc>;
  salaries: number[];
  bands: Record<string, number>;
  topSkills: [string, number][];
  topCompanies: [string, number][];
  groupList: SummaryGroup[];
  salaryMin?: number;
  salaryMax?: number;
  salaryMedian?: number;
}

export interface JobItem {
  title?: string;
  salary?: string | null;
  company?: string;
  tags?: unknown;
  source?: string;
  [key: string]: unknown;
}

// 解析薪资文本为年薪区间（万/年）："2-4万·14薪"/"25-38万/年" → 年薪；"2-4万"/"15-25K" 视为月薪 ×12 折算
export function parseSalary(s: string | null | undefined): ParsedSalary | null {
  if (!s) return null;
  const str = String(s);
  const m = str.match(/(\d+(?:\.\d+)?)\s*[-~至]\s*(\d+(?:\.\d+)?)\s*(万|k|K)/);
  if (!m) return null;
  let lo = parseFloat(m[1]);
  let hi = parseFloat(m[2]);
  const annual = /年|薪/.test(str);
  const isK = /k/i.test(m[3]);
  if (isK) { lo = lo / 10; hi = hi / 10; }   // K → 万（月薪）
  if (!annual) { lo *= 12; hi *= 12; }       // 默认月薪，×12 折成年薪
  if (lo > hi) { const t = lo; lo = hi; hi = t; }
  return { lo, hi, mid: (lo + hi) / 2, text: str };
}

function fmtWan(n: number): string {
  return (Math.round(n * 10) / 10) + '万';
}

// 职位标题归一化：转小写 + 去级别/括号/前后缀词，合并 前端/前端开发/Web前端 等同类岗位
export function normalizeTitle(t: string | null | undefined): string {
  let s = String(t || '').trim().toLowerCase();
  // 去掉括号内容（含中文括号/方括号）
  s = s.replace(/[（(【].*?[)）】]/g, ' ');
  // 分隔符统一替换为空格（中文竖线｜、顿号等）
  s = s.replace(/[｜|/_、·,，:：-]+/g, ' ');
  s = s.replace(/[ ]+/g, ' ');
  // 去掉级别/前缀词（实习生 需在 实习 前，保证整词移除）
  s = s.replace(/(高级|资深|初级|中级|主任|首席|实习生|实习|应届|助理|校招|社招)/g, ' ');
  s = s.trim();
  // 去掉 web 前缀（允许空格，仅当后接中文，避免误伤 webgl 等）
  s = s.replace(/^web[ ]*(?=[\u4e00-\u9fa5])/, '');
  s = s.trim();
  // 循环剥除岗位后缀，聚合同类岗位方向
  s = s.replace(/(开发工程师|研发工程师|软件工程师|工程师|设计师|开发|专员|经理|主管|运维|测试|设计|运营|顾问|专家)$/, '');
  s = s.replace(/(开发工程师|研发工程师|软件工程师|工程师|设计师|开发|专员|经理|主管|运维|测试|设计|运营|顾问|专家)$/, '');
  // 分隔符后的次要描述（如 -证券项目、｜小程序）不参与分组，取第一个词作为岗位方向
  s = s.split(' ')[0];
  s = s.replace(/(开发工程师|研发工程师|软件工程师|工程师|设计师|开发|专员|经理|主管|运维|测试|设计|运营|顾问|专家)$/, '');
  return s.trim() || '其他';
}

// 汇总职位列表：技能 Top、薪资分布/区间/中位数、不同岗位分组（要求/技能/薪资）、热门公司
export function buildSummary(jobs: JobItem[]): Summary {
  const sum: Summary = {
    total: jobs.length, sources: {}, skills: {}, companies: {}, groups: {},
    salaries: [], bands: { '<10万': 0, '10-20万': 0, '20-30万': 0, '30-50万': 0, '50万+': 0 },
    topSkills: [], topCompanies: [], groupList: [],
  };

  jobs.forEach((j) => {
    const src = j.source || '未知来源';
    sum.sources[src] = (sum.sources[src] || 0) + 1;
    const tags = Array.isArray(j.tags) ? (j.tags as string[]) : [];
    tags.forEach((t) => { sum.skills[t] = (sum.skills[t] || 0) + 1; });
    const co = j.company || '未知公司';
    sum.companies[co] = (sum.companies[co] || 0) + 1;
    const g = normalizeTitle(j.title);
    const grp = (sum.groups[g] = sum.groups[g] || { title: g, count: 0, salaries: [], skills: {} });
    grp.count++;
    tags.forEach((t) => { grp.skills[t] = (grp.skills[t] || 0) + 1; });
    const p = parseSalary(j.salary);
    if (p) {
      sum.salaries.push(p.mid);
      grp.salaries.push(p);
      if (p.mid < 10) sum.bands['<10万']++;
      else if (p.mid < 20) sum.bands['10-20万']++;
      else if (p.mid < 30) sum.bands['20-30万']++;
      else if (p.mid < 50) sum.bands['30-50万']++;
      else sum.bands['50万+']++;
    }
  });

  sum.topSkills = Object.entries(sum.skills).sort((a, b) => b[1] - a[1]).slice(0, 10);
  sum.topCompanies = Object.entries(sum.companies).sort((a, b) => b[1] - a[1]).slice(0, 5);
  sum.groupList = Object.values(sum.groups).map((g) => {
    const mids = g.salaries.map((x) => x.mid).sort((a, b) => a - b);
    const lo = mids.length ? fmtWan(mids[0]) : '—';
    const hi = mids.length ? fmtWan(mids[mids.length - 1]) : '';
    let med = '—';
    if (mids.length) {
      const mi = Math.floor(mids.length / 2);
      med = fmtWan(mids.length % 2 ? mids[mi] : (mids[mi - 1] + mids[mi]) / 2);
    }
    const skills = Object.entries(g.skills).sort((a, b) => b[1] - a[1]).slice(0, 5).map((x) => x[0]).join('、') || '—';
    return { title: g.title, count: g.count, salary: mids.length ? lo + ' ~ ' + hi : '—', salaryMedian: med, skills };
  }).sort((a, b) => b.count - a.count);

  if (sum.salaries.length) {
    sum.salaries.sort((a, b) => a - b);
    sum.salaryMin = sum.salaries[0];
    sum.salaryMax = sum.salaries[sum.salaries.length - 1];
    const m = Math.floor(sum.salaries.length / 2);
    sum.salaryMedian = sum.salaries.length % 2 ? sum.salaries[m] : (sum.salaries[m - 1] + sum.salaries[m]) / 2;
  }
  return sum;
}
