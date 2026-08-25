// 等安全页自然跳转 + SPA 渲染
const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
    window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
  });

  // 监听 URL 变化
  let lastUrl = '';
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame() && frame.url() !== lastUrl) {
      lastUrl = frame.url();
      console.log('  [URL变化]', lastUrl.slice(0, 120));
    }
  });

  // 监控请求失败
  page.on('requestfailed', req => {
    const url = req.url();
    if (url.includes('.js') || url.includes('.json') || url.includes('wapi')) {
      console.log('  [请求失败]', req.failure()?.errorText, url.slice(0, 100));
    }
  });

  console.log('导航...');
  try {
    await page.goto('https://m.zhipin.com/c100010000/?query=%E5%89%8D%E7%AB%AF%E5%BC%80%E5%8F%91&page=1', {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
  } catch (e) {
    console.log('  goto:', e.message.slice(0, 80));
  }

  // 等待最多 60 秒，看安全页会不会自动跳转
  for (let i = 1; i <= 60; i++) {
    await page.waitForTimeout(1000);
    const url = page.url();
    const title = await page.title().catch(() => '?');
    const info = await page.evaluate(() => ({
      len: document.body?.innerHTML?.length || 0,
      li: document.querySelectorAll('li').length,
    })).catch(() => ({ len: 0, li: 0 }));

    const isResult = url.includes('/c100010000/') && !url.includes('security');
    const hasContent = info.li > 0;
    
    if (i <= 3 || i % 10 === 0 || isResult || hasContent) {
      const flag = isResult ? (hasContent ? '✅✅' : '✅') : (hasContent ? '⚠️' : '');
      console.log(`  ${i}s [${flag}] URL=${url.slice(0, 80)} title=${title.slice(0, 30)} body=${info.len} li=${info.li}`);
    }
    if (hasContent) break;
  }

  // 最终检查
  const finalUrl = page.url();
  console.log('\n最终 URL:', finalUrl.slice(0, 200));
  const li = await page.$$eval('li', els => els.length).catch(() => 0);
  console.log('li 数量:', li);
  
  if (li > 0) {
    const sample = await page.evaluate(() => {
      const lis = document.querySelectorAll('li');
      return [...lis].slice(0, 2).map(e => ({
        cls: e.className?.slice(0, 80),
        text: e.textContent?.trim()?.slice(0, 100),
      }));
    });
    console.log('样本:', JSON.stringify(sample, null, 2));
    const jdLinks = await page.$$eval('a[href*="job_detail"]', els => els.length);
    console.log('job_detail 链接数:', jdLinks);
  }

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });