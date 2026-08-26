import { describe, it, expect } from 'vitest';
import { WEB_UI_HTML } from '../src/mcp';
import { evalPageFns } from './helpers';
import {
  parseSalary as backendParseSalary,
  normalizeTitle as backendNormalizeTitle,
  buildSummary as backendBuildSummary,
} from '../src/services/summaryService';

// 页面内嵌前端逻辑（模板字符串里的那段脚本）——转义类回归主要风险点
const page = evalPageFns(WEB_UI_HTML);

// 样例职位：覆盖 前端系合并 / K 与万 / 年与薪标记 / 无标签
const jobs = [
  { title: '前端开发', salary: '20-30万', company: 'A公司', address: '北京', source: '51job', tags: ['Vue', 'TypeScript'] },
  { title: 'Web前端工程师', salary: '25-35万·13薪', company: 'A公司', address: '深圳', source: 'zhaopin-jobs', tags: ['React'] },
  { title: '中级web前端开发工程师', salary: '2-3万', company: 'B公司', address: '杭州', source: 'shixiseng', tags: ['Vue', 'CSS'] },
  { title: 'Java后端开发工程师', salary: '35-50万/年', company: 'C公司', address: '上海', source: '51job', tags: ['Java', 'Spring'] },
  { title: '前端', salary: '30-40K·14薪', company: 'A公司', address: '广州', source: 'zhaopin-jobs', tags: [] },
];

describe('前端 parseSalary（转义防线：\d/\s 被吞则此处数值全错）', () => {
  it('无 年/薪 标记的万按 月薪×12 折成年薪', () => {
    expect(page.parseSalary('20-30万')).toEqual({ lo: 240, hi: 360, mid: 300, text: '20-30万' });
  });

  it('带 年/薪 标记按年薪', () => {
    expect(page.parseSalary('25-35万·13薪')).toEqual({ lo: 25, hi: 35, mid: 30, text: '25-35万·13薪' });
    expect(page.parseSalary('30-40万/年')).toEqual({ lo: 30, hi: 40, mid: 35, text: '30-40万/年' });
  });

  it('K 单位 ÷10 后按 月薪×12', () => {
    expect(page.parseSalary('15-25K')).toEqual({ lo: 18, hi: 30, mid: 24, text: '15-25K' });
  });

  it('K 带 薪 标记仍是月薪：30-40K·14薪 → ×12 折成年薪 36-48万', () => {
    expect(page.parseSalary('30-40K·14薪')).toEqual({ lo: 36, hi: 48, mid: 42, text: '30-40K·14薪' });
  });

  it('支持 ~ / 至 分隔符与反序区间', () => {
    expect(page.parseSalary('20~30万')).toEqual({ lo: 240, hi: 360, mid: 300, text: '20~30万' });
    expect(page.parseSalary('20至30万')).toEqual({ lo: 240, hi: 360, mid: 300, text: '20至30万' });
    expect(page.parseSalary('40-30万')).toEqual({ lo: 360, hi: 480, mid: 420, text: '40-30万' });
  });

  it('不可解析返回 null', () => {
    expect(page.parseSalary('面议')).toBeNull();
    expect(page.parseSalary('10万以上')).toBeNull();
    expect(page.parseSalary('')).toBeNull();
    expect(page.parseSalary(null)).toBeNull();
    expect(page.parseSalary(undefined)).toBeNull();
  });
});

