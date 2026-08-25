// Boss 强力 stealth: 多策略组合
const { chromium } = require('playwright');
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function tryBoss(label, viewport, ua, extraHeaders) {
  console.log(`\n=== ${label} ===`);
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security', '--disable-features=VizDisplayCompositor',
    ],
  });
  const context = await browser.newContext({
    userAgent: ua,
    viewport,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    isMobile: viewport.width < 500,
    hasTouch: viewport.width < 500,
    extraHTTPHeaders: extraHeaders || {},
  });
  const page = await context.newPage();

  // 强力 stealth 脚本
  await page.addInitScript(() => {
    const p = Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver');
    if (p) Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    else Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    
    // Plugins
    Object.defineProperty(navigator, 'plugins', { get: () => {
      const arr = [];
      arr.item = () => null;
      arr.namedItem = () => null;
      arr.refresh = () => {};
      return arr;
    }});
    
    // Languages
    (navigator).languages = ['zh-CN', 'zh', 'en-US', 'en'];
    
    // Chrome
    window.chrome = { 
      runtime: {}, 
      loadTimes: () => {}, 
      csi: () => {}, 
      app: {},
    };
    
    // Permissions
    const origQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
      Promise.resolve({ state: Notification.permission }) :
      origQuery(parameters)
    );
    
    // 覆盖常见的 headless 检测
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
  });

  // 设置额外 HTTP 头
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
  });

  try {
    await page.goto('https://m.zhipin.com/c100010000/?query=%E5%89%8D%E7%AB%AF%E5%BC%80%E5%8F%91&page=1', {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
  } catch (e) {
    console.log('  goto错误:', e.message.slice(0, 80));
  }

  console.log('  URL:', page.url().slice(0, 150));
  console.log('  标题:', await page.title().catch(() => '?'));
  
  // 轮询等待
  for (let i = 1; i <= 8; i++) {
    await page.waitForTimeout(1000);
    const info = await page.evaluate(() => ({
      len: document.body?.innerHTML?.length || 0,
      li: document.querySelectorAll('li').length,
      a: document.querySelectorAll('a').length,
    }));
    if (i === 1) console.log(`  1s: body=${info.len} li=${info.li} a=${info.a}`);
    if (info.li > 0) {
      console.log(`  ${i}s: ✅ li=${info.li} a=${info.a}`);
      // 获取 DOM 详情
      const dom = await page.evaluate(() => {
        const lis = document.querySelectorAll('li');
        if (lis.length === 0) return null;
        const sample = [...lis].slice(0, 2).map(li => ({
          cls: li.className?.slice(0, 80),
          html: li.outerHTML.slice(0, 200),
        }));
        // 找 job_detail 链接
        const jdLinks = document.querySelectorAll('a[href*="job_detail"]');
        return { 
          sample, 
          jdCount: jdLinks.length,
          jdHref: jdLinks[0]?.getAttribute('href')?.slice(0, 80),
        };
      });
      if (dom) {
        console.log('  DOM详情:', JSON.stringify(dom, null, 2).slice(0, 500));
      }
      break;
    }
  }
  const final = await page.evaluate(() => document.body?.innerText?.slice(0, 200) || '');
  console.log('  页面文本:', final.replace(/\n+/g, ' | '));

  await browser.close();
  return final.includes('前端开发');
}

(async () => {
  // 策略 1: 移动端 + Safari UA
  const ok1 = await tryBoss('移动端 Safari', { width: 390, height: 844 }, UA_MOBILE);
  
  // 策略 2: PC端标准 Chrome
  const ok2 = await tryBoss('PC端 Chrome', { width: 1280, height: 800 }, UA_PC);

  // 策略 3: 移动端 Chrome
  const ok3 = await tryBoss('移动端 Chrome', { width: 390, height: 844 }, UA_PC);

  console.log('\n=== 总结 ===');
  console.log('移动端 Safari:', ok1 ? '成功' : '失败');
  console.log('PC端 Chrome:', ok2 ? '成功' : '失败');
  console.log('移动端 Chrome:', ok3 ? '成功' : '失败');
})().catch(e => { console.error(e); process.exit(1); });