// 发现 Levels.fyi 首页公司搜索框的自动补全接口（用于批量解析公司名 → slug）
const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ userAgent: UA, locale: 'en-US' });
  const hits = [];
  page.on('request', (req) => {
    const u = req.url();
    if (/api|search|company|autocomplete|suggest/i.test(u) && !/\.(js|css|png|svg|woff)/.test(u)) {
      hits.push({ method: req.method(), url: u.slice(0, 200) });
    }
  });
  page.on('response', async (resp) => {
    const u = resp.url();
    if (/api|search|suggest/i.test(u) && /json/i.test(resp.headers()['content-type'] || '')) {
      const body = await resp.text().catch(() => '');
      console.log('JSON RESP:', resp.status(), u.slice(0, 200));
      console.log('   body:', body.slice(0, 400));
    }
  });

  await page.goto('https://www.levels.fyi/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // 找搜索框
  const input = await page.evaluate(() => {
    const cands = ['input[type="search"]', 'input[placeholder*="Search"]', 'input[placeholder*="company"]', 'input[placeholder*="Company"]', 'input'];
    for (const s of cands) {
      const el = document.querySelector(s);
      if (el) return { sel: s, placeholder: el.placeholder || '', id: el.id || '' };
    }
    return null;
  });
  console.log('搜索框:', JSON.stringify(input));

  // 尝试已知的自动补全端点（同源 in-page fetch，绕 Cloudflare）
  const endpoints = [
    'https://www.levels.fyi/api/companies/autocomplete?q=tenc',
    'https://www.levels.fyi/api/company/search?q=tenc',
    'https://www.levels.fyi/api/search?q=tenc',
    'https://www.levels.fyi/js/companies.json',
    'https://www.levels.fyi/js/companyData.json',
    'https://www.levels.fyi/api/company?q=tenc',
    'https://www.levels.fyi/api/v2/company/search?q=tenc',
  ];
  for (const ep of endpoints) {
    const r = await page.evaluate(async (u) => {
      try {
        const res = await fetch(u, { headers: { accept: 'application/json' } });
        const t = await res.text();
        return { status: res.status, ct: res.headers.get('content-type'), len: t.length, sample: t.slice(0, 200) };
      } catch (e) {
        return { error: String(e).slice(0, 120) };
      }
    }, ep);
    console.log(`EP ${ep}\n   -> ${JSON.stringify(r)}`);
  }

  // 触发搜索框输入（如果找到），观察网络
  if (input) {
    const box = page.locator(input.sel).first();
    await box.click().catch(() => {});
    await box.fill('tenc').catch(() => {});
    await page.waitForTimeout(2500);
    console.log('输入 tencent 后捕获的请求:');
    hits.forEach((h) => console.log('  ', h.method, h.url));
    // 看看是否有下拉候选出现
    const dropdown = await page.evaluate(() => {
      const t = document.body ? document.body.innerText : '';
      const m = t.match(/Tencent[\s\S]{0,60}/i);
      return m ? m[0] : null;
    });
    console.log('下拉文本样例:', dropdown);
  }

  await browser.close();
})();