describe('前端 buildSummary', () => {
  const sum = page.buildSummary(jobs);

  it('总数与来源统计', () => {
    expect(sum.total).toBe(5);
    expect(sum.sources).toEqual({ '51job': 2, 'zhaopin-jobs': 2, 'shixiseng': 1 });
  });

  it('技能 Top 按出现次数排序', () => {
    expect(sum.topSkills[0]).toEqual(['Vue', 2]);
    expect(sum.topSkills).toHaveLength(6);
  });

  it('薪资 band 分布与整体区间/中位数', () => {
    expect(sum.salaries.length).toBe(5);
    expect(sum.bands).toEqual({ '<10万': 0, '10-20万': 0, '20-30万': 0, '30-50万': 4, '50万+': 1 });
    expect(sum.salaryMin).toBe(30);
    expect(sum.salaryMax).toBe(300);
    expect(sum.salaryMedian).toBe(42);
  });

  it('前端系标题归一为一组，含薪资区间/中位数/技能', () => {
    expect(sum.groupList).toHaveLength(2);
    const front = sum.groupList.find((g) => g.title === '前端');
    expect(front).toBeTruthy();
    expect(front!.count).toBe(4);
    expect(front!.salary).toBe('30万 ~ 300万');
    expect(front!.salaryMedian).toBe('36万');
    expect(front!.skills).toBe('Vue、TypeScript、React、CSS');
    // 按职位数降序
    expect(sum.groupList[0].title).toBe('前端');
  });

  it('岗位分组的 skills 列出全部技能（不截断 Top 5）', () => {
    const many = [
      { title: '前端开发', salary: '20-30万', source: '51job', tags: ['Vue', 'React', 'TS', 'CSS', 'HTML', 'Node', 'Webpack'] },
    ];
    const s = page.buildSummary(many);
    const front = s.groupList.find((g) => g.title === '前端');
    expect(front).toBeTruthy();
    expect(front!.skills.split('、')).toHaveLength(7);
    expect(front!.skills).toBe('Vue、React、TS、CSS、HTML、Node、Webpack');
  });

  it('空职位列表返回空结构（无 NaN）', () => {
    const empty = page.buildSummary([]);
    expect(empty.total).toBe(0);
    expect(empty.groupList).toEqual([]);
    expect(empty.topSkills).toEqual([]);
    expect(empty.salaryMin).toBeUndefined();
  });
});

describe('技能要求排除福利/非技能词（五险一金、带薪年假 等不污染技能 Top）', () => {
  const welfareJobs = [
    { title: '前端开发', salary: '20-30万', company: 'A公司', source: '51job', tags: ['Vue', '五险一金', '带薪年假', '绩效奖金', '周末双休', '节日福利'] },
    { title: '后端开发', salary: '30-40万', company: 'B公司', source: 'zhaopin-jobs', tags: ['Java', '定期体检', '弹性工作', '股票期权', '本科', '1-3年', '免费班车', '专业培训'] },
    { title: '算法工程师', salary: '40-60万', company: 'C公司', source: 'liepin', tags: ['PyTorch', 'AI', '人工智能', 'DeepSpeed', '云计算'] },
  ];

  it('topSkills 只保留真正的技能，福利/补贴/经验学历词全部排除', () => {
    const sum = page.buildSummary(welfareJobs);
    const names = sum.topSkills.map(([t]) => t);
    expect(names).not.toContain('五险一金');
    expect(names).not.toContain('带薪年假');
    expect(names).not.toContain('绩效奖金');
    expect(names).not.toContain('定期体检');
    expect(names).not.toContain('股票期权');
    expect(names).not.toContain('本科');
    expect(names).not.toContain('1-3年');
    expect(names).not.toContain('免费班车');
    expect(names).not.toContain('专业培训');
    expect(names).toContain('Vue');
    expect(names).toContain('Java');
    expect(names).toContain('PyTorch');
    expect(names).toContain('AI');
    expect(names).toContain('云计算');
  });

  it('岗位分组 skills 同样排除福利词，仅保留技能', () => {
    const sum = page.buildSummary(welfareJobs);
    const front = sum.groupList.find((g) => g.title === '前端');
    expect(front).toBeTruthy();
    expect(front!.skills).toBe('Vue');
    const algo = sum.groupList.find((g) => g.title === '算法');
    expect(algo!.skills.split('、')).toEqual(['PyTorch', 'AI', '人工智能', 'DeepSpeed', '云计算']);
  });

  it('岗位角色后缀/空白/岗位类型/通用领域词同样不进入技能统计', () => {
    const jobs2 = [
      { title: '前端开发', salary: '20-30万', source: '51job', tags: ['Vue', '前端开发', '计算机', '软件', '  '] },
      { title: '后端开发', salary: '30-40万', source: 'shixiseng', tags: ['Java', '可转正实习', '', '后端工程师', '产品经理'] },
    ];
    const sum = page.buildSummary(jobs2);
    const names = sum.topSkills.map(([t]) => t);
    expect(names).toEqual(['Vue', 'Java']);
    const front = sum.groupList.find((g) => g.title === '前端');
    expect(front!.skills).toBe('Vue');
    expect(sum.skills['前端开发']).toBeUndefined();
    expect(sum.skills['']).toBeUndefined();
  });

  it('福利词变体（模式匹配）：五险二金/做五休二/节假日福利/婚假/月度绩效奖金/带薪休假 全部排除', () => {
    const jobs3 = [
      { title: '前端开发', salary: '20-30万', source: '51job', tags: ['Vue', '做五休二', '节假日福利', '五险二金', '全额公积金', '季度团建'] },
      { title: '后端开发', salary: '30-40万', source: 'zhaopin-jobs', tags: ['Java', '婚假', '月度绩效奖金', '带薪休假', '员工团建', '生育'] },
    ];
    const sum = page.buildSummary(jobs3);
    const names = sum.topSkills.map(([t]) => t);
    expect(names).toEqual(['Vue', 'Java']);
    ['做五休二', '节假日福利', '五险二金', '全额公积金', '季度团建', '婚假', '月度绩效奖金', '带薪休假', '员工团建', '生育'].forEach((w) => {
      expect(sum.skills[w]).toBeUndefined();
    });
    // 真实技能不受影响
    expect(sum.skills['Vue']).toBe(1);
    expect(sum.skills['Java']).toBe(1);
  });

  it('测试/设计/运维/数据库 等真实技能词根不被误伤', () => {
    const jobs4 = [
      { title: '测试开发', salary: '20-30万', source: '51job', tags: ['测试', '自动化测试', '软件测试'] },
      { title: '设计', salary: '20-30万', source: 'zhaopin-jobs', tags: ['UI设计', '设计'] },
      { title: '运维', salary: '20-30万', source: 'liepin', tags: ['运维', '数据库', 'SQL'] },
    ];
    const sum = page.buildSummary(jobs4);
    const names = sum.topSkills.map(([t]) => t);
    ['测试', '自动化测试', '软件测试', 'UI设计', '设计', '运维', '数据库', 'SQL'].forEach((w) => {
      expect(sum.skills[w]).toBe(1);
    });
  });

  it('后端与前端输出一致（防分叉）', () => {
    expect(backendBuildSummary(welfareJobs)).toEqual(page.buildSummary(welfareJobs));
  });
});

