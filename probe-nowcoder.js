// 探测牛客网职位搜索页 DOM 结构
const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: UA, locale: 'zh-CN' });
  const page = await context.newPage();

  const url = 'https://www.nowcoder.com/job/center?recruitType=1&keyword=%E5%89%8D%E7%AB%AF&page=1';
  console.log('>> loading', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  // Wait longer for SPA
  await page.waitForTimeout(5000);
  
  // Check job-content area
  const jobContent = await page.$('.job-content');
  if (jobContent) {
    const html = await jobContent.innerHTML();
    console.log('\n=== .job-content HTML (first 3000 chars) ===');
    console.log(html.substring(0, 3000));
  }
  
  // Try to find list items
  const bodyText = await page.$eval('body', el => {
    const items = Array.from(document.querySelectorAll('[class*="job"] li'));
    return items.slice(0, 5).map(c => ({
      tag: c.tagName,
      className: c.className,
      text: c.textContent?.substring(0, 300),
    }));
  });
  console.log('\n=== first 5 [class*="job"] li items ===');
  console.log(JSON.stringify(bodyText, null, 2).substring(0, 2000));

  await browser.close();
  console.log('\nDone.');
})();