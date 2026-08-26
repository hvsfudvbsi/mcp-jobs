// Levels.fyi 探测：技术薪资数据站，验证首页 + 公司薪资页是否可抓
const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function probePage(browser, url, label) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: UA, locale: 'en-US' });
  const page = await context.newPage();
  console.log(`\n>> [${label}] loading ${url}`);

  let blocked = null;
  page.on('response', (resp) => {
    if ([403, 429, 503].includes(resp.status())) {
      blocked = `${resp.status()} ${resp.url().substring(0, 100)}`;
    }
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log(`  goto 异常: ${e.message.substring(0, 100)}`);
  }
  await page.waitForTimeout(5000);
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}

  const title = await page.title().catch(() => '?');
  console.log(`  title: ${title}`);
  console.log(`  URL:   ${page.url()}`);
  console.log(`  反爬状态码: ${blocked || '无'}`);

  // 反爬墙检测 + 数据提取（分开 try，避免整段失效）
  const wall = await page.evaluate(() => {
    const t = document.body ? document.body.innerText.substring(0, 3000) : '';
    return /attention required|checking your browser|enable javascript and cookies|just a moment|verify you are human|cf-|cloudflare/i.test(t) ? t.substring(0, 200) : null;
  }).catch((e) => `eval错误: ${e.message.substring(0, 60)}`);
  console.log(`  反爬墙文本: ${wall ? JSON.stringify(wall) : '无'}`);

  const data = await page.evaluate(() => {
    const out = {};
    try { out.bodyLen = document.body ? document.body.innerText.length : -1; } catch (e) { out.bodyLen = 'err:' + e.message; }
    try {
      const text = document.body ? document.body.innerText : '';
      out.hasSalary = /salary|compensation|total comp|median|\$[0-9,]+[Kk]?/i.test(text);
      // 提取所有 $xxK / $x,x 样的薪资文本
      out.salaryMentions = (text.match(/\$[0-9][0-9,]*K?/g) || []).slice(0, 20);
    } catch (e) { out.hasSalary = 'err:' + e.message; }
    try {
      // 常见表格行
      out.rows = Array.from(document.querySelectorAll('table tbody tr')).slice(0, 3).map(r => r.innerText.substring(0, 300));
    } catch (e) { out.rows = 'err:' + e.message; }
    // SSR 状态（Next.js __NEXT_DATA__）
    try {
      const nd = document.getElementById('__NEXT_DATA__');
      out.nextData = nd ? nd.textContent.substring(0, 300) : null;
    } catch (e) { out.nextData = 'err:' + e.message; }
    return out;
  }).catch((e) => ({ evalFailed: String(e).substring(0, 200) }));
  console.log(`  bodyLen=${data.bodyLen} hasSalary=${data.hasSalary} nextData=${data.nextData ? '有' : '无'}`);
  if (data.salaryMentions && data.salaryMentions.length) console.log(`  薪资文本样例: ${JSON.stringify(data.salaryMentions.slice(0, 8))}`);
  if (data.rows && Array.isArray(data.rows) && data.rows.length) console.log(`  表格行: ${JSON.stringify(data.rows).substring(0, 600)}`);
  if (data.evalFailed) console.log(`  eval失败: ${data.evalFailed}`);

  await context.close();
  return { title, blocked, wall, data };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  const home = await probePage(browser, 'https://www.levels.fyi/', '首页');
  const salary = await probePage(browser, 'https://www.levels.fyi/companies/google/salaries/software-engineer', 'Google SWE 薪资页');
  const sde = await probePage(browser, 'https://www.levels.fyi/companies/facebook/meta/salaries/software-engineer', 'Meta SWE 薪资页');

  await browser.close();
  console.log('\n=== 结论 ===');
  const ok = (p) => p && p.data && p.data.hasSalary === true && !p.wall && !p.blocked;
  console.log('可提取薪资数据(无验证墙):', JSON.stringify({ home: ok(home), google: ok(salary), meta: ok(sde) }));
  console.log('Done.');
})();