describe('前端 buildMarkdown / mdTable（转义防线：\n 被吞则表格连成一行）', () => {
  const sum = page.buildSummary(jobs);
  const md = page.buildMarkdown(sum, jobs);

  it('mdTable 产出真实换行（\n 转义存活）', () => {
    expect(page.mdTable(['a', 'b'], [['x', 'y']])).toBe('| a | b |\n| --- | --- |\n| x | y |');
  });

  it('包含全部总结章节与薪资中位数列', () => {
    expect(md).toContain('# 🎯 岗位搜索结果总结');
    expect(md).toContain('## 📊 总结');
    expect(md).toContain('### 💰 薪资概览（万/年，月薪按 ×12 折算）');
    expect(md).toContain('### 🛠 技能要求 Top');
    expect(md).toContain('### 🧭 不同岗位（要求/技能/薪资）');
    expect(md).toContain('### 🏢 热门公司');
    expect(md).toContain('## 📋 职位列表');
    expect(md).toContain('薪资中位数');
  });

  it('岗位分组表包含合并后的前端行（职位数/薪资区间/中位数/技能）', () => {
    expect(md).toContain('| 前端 | 4 | 30万 ~ 300万 | 36万 | Vue、TypeScript、React、CSS |');
    expect(md).toContain('| 可解析薪资职位 | 5 / 5 |');
  });

  it('职位列表表格行列结构完整', () => {
    // 只取“职位列表”章节内的表格行（md 前面还有薪资/技能/分组等表格）
    const jobSection = md.split('## 📋 职位列表（')[1] || '';
    const lines = jobSection.split('\n').filter((l) => l.startsWith('|'));
    // 表头 + 分隔行 + 每职位一行
    expect(lines.length).toBe(2 + jobs.length);
    const cols = (l: string) => l.replace(/\\\|/g, '').split('|').length;
    const headerCols = cols(lines[0]);
    expect(headerCols).toBe(8); // 6 列表格：| 职位 | 公司 | 薪资 | 地点 | 来源 | 详情 |
    lines.forEach((l) => expect(cols(l)).toBe(headerCols));
  });

  it('单元格中的竖线被转义，不破坏表格', () => {
    const pipeJobs = [
      { title: '前端|小程序开发', salary: '20-30万', company: 'A|B公司', address: '北京', source: '51job', tags: [] },
    ];
    const md2 = page.buildMarkdown(page.buildSummary(pipeJobs), pipeJobs);
    expect(md2).toContain('前端\\|小程序开发');
    expect(md2).toContain('A\\|B公司');
  });
});

describe('Web 导出：脏数据（| 与换行）', () => {
  const dirtyJobs = [
    { title: '前端|小程序\n（急招）', salary: '20-30万', company: 'A|B 公司', address: '北京\n海淀', source: '51job', tags: ['Vue\n框架', 'React'], jobDetail: 'https://x/job/1' },
    { title: '后端开发', salary: '30-40万', company: 'C公司', address: '上海', source: 'zhaopin-jobs', tags: [], jobDetail: '' },
  ];

  it('csvCell 对 |、逗号、引号、换行正确加引号转义', () => {
    expect(page.csvCell('前端|小程序')).toBe('"前端|小程序"');
    expect(page.csvCell('前端,小程序')).toBe('"前端,小程序"');
    expect(page.csvCell('前端"开发')).toBe('"前端""开发"');
    expect(page.csvCell('前端\n开发')).toBe('"前端\n开发"');
    expect(page.csvCell(['Vue', 'React'])).toBe('"Vue | React"');
    expect(page.csvCell(undefined)).toBe('""');
    expect(page.csvCell(null)).toBe('""');
  });

  it('CSV 行：脏数据各字段均被引号包裹且内容完整保留', () => {
    const job0 = dirtyJobs[0] as Record<string, unknown>;
    const cells = ['title', 'company', 'salary', 'address', 'jobDetail', 'tags', 'source'].map((f) => page.csvCell(job0[f]));
    expect(cells).toHaveLength(7);
    cells.forEach((c) => {
      expect(c.startsWith('"')).toBe(true);
      expect(c.endsWith('"')).toBe(true);
    });
    expect(cells[0]).toBe('"前端|小程序\n（急招）"');
    expect(cells[3]).toBe('"北京\n海淀"');
    expect(cells[5]).toBe('"Vue\n框架 | React"');
  });

  it('buildMarkdown：| 转义、换行折叠，职位表格结构不被破坏', () => {
    const md = page.buildMarkdown(page.buildSummary(dirtyJobs), dirtyJobs);
    expect(md).toContain('前端\\|小程序 （急招）');
    expect(md).toContain('A\\|B 公司');
    expect(md).toContain('北京 海淀');
    const jobSection = md.split('## 📋 职位列表（')[1] || '';
    const lines = jobSection.split('\n').filter((l) => l.startsWith('|'));
    expect(lines.length).toBe(2 + dirtyJobs.length);
    const cols = (l: string) => l.replace(/\\\|/g, '').split('|').length;
    const headerCols = cols(lines[0]);
    expect(headerCols).toBe(8);
    lines.forEach((l) => expect(cols(l)).toBe(headerCols));
  });
});

describe('单一源码（页面脚本由 summaryService 生成注入）', () => {
  it('页面中 parseSalary/buildSummary 各仅一份定义，且与后端源码一致', () => {
    // 注入方式：getSummaryCoreSource() 把 summaryService 编译后源码拼进页面脚本
    const defs = (WEB_UI_HTML.match(/function buildSummary\(/g) || []).length;
    expect(defs).toBe(1);
    expect((WEB_UI_HTML.match(/function parseSalary\(/g) || []).length).toBe(1);
    // 页面内嵌的 buildSummary 源码与后端函数源码逐字一致（不是手工拷贝）
    expect(WEB_UI_HTML).toContain(backendBuildSummary.toString().slice(0, 80));
  });
});

describe('转义回归防线', () => {
  it('脚本若含真实换行（模板字符串吞掉 \\n）则立即报错', () => {
    // 模拟历史 bug：模板字符串把 L.join('\n') 的转义吞成真实换行 → 整段脚本语法错误
    const buggy = WEB_UI_HTML.replace("L.join('\\n')", "L.join('\n')");
    expect(() => evalPageFns(buggy)).toThrow();
  });
});

describe('后端 summaryService（与前端逻辑一致）', () => {
  it('parseSalary 与前端输出一致', () => {
    const inputs = ['20-30万', '25-35万·13薪', '30-40万/年', '15-25K', '30-40K·14薪', '40-30万', '面议', '', null, undefined];
    inputs.forEach((s) => {
      expect(backendParseSalary(s)).toEqual(page.parseSalary(s));
    });
  });

  it('normalizeTitle 与前端输出一致', () => {
    const titles = ['前端', '前端开发', 'Web前端', 'web前端', '前端开发工程师', '中级web前端开发工程师', '前端开发-证券项目', 'WebGL开发', 'Java后端开发', '前端ui设计师', ''];
    titles.forEach((t) => {
      expect(backendNormalizeTitle(t)).toBe(page.normalizeTitle(t));
    });
  });

  it('buildSummary 与前端输出一致（防分叉）', () => {
    expect(backendBuildSummary(jobs)).toEqual(page.buildSummary(jobs));
  });
});
