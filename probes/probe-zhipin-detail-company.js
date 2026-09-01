// 探测 Zhipin 移动端职位详情页：公司名/职位名/薪资 的 DOM 选择器（为 mcp_job_detail 附带薪资参考取公司名）
const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA, locale: 'zh-CN', isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const url = process.argv[2] || 'https://m.zhipin.com/job_detail/7d5caa6504e27b8b1HF839S1FVtU.html';
  console.log('>> loading', url);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log('  goto 异常:', e.message.slice(0, 80));
  }
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    const ready = await page.evaluate(() => document.querySelectorAll('.job-detail, .job-sec, [class*="job-detail"]').length > 0).catch(() => false);
    if (ready) { console.log('  detail 就绪于 ' + (i + 1) + 's'); break; }
  }

  const out = await page.evaluate(() => {
    const text = (el) => (el ? el.textContent.trim().slice(0, 80) : null);
    const probe = (sels) => {
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el) return { sel: s, text: text(el) };
      }
      return null;
    };
    // 公司名候选
    const company = probe([
      '.company-info .name', '.company-name', '.company-info-name', '[class*="company"] [class*="name"]',
      '.job-detail [class*="company"]', '.info-box .company', '.job-sec .company', 'a[class*="company"]',
    ]);
    // 职位名/薪资候选
    const title = probe(['.job-title', '.name-box h1', 'h1', '[class*="job-title"]']);
    const salary = probe(['.job-salary', '[class*="salary"]', '.salary', '.red']);
    // 列出含 company 的 class
    const companyClasses = [...new Set(Array.from(document.querySelectorAll('[class*="company"], [class*="Company"]')).map((el) => el.className).filter(Boolean))].slice(0, 15);
    // 所有 class 里含 name/title 的
    const nameClasses = [...new Set(Array.from(document.querySelectorAll('[class*="name"], [class*="title"]')).map((el) => el.className).filter(Boolean))].slice(0, 15);
    return {
      title: document.title,
      url: location.href,
      company, title, salary,
      companyClasses, nameClasses,
      bodyLen: (document.body ? document.body.innerText : '').length,
    };
  });
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();