// 岗位要求总结服务：后端计算 + 前端页面脚本的【单一源码】。
// - 后端：mcp_search_job 等入口直接调用 buildSummary 计算总结数据。
// - 前端：getSummaryCoreSource() 返回本文件纯函数的编译后源码，注入 WEB_UI_HTML，
//   页面脚本不再手工拷贝一份，杜绝前后端逻辑分叉（也避免模板字符串转义问题）。

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
  const isK = /k/i.test(m[3]);
  if (isK) { lo = lo / 10; hi = hi / 10; }   // K → 万（月薪）
  // 年薪标记（年/薪）仅在单位为万时生效；K 一律按月薪 ×12 折成年薪
  const annual = !isK && /年|薪/.test(str);
  if (!annual) { lo *= 12; hi *= 12; }
  if (lo > hi) { const t = lo; lo = hi; hi = t; }
  return { lo, hi, mid: (lo + hi) / 2, text: str };
}

export function fmtWan(n: number): string {
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
  // 非技能词：公司福利/补贴/假期/作息/培训福利/经验学历等，常被招聘网站混入职位标签（如 51job 的公司标签），
  // 但不是岗位技能，统计「技能要求」时排除，避免 五险一金、带薪年假 等污染技能 Top。
  // 注意：必须定义在函数内部，才能随 getSummaryCoreSource() 序列化注入前端页面，保证前后端同一份逻辑。
  const NON_SKILL_TAGS = new Set([
    // 保险福利
    '五险一金', '六险一金', '五险', '社保', '住房公积金', '公积金', '补充公积金', '补充医疗保险', '商业保险', '医疗保险', '意外险',
    // 体检
    '定期体检', '年度体检', '健康体检', '免费体检', '体检',
    // 奖金激励
    '绩效奖金', '年终奖', '年终奖金', '季度奖金', '项目奖金', '全勤奖', '奖金', '十三薪', '十四薪', '股票期权', '期权', '股权激励',
    // 作息
    '周末双休', '双休', '大小周', '弹性工作', '弹性工作制', '早九晚六', '朝九晚六', '加班少', '不加班', '加班补贴', '加班补助',
    // 假期
    '带薪年假', '带薪病假', '年假', '法定节假日', '法定假日', '节假日',
    // 补贴
    '餐饮补贴', '餐补', '交通补贴', '交通补助', '通讯补贴', '话费补贴', '住房补贴', '租房补贴', '房补', '出差补贴', '高温补贴', '电脑补贴',
    '包吃', '包住', '包食宿', '免费班车', '班车', '员工食堂', '食堂', '下午茶', '免费下午茶', '零食',
    // 员工活动福利
    '员工旅游', '员工活动', '定期团建', '团建', '年会', '节日福利', '节日礼品', '节日礼物', '生日福利', '生日会', '健身房', '免费健身房', '出国机会',
    // 培训/晋升（泛化表述，非具体技能）
    '专业培训', '内部培训', '带薪培训', '技能培训', '入职培训', '岗前培训', '培训',
    '职业发展', '晋升空间大', '晋升通道', '晋升机制', '晋升快', '发展空间大', '成长空间', '成长空间大', '持续优化', '学习氛围好', '工作氛围好',
    // 经验/学历
    '本科', '硕士', '博士', '大专', '学历', '经验不限', '应届生', '在校生', '应届', '全职', '兼职', '实习',
    '1年以下', '1-3年', '3-5年', '5-10年', '10年以上', '1-3年经验', '3-5年经验', '5-10年经验',
    // 岗位类型（实习僧等站点）
    '可转正实习', '可转正',
    // 通用领域词（非具体技能）
    '计算机', '电子', '通信', '软件',
  ]);
  // 福利词特征模式：招聘网站福利标签变体极多（五险二金/做五休二/节假日福利/婚假/月度绩效奖金 …），
  // 精确词表覆盖不全，用特征词根匹配兜底过滤。注意避开 测试/设计/运维/数据库 等真实技能词根。
  const NON_SKILL_PATTERNS = [
    /险/,                                   // 保险：五险一金/意外险/商业保险/补充医疗保险 …
    /假/,                                   // 假期：带薪年假/婚假/产假/护理假/丧假/年休假/节假日 …
    /(补贴|餐补|房补|车补|房帖)/,            // 各类补贴
    /(公积金|一金|二金)/,                    // 住房公积金/全额公积金 …
    /(团建|体检|班车|食堂|下午茶|零食|健身房)/, // 福利设施/活动
    /(奖金|年终|期权|股权|分红)/,            // 金钱激励
    /(福利|过节|生日|年会)/,                // 福利活动
    /(双休|五休二|大小周|弹性工作|加班)/,     // 作息
    /(带薪|休假|年假)/,                     // 带薪休假
    /(社保|五险|六险)/,                     // 社保（与 /险/ 冗余，保精确）
    /(培训|晋升|职业发展|发展空间|成长空间|持续优化)/, // 培训/发展泛词
    /(包吃|包住|包食宿|食宿|旅游|出游|出国机会)/,     // 食宿/旅游
    /(生育|产检|婚育)/,                     // 婚育福利
    /(实习|可转正|全职|兼职|应届|在校生|经验不限|学历)/, // 岗位类型/经验学历
    /(本科|硕士|博士|大专)/,                // 学历
  ];
  // 岗位角色后缀：前端开发/后端工程师/产品经理 等岗位名称标签，不是技能
  const ROLE_SUFFIX = /(开发|工程师|架构师|设计师|专员|经理|主管|顾问|专家)$/;
  const sum: Summary = {
    total: jobs.length, sources: {}, skills: {}, companies: {}, groups: {},
    salaries: [], bands: { '<10万': 0, '10-20万': 0, '20-30万': 0, '30-50万': 0, '50万+': 0 },
    topSkills: [], topCompanies: [], groupList: [],
  };

  jobs.forEach((j) => {
    const src = j.source || '未知来源';
    sum.sources[src] = (sum.sources[src] || 0) + 1;
    const tags = (Array.isArray(j.tags) ? (j.tags as string[]) : [])
      .map((t) => String(t).trim())
      .filter((t) => t && !NON_SKILL_TAGS.has(t) && !ROLE_SUFFIX.test(t) && !NON_SKILL_PATTERNS.some((re) => re.test(t)));
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
    // 列出该岗位的全部技能（按出现次数降序），不截断 Top5，满足「不同岗位的要求技能都保存下来」
    const skills = Object.entries(g.skills).sort((a, b) => b[1] - a[1]).map((x) => x[0]).join('、') || '—';
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

// 把总结纯函数（parseSalary/fmtWan/normalizeTitle/buildSummary）的编译后源码拼接为字符串，
// 供 src/mcp.ts 注入页面内嵌脚本——页面与后端共用同一份逻辑实现。
// buildSummary 内部依赖的 parseSalary/fmtWan/normalizeTitle 均为函数声明，注入后提升可用。
export function getSummaryCoreSource(): string {
  return [parseSalary, fmtWan, normalizeTitle, buildSummary]
    .map((fn) => fn.toString())
    .join('\n');
}
