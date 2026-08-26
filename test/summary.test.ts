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

  it('空职位列表返回空结构（无 NaN）', () => {
    const empty = page.buildSummary([]);
    expect(empty.total).toBe(0);
    expect(empty.groupList).toEqual([]);
    expect(empty.topSkills).toEqual([]);
    expect(empty.salaryMin).toBeUndefined();
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
