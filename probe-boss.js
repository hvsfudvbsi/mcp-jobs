// Boss DOM 深度探测：监控 SPA 渲染时机 + 捕获 API 响应
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
  });
  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
    window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
  });

  // 截获 API 响应
  const apiResponses = [];
  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('wapi') || url.includes('joblist') || url.includes('search')) {
      try {
        const body = await resp.text();
        apiResponses.push({ url: url.slice(0, 120), status: resp.status(), body: body.slice(0, 300) });
      } catch {}
    }
  });

  // 捕获 console 日志
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text().slice(0, 200));
  });

  try {
    await page.goto('https://m.zhipin.com/c100010000/?query=%E5%89%8D%E7%AB%AF%E5%BC%80%E5%8F%91&page=1', {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
  } catch (e) {
    console.log('goto 超时:', e.message.slice(0, 100));
  }

  console.log('domcontentloaded URL:', page.url().slice(0, 200));
  console.log('标题:', await page.title().catch(() => '?'));

  // 轮询式等待：每 1 秒检查 DOM，最多 20 秒
  for (let i = 1; i <= 20; i++) {
    await page.waitForTimeout(1000);
    const info = await page.evaluate(() => ({
      bodyLen: document.body?.innerHTML?.length || 0,
      liCount: document.querySelectorAll('li').length,
      aCount: document.querySelectorAll('a').length,
      divCount: document.querySelectorAll('div').length,
      bodyText: (document.body?.innerText || '').slice(0, 100),
    }));
    const highlight = info.bodyLen > 100 || info.liCount > 0 ? ' ⬅️' : '';
    console.log(`  ${i}s: body=${info.bodyLen} li=${info.liCount} a=${info.aCount} divs=${info.divCount}${highlight}`);
    if (info.bodyLen > 500) break;
  }

  // 最终检查
  const url = page.url();
  console.log('\n最终 URL:', url.slice(0, 200));
  
  const bodyLen = await page.evaluate(() => document.body?.innerHTML?.length || 0);
  console.log('bodyHTML 长度:', bodyLen);

  if (bodyLen > 100) {
    // 获取所有 li 的 class
    const liSample = await page.evaluate(() => {
      const lis = document.querySelectorAll('li');
      const classes = [...new Set([...lis].map(e => e.className?.slice(0, 60) || '(none)'))];
      return { count: lis.length, classes: classes.slice(0, 15) };
    });
    console.log('li:', JSON.stringify(liSample));

    // 查找跟职位相关的内容
    const jobInfo = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="job_detail"]');
      return {
        jobDetailLinks: links.length,
        firstLinkHref: links[0]?.getAttribute('href')?.slice(0, 80) || 'none',
        firstLinkText: links[0]?.textContent?.trim()?.slice(0, 50) || 'none',
        firstLinkParent: links[0]?.parentElement?.className?.slice(0, 60) || 'none',
      };
    });
    console.log('job_detail:', JSON.stringify(jobInfo));

    // 尝试找职位列表容器
    const containers = await page.evaluate(() => {
      // 找包含多个同类子元素且子元素中有文字的容器
      const all = document.querySelectorAll('*');
      const candidates = [];
      for (const el of all) {
        const children = [...el.children];
        if (children.length >= 5 && children.length <= 30) {
          const firstClass = children[0].className?.slice(0, 40);
          const allSame = children.every(c => c.className === children[0].className);
          if (allSame && firstClass) {
            candidates.push({ tag: el.tagName, childClass: firstClass, count: children.length });
          }
        }
      }
      return candidates.slice(0, 10);
    });
    console.log('列表容器候选:', JSON.stringify(containers));
  }

  // API 响应
  console.log('\nAPI 响应:');
  apiResponses.forEach(r => console.log(`  ${r.status} ${r.url}\n    ${r.body}`));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });