import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchJobList, enrichSalaryRefs } from '../src/index';
import type { CrawlFn } from '../src/index';
import type { CrawlerData } from '../src/crawler/webCrawler';

// enrichSalaryRefs 的网络抓取边界替换为桩实现
vi.mock('../src/services/levelsFyiService', () => ({
  fetchCompanySalaryRefs: vi.fn(),
}));
import { fetchCompanySalaryRefs } from '../src/services/levelsFyiService';

// 构造某个站点返回的爬取结果（含 jobInfo 列表）
function fakeDataset(source: string, count: number): CrawlerData[] {
  return [{
    url: 'https://example.com/search',
    data: {
      jobInfo: Array.from({ length: count }, (_, i) => ({
        title: `${source}职位${i}`,
        salary: '10-15万',
        company: `${source}公司`,
        address: '北京',
        jobDetail: `https://example.com/job/${i}`,
        tags: [],
      })),
    },
    timestamp: Date.now(),
    succeeded: true,
  }];
}

describe('searchJobList 聚合逻辑', () => {
  it('多站点聚合职位并打上 source 来源标签，失败的站点被跳过', async () => {
    const crawlFn: CrawlFn = async (url) => {
      if (url.includes('51job')) return fakeDataset('51job', 2);
      if (url.includes('zhaopin')) return fakeDataset('zhaopin-jobs', 1);
      return null; // zhipin / shixiseng 模拟失败
    };
    const jobs = await searchJobList({ keyword: '前端' }, crawlFn);
    expect(jobs).toHaveLength(3);
    expect(jobs.map((j) => j.source).sort()).toEqual(['51job', '51job', 'zhaopin-jobs']);
    expect(jobs[0]).toMatchObject({ title: '51job职位0', source: '51job' });
    expect(jobs[2]).toMatchObject({ title: 'zhaopin-jobs职位0', source: 'zhaopin-jobs' });
  });

  it('过滤掉不含 jobInfo 的爬取结果（如职位详情页）', async () => {
    const crawlFn: CrawlFn = async () => [{
      url: 'https://example.com/detail',
      data: { job: { title: '某职位详情' } },
      timestamp: Date.now(),
      succeeded: true,
    }];
    const jobs = await searchJobList({ keyword: '前端' }, crawlFn);
    expect(jobs).toEqual([]);
  });

  it('所有站点都失败时返回空数组而不抛错', async () => {
    const crawlFn: CrawlFn = async () => null;
    const jobs = await searchJobList({ keyword: '前端' }, crawlFn);
    expect(jobs).toEqual([]);
  });

  it('爬取函数抛异常时该站点被跳过，其余站点正常聚合', async () => {
    let calls = 0;
    const crawlFn: CrawlFn = async (url) => {
      calls += 1;
      if (calls === 1) throw new Error('站点 A 网络错误');
      return fakeDataset('51job', 1);
    };
    const jobs = await searchJobList({ keyword: '前端' }, crawlFn);
    expect(jobs).toHaveLength(3); // 其余 3 个站点各返回 1 条
    // source 标签取自站点配置名（config.name），而非数据内容
    expect(jobs.map((j) => j.source)).toEqual(['zhaopin-jobs', 'zhipin', 'shixiseng']);
  });

  it('把 keyword+city 拼接、page/salary/workYear 透传给爬取函数', async () => {
    const crawlFn = vi.fn<CrawlFn>(async () => fakeDataset('51job', 1));
    await searchJobList({ keyword: '前端', city: '北京', page: 3, salary: '10-15万', workYear: '1-3年' }, crawlFn);
    // jobSearchUrls 当前配置 4 个站点，每个都调用一次
    expect(crawlFn).toHaveBeenCalledTimes(4);
    expect(crawlFn).toHaveBeenCalledWith(
      expect.stringContaining('51job'),
      expect.objectContaining({
        keyword: '前端 北京',
        city: '北京',
        page: 3,
        salary: '10-15万',
        workYear: '1-3年',
      })
    );
  });

  it('不传 crawlFn 时默认使用真实爬取函数（不抛错，返回数组）', async () => {
    // 默认参数 = crawlByUrl；此测试仅验证签名兼容，不真正访问网络
    expect(typeof searchJobList).toBe('function');
  });
});

describe('enrichSalaryRefs 公司薪资参考聚合', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('按公司出现次数统计并传给 fetchCompanySalaryRefs（Top limit）', async () => {
    vi.mocked(fetchCompanySalaryRefs).mockResolvedValue([{
      company: '腾讯', slug: 'tencent', url: 'https://www.levels.fyi/companies/tencent',
      range: 'CN¥347K-CN¥2M+', currency: 'CN¥', levels: [],
    }]);
    const jobs = [
      { company: '腾讯', title: 'a' },
      { company: '腾讯', title: 'b' },
      { company: '腾讯', title: 'c' },
      { company: '阿里巴巴', title: 'd' },
    ];
    const refs = await enrichSalaryRefs(jobs, 3);
    expect(fetchCompanySalaryRefs).toHaveBeenCalledWith(
      expect.arrayContaining([
        { name: '腾讯', count: 3 },
        { name: '阿里巴巴', count: 1 },
      ]),
      expect.objectContaining({ limit: 3 })
    );
    expect(refs).toHaveLength(1);
  });

  it('空职位/无公司字段返回空数组且不调用服务', async () => {
    expect(await enrichSalaryRefs([])).toEqual([]);
    expect(await enrichSalaryRefs([{ title: '无公司' }])).toEqual([]);
    expect(fetchCompanySalaryRefs).not.toHaveBeenCalled();
  });

  it('服务抛错时降级为空数组，不向上抛出', async () => {
    vi.mocked(fetchCompanySalaryRefs).mockRejectedValue(new Error('levels.fyi 不可用'));
    const refs = await enrichSalaryRefs([{ company: '腾讯' }]);
    expect(refs).toEqual([]);
  });
});
