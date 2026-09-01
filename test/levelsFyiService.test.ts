import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveCompanySlug,
  pickTopCompanies,
  fetchCompanySalaryRefs,
  normalizeRole,
  clearSalaryRefCache,
  CompanySalaryRef,
} from '../src/services/levelsFyiService';

describe('resolveCompanySlug 公司名 → slug 映射', () => {
  it('中文大厂命中别名表（含公司全称/别名）', () => {
    expect(resolveCompanySlug('腾讯')).toBe('tencent');
    expect(resolveCompanySlug('腾讯科技（深圳）有限公司')).toBe('tencent');
    expect(resolveCompanySlug('阿里巴巴')).toBe('alibaba');
    expect(resolveCompanySlug('北京阿里巴巴云计算技术有限公司')).toBe('alibaba');
    expect(resolveCompanySlug('字节跳动')).toBe('bytedance');
    expect(resolveCompanySlug('字节跳动科技有限公司')).toBe('bytedance');
    expect(resolveCompanySlug('美团')).toBe('meituan');
    expect(resolveCompanySlug('哔哩哔哩')).toBe('bilibili');
    expect(resolveCompanySlug('B站')).toBe('bilibili');
  });

  it('英文公司命中别名表（大小写不敏感 via contains）', () => {
    expect(resolveCompanySlug('Google')).toBe('google');
    expect(resolveCompanySlug('Microsoft')).toBe('microsoft');
    expect(resolveCompanySlug('Meta')).toBe('meta');
    expect(resolveCompanySlug('Apple Inc.')).toBe('apple');
  });

  it('扩展收录的中小厂/硬件/海外企业（2026-09 逐站验证过 slug）', () => {
    expect(resolveCompanySlug('比亚迪')).toBe('byd');
    expect(resolveCompanySlug('比亚迪股份有限公司')).toBe('byd');
    expect(resolveCompanySlug('蔚来')).toBe('nio');
    expect(resolveCompanySlug('海康威视')).toBe('hikvision');
    expect(resolveCompanySlug('米哈游')).toBe('mihoyo');
    expect(resolveCompanySlug('米哈游科技(上海)')).toBe('mihoyo');
    expect(resolveCompanySlug('荣耀')).toBe('honor');
    expect(resolveCompanySlug('货拉拉')).toBe('lalamove');
    expect(resolveCompanySlug('商汤科技')).toBe('sensetime');
    expect(resolveCompanySlug('旷视科技')).toBe('megvii');
    expect(resolveCompanySlug('软通动力')).toBe('isoftstone');
    expect(resolveCompanySlug('思科')).toBe('cisco');
    expect(resolveCompanySlug('惠普')).toBe('hp');
    expect(resolveCompanySlug('Keep')).toBe('keep');
    expect(resolveCompanySlug('SHEIN')).toBe('shein');
    expect(resolveCompanySlug('希音')).toBe('shein');
    expect(resolveCompanySlug('ServiceNow')).toBe('servicenow');
    expect(resolveCompanySlug('Atlassian')).toBe('atlassian');
    expect(resolveCompanySlug('Figma')).toBe('figma');
  });

  it('Levels.fyi 未收录的公司不映射（实测 404 的 slug 不进表）', () => {
    expect(resolveCompanySlug('小红书')).toBeNull();
  });

  it('未收录的中文公司名返回 null（不瞎猜 slug）', () => {
    expect(resolveCompanySlug('某不知名科技公司')).toBeNull();
    expect(resolveCompanySlug('张三科技有限公司')).toBeNull();
  });

  it('纯英文名兜底 slugify：小写、空格转 -、去符号', () => {
    expect(resolveCompanySlug('Red Hat')).toBe('red-hat');
    expect(resolveCompanySlug('Cloud Native Labs')).toBe('cloud-native-labs');
  });

  it('空值/空白返回 null', () => {
    expect(resolveCompanySlug('')).toBeNull();
    expect(resolveCompanySlug('   ')).toBeNull();
    expect(resolveCompanySlug(null)).toBeNull();
    expect(resolveCompanySlug(undefined)).toBeNull();
  });
});

describe('pickTopCompanies 排序去重取 Top N', () => {
  it('按职位数降序，同名合并取最大计数', () => {
    const picked = pickTopCompanies(
      [
        { name: '腾讯', count: 3 },
        { name: '阿里', count: 5 },
        { name: '腾讯', count: 8 },
        { name: '美团', count: 1 },
        { name: '  ', count: 9 }, // 空白名被过滤
      ],
      2
    );
    expect(picked).toEqual([
      { name: '腾讯', count: 8 },
      { name: '阿里', count: 5 },
    ]);
  });

  it('limit 为 0/负数时至少保留 1 家', () => {
    const picked = pickTopCompanies([{ name: '腾讯', count: 1 }, { name: '阿里', count: 2 }], 0);
    expect(picked).toHaveLength(1);
    expect(picked[0].name).toBe('阿里');
  });
});

