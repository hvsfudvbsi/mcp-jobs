// 牛客网搜索 v6: 捕获 square-search 请求体和响应
const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: UA, locale: 'zh-CN' });
  const page = await context.newPage();

  // 用 CDP 捕获请求体（Playwright 原生不支持 postData 在 response 事件里）
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (params) => {
    if (params.request.url.includes('square-search')) {
      console.log(`\n  >>> [REQ] POST ${params.request.url}`);
      if (params.request.postData) {
        console.log(`  >>> body: ${params.request.postData}`);
      }
    }
  });
  cdp.on('Network.responseReceived', (params) => {
    if (params.response.url.includes('square-search')) {
      console.log(`  <<< [RESP] status=${params.response.status} mime=${params.response.mimeType}`);
    }
  });
  // 捕获响应体
  cdp.on('Network.loadingFinished', async (params) => {
    try {
      const resp = await cdp.send('Network.getResponseBody', { requestId: params.requestId });
      // 检查是否是 square-search --- we can't easily correlate, but we'll use page.on
    } catch {}
  });

  // Also use page.on for easy correlation
  page.on('response', async (resp) => {
    if (resp.url().includes('square-search')) {
      try {
        const body = await resp.text();
        console.log(`  <<< [BODY] ${body.substring(0, 3000)}`);
      } catch {}
    }
  });

  const url = 'https://www.nowcoder.com/job/center?recruitType=1';
  console.log('>> loading', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // 关闭弹窗
  await page.evaluate(() => {
    document.querySelectorAll('.el-dialog__wrapper').forEach(d => d.remove());
    document.querySelectorAll('.v-modal').forEach(m => m.remove());
    document.body.style.overflow = '';
  });
  await page.waitForTimeout(500);

  // 输入关键词并回车
  const keyword = 'Java';
  console.log(`\n>> 输入: "${keyword}" 并回车`);
  await page.evaluate((kw) => {
    const input = document.querySelector('.input-search-filter input');
    if (input) {
      input.focus();
      input.value = kw;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, keyword);
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(5000);

  // 看结果
  console.log('\n=== 页面结果 ===');
  const text = await page.$eval('.job-content', el => el.textContent?.substring(0, 3000)).catch(() => '');
  console.log(text);

  await page.screenshot({ path: '/tmp/nowcoder-search-v6.png', fullPage: false });
  console.log('\nDone.');
  await browser.close();
})();