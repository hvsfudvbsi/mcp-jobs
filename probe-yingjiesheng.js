// 应届生求职网 stealth 探测
const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: UA, locale: 'zh-CN' });
  const page = await context.newPage();

  // stealth 注入
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
    window.chrome = { runtime: {}, loadTimes: function() {}, csi: function() {} };
  });

  const url = 'https://q.yingjiesheng.com/jobs/search/?jobarea=010000';
  console.log('>>', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  const title = await page.title();
  const finalUrl = page.url();
  console.log(`  title: ${title}`);
  console.log(`  URL: ${finalUrl}`);

  // 是验证页还是结果页？
  const isCaptcha = title.includes('验证') || title.includes('captcha') || finalUrl.includes('type__');
  console.log(`  验证页: ${isCaptcha}`);

  if (!isCaptcha) {
    const body = await page.$eval('body', el => el.textContent.substring(0, 2000)).catch(() => '');
    console.log('  body:', body.substring(0, 1000));
  }

  await page.screenshot({ path: '/tmp/yjs-stealth.png', fullPage: true });
  console.log('  截图: /tmp/yjs-stealth.png');
  await browser.close();
  console.log('Done.');
})();