describe('fetchCompanySalaryRefs（注入 fetcher）', () => {
  const ref = (slug: string): CompanySalaryRef => ({
    company: slug,
    slug,
    role: 'software-engineer',
    url: `https://www.levels.fyi/companies/${slug}/salaries/software-engineer`,
    range: 'CN¥100K-CN¥500K+',
    currency: 'CN¥',
    levels: [{ level: 'P6', total: 'CN¥400K', base: 'CN¥300K', stock: 'CN¥20K', bonus: 'CN¥80K' }],
  });

  beforeEach(() => {
    clearSalaryRefCache();
  });

  it('按职位数 Top N 抓取，company 字段回填原始公司名', async () => {
    const fetcher = vi.fn(async (slug: string) => ref(slug));
    const refs = await fetchCompanySalaryRefs(
      [
        { name: '腾讯', count: 5 },
        { name: '阿里巴巴', count: 3 },
        { name: '美团', count: 1 },
        { name: '某小公司', count: 2 }, // 排第 3，但中文未收录 → 跳过
      ],
      { limit: 3, fetcher }
    );
    expect(fetcher).toHaveBeenCalledTimes(2); // 腾讯 + 阿里巴巴（美团 count 最小未进 top3）
    expect(fetcher).toHaveBeenCalledWith('tencent', expect.stringContaining('/tencent/'));
    const names = refs.map((r) => r.company);
    expect(names).toContain('腾讯');
    expect(names).toContain('阿里巴巴');
    expect(refs[0]).toMatchObject({ slug: 'tencent', range: 'CN¥100K-CN¥500K+' });
  });

  it('fetcher 返回 null（404/无数据）的公司被跳过', async () => {
    const fetcher = vi.fn(async (slug: string) => (slug === 'tencent' ? ref(slug) : null));
    const refs = await fetchCompanySalaryRefs(
      [{ name: '腾讯', count: 1 }, { name: '美团', count: 1 }],
      { fetcher }
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].slug).toBe('tencent');
  });

  it('fetcher 抛错时该家公司被跳过，其余正常返回', async () => {
    const fetcher = vi.fn(async (slug: string) => {
      if (slug === 'tencent') throw new Error('network down');
      return ref(slug);
    });
    const refs = await fetchCompanySalaryRefs(
      [{ name: '腾讯', count: 1 }, { name: '阿里巴巴', count: 1 }],
      { fetcher }
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].slug).toBe('alibaba');
  });

  it('同 slug 在缓存 TTL 内不重复抓取', async () => {
    const fetcher = vi.fn(async (slug: string) => ref(slug));
    const companies = [{ name: '腾讯', count: 1 }];
    const first = await fetchCompanySalaryRefs(companies, { fetcher });
    const second = await fetchCompanySalaryRefs(companies, { fetcher });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1); // 第二次命中缓存
  });

  it('全部无法解析时返回空数组而不抛错', async () => {
    const refs = await fetchCompanySalaryRefs(
      [{ name: '某小公司', count: 3 }, { name: '另一家公司', count: 2 }],
      { fetcher: vi.fn() }
    );
    expect(refs).toEqual([]);
  });

  it('支持按岗位 role 查询：URL 带岗位 slug，缓存按 公司+岗位 区分', async () => {
    const fetcher = vi.fn(async (slug: string, url: string) => ref(slug));
    await fetchCompanySalaryRefs([{ name: '腾讯', count: 1 }], { role: 'data-scientist', fetcher });
    await fetchCompanySalaryRefs([{ name: '腾讯', count: 1 }], { role: 'data scientist', fetcher });
    await fetchCompanySalaryRefs([{ name: '腾讯', count: 1 }], { role: 'software-engineer', fetcher });
    // 归一化后 data-scientist 命中缓存不重复抓取；不同岗位单独抓取
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1]).toContain('/data-scientist');
    expect(fetcher.mock.calls[1][1]).toContain('/software-engineer');
  });

  it('normalizeRole：常见写法归一化，空值回退默认岗位', () => {
    expect(normalizeRole('data scientist')).toBe('data-scientist');
    expect(normalizeRole('Data-Scientist')).toBe('data-scientist');
    expect(normalizeRole('engineering manager')).toBe('engineering-manager');
    expect(normalizeRole(undefined)).toBe('software-engineer');
    expect(normalizeRole('')).toBe('software-engineer');
  });
});
