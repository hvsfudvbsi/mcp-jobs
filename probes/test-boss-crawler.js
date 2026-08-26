// 用完全相同的 crawler 代码路径测试 BOSS
const { chromium } = require('playwright');

async function main() {
  // 和 crawler 一样的参数
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36"',
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
    ]
  });

  // 默认 context（和 crawler 一样）
  let context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36',
    locale: 'zh-CN',
  });

  console.log('=== 测试1: 默认(crawler) context + stealth ===');
  await testBoss(context);
  await context.close();

  // 移动端 context（修复后）
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    isMobile: true,
    hasTouch: true,
  });
  
  console.log('\n=== 测试2: 移动端 context + stealth ===');
  await testBoss(context);
  await context.close();

  await browser.close();
}

async function testBoss(context) {
  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
    window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
  });

  console.log('  goto...');
  try {
    await page.goto('https://m.zhipin.com/c100010000/?query=%E5%89%8D%E7%AB%AF%E5%BC%80%E5%8F%91&page=1', {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
    console.log('  goto 成功');
  } catch (e) {
    console.log('  goto 失败:', e.message.slice(0, 100));
  }

  for (let i = 1; i <= 20; i++) {
    await page.waitForTimeout(500);
    try {
      const status = await page.evaluate(() => {
        const u = window.location.href;
        const liItem = document.querySelectorAll('li.item').length;
        return { u: u.slice(0, 80), liItem, bodyLen: document.body?.innerHTML?.length || 0 };
      });
      console.log(`  ${(i*0.5).toFixed(1)}s: u=${status.u.slice(0,50)} body=${status.bodyLen} li.item=${status.liItem}`);
      if (status.liItem > 0) {
        // 找到元素了！直接在 evaluate 里提取
        const data = await page.evaluate(() => {
          const items = document.querySelectorAll('li.item');
          const results = [];
          items.forEach(item => {
            results.push({
              title: item.querySelector('.title-text')?.textContent?.trim(),
              salary: item.querySelector('.salary')?.textContent?.trim(),
              company: item.querySelector('.company')?.textContent?.trim(),
              address: item.querySelector('.workplace')?.textContent?.trim(),
            });
          });
          return results;
        });
        console.log('  提取结果:', JSON.stringify(data.slice(0, 3), null, 2));
        break;
      }
    } catch (e) {
      console.log(`  ${(i*0.5).toFixed(1)}s: eval error`);
    }
  }

  await page.close();
}

main().catch(e => console.error(e));