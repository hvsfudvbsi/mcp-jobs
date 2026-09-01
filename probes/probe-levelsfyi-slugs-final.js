// 最终小批量验证：只覆盖高价值中文公司候选（单页面顺序执行，避免并发限速）
const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// [公司名, 品牌英文名(用于 body 判定), sl]（只保留高置信度会被收录的公司）
const CANDIDATES = [
  ['科大讯飞', 'iflytek', 'iflytek'],
  ['唯品会', 'vipshop', 'vipshop'],
  ['金蝶', 'kingdee', 'kingdee'],
  ['用友', 'yonyou', 'yonyou'],
  ['广联达', 'glodon', 'glodon'],
  ['京东方', 'boe', 'boe'],
  ['去哪儿', 'qunar', 'qunar'],
  ['富途', 'futu', 'futu'],
  ['网易有道', 'youdao', 'youdao'],
  ['好未来', 'tal education', 'tal'],
  ['新东方', 'new oriental', 'new-oriental'],
  ['叮咚买菜', 'dingdong', 'dingdong'],
  ['货拉拉', 'lalamove', 'lalamove'],
  ['莉莉丝', 'lilith', 'lilith'],
  ['鹰角网络', 'hypergryph', 'hypergryph'],
  ['三七互娱', '37 games', '37-games'],
  ['游族网络', 'youzu', 'youzu'],
  ['完美世界', 'perfect world', 'perfect-world'],
  ['心动公司', 'xd', 'xd'],
  ['泡泡玛特', 'pop mart', 'popmart'],
  ['众安保险', 'zhongan', 'zhongan'],
  ['中国平安', 'ping an', 'pingan'],
  ['东方财富', 'eastmoney', 'eastmoney'],
  ['同花顺', '10jqka', '10jqka'],
  ['金山云', 'ksyun', 'ksyun'],
  ['青云科技', 'qingcloud', 'qingcloud'],
  ['UCloud', 'ucloud', 'ucloud'],
  ['奇安信', 'qianxin', 'qianxin'],
  ['深信服', 'sangfor', 'sangfor'],
  ['中软国际', 'chinasoft', 'chinasoft'],
  ['软通动力', 'isoftstone', 'isoftstone'],
  ['猿辅导', 'yuanfudao', 'yuanfudao'],
  ['作业帮', 'zuoyebang', 'zuoyebang'],
  ['出门问问', 'mobvoi', 'mobvoi'],
  ['第四范式', '4paradigm', '4paradigm'],
  ['寒武纪', 'cambricon', 'cambricon'],
  ['地平线', 'horizon robotics', 'horizon-robotics'],
  ['魅族', 'meizu', 'meizu'],
  ['荣耀', 'honor', 'honor'],
  ['得物', 'dewu', 'dewu'],
  ['每日优鲜', 'missfresh', 'missfresh'],
  ['马蜂窝', 'mafengwo', 'mafengwo'],
  ['飞猪', 'fliggy', 'fliggy'],
  ['同程旅行', 'tongcheng', 'tongcheng'],
  ['度小满', 'duxiaoman', 'duxiaoman'],
  ['陆金所', 'lufax', 'lufax'],
  ['老虎证券', 'tiger brokers', 'tiger-brokers'],
];

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ userAgent: UA, locale: 'en-US' });
  const results = [];
  for (const [name, brand, slug] of CANDIDATES) {
    let verdict = 'no';
    try {
      await page.goto(`https://www.levels.fyi/companies/${slug}/salaries/software-engineer`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(2800);
      const info = await page.evaluate(() => {
        const body = document.body ? document.body.innerText : '';
        return { title: document.title || '', body: body.slice(0, 8000) };
      }).catch(() => ({ title: '', body: '' }));
      if (!info.title) { verdict = 'no'; results.push({ name, slug, verdict: 'no(空页)' }); continue; }
      const hitTitle = /Salary\s*\|/i.test(info.title);
      const hitBody = brand.split(' ').filter(Boolean).every((w) => info.body.toLowerCase().includes(w.toLowerCase()));
      verdict = hitTitle || hitBody ? 'ok' : 'no';
    } catch {
      verdict = 'no';
    }
    results.push({ name, slug, verdict });
    console.log(`${verdict.startsWith('ok') ? '✅' : '❌'} ${name} -> ${slug} [${verdict}]`);
  }
  await browser.close();
  console.log('\n=== 有效 ===');
  results.filter((r) => r.verdict === 'ok').forEach((r) => console.log(`  ${r.name} => ${r.slug}`));
  console.log('\n无效:', results.filter((r) => r.verdict !== 'ok').map((r) => r.name).join('、') || '无');
})();