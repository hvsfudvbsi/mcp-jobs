// Levels.fyi 薪资表 DOM 结构 + 抓取耗时探测（为一浏览器批量抓取做依据）
const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const TARGETS = [
  ['alibaba', 'https://www.levels.fyi/companies/alibaba/salaries/software-engineer'],
  ['tencent', 'https://www.levels.fyi/companies/tencent/salaries/software-engineer'],
  ['bytedance', 'https://www.levels.fyi/companies/bytedance/salaries/software-engineer'],
  ['meituan', 'https://www.levels.fyi/companies/meituan/salaries/software-engineer'],
  ['jd.com', 'https://www.levels.fyi/companies/jd.com/salaries/software-engineer'],
];

async function probeOne(page, slug, url) {
  const t0 = Date.now();
  let wall = null;
  page.on('response', (r) => { if ([403, 429, 503].includes(r.status())) wall = r.status(); });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  } catch (e) {
    return { slug, error: `goto: ${e.message.slice(0, 80)}`, ms: Date.now() - t0 };
  }
  await page.waitForTimeout(1500);
  try { await page.waitForLoadState('networkidle', { timeout: 6000 }); } catch {}
  const ms = Date.now() - t0;
  const title = await page.title().catch(() => '?');
  const bodyText = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 500) : '').catch(() => '');

  // 检测表格
  const tbl = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table'));
    const info = tables.map((t, i) => {
      const heads = Array.from(t.querySelectorAll('thead th, thead td, th')).slice(0, 8).map((h) => h.innerText.trim());
      const rows = Array.from(t.querySelectorAll('tbody tr')).slice(0, 3).map((r) =>
        Array.from(r.querySelectorAll('td')).map((c) => c.innerText.trim())
      );
      return { i, heads, rowCount: t.querySelectorAll('tbody tr').length, sample: rows };
    });
    return info;
  }).catch((e) => ({ err: String(e).slice(0, 120) }));

  console.log(`\n[${slug}] ${ms}ms (${url})`);
  console.log(`  title: ${title} | 反爬状态码: ${wall || '无'}`);
  if (/attention required|just a moment|checking your browser/i.test(bodyText)) {
    console.log(`   ⚠️ 反爬墙文本: ${bodyText.slice(0, 120)}`);
  }
  console.log(`  表格(${Array.isArray(tbl) ? tbl.length : tbl.err}):`);
  if (Array.isArray(tbl)) {
    tbl.forEach((t) => {
      console.log(`    [表${t.i}] 表头=${JSON.stringify(t.heads)} 行数=${t.rowCount}`);
      t.sample.forEach((r) => console.log(`       行: ${JSON.stringify(r)}`));
    });
  } else {
    console.log('   ' + JSON.stringify(tbl));
  }
  return { slug, ms, title, wall };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: UA, locale: 'en-US' });
  const page = await context.newPage();

  // 先测一个页面，确认结构后再批量
  const first = await probeOne(page, TARGETS[0][0], TARGETS[0][1]);

  console.log('\n=== 单浏览器顺序批量测速 ===');
  const seqT0 = Date.now();
  const results = [];
  for (const [slug, url] of TARGETS.slice(1)) {
    results.push(await probeOne(page, slug, url));
  }
  const totalMs = Date.now() - seqT0;
  console.log(`\n批量顺序耗时: ${totalMs}ms（5 家公司，含首个）`);
  console.log('\n=== 结论 ===');
  console.log('公司页:', JSON.stringify({ first, totalMs }));
  await browser.close();
})();
