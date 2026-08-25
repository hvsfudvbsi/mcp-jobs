// 探测 BOSS 职位卡片选择器 — 处理导航不稳定
const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    userAgent: UA, viewport: { width: 390, height: 844 },
    locale: 'zh-CN', isMobile: true, hasTouch: true,
  });
  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
    window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
  });

  await page.goto('https://m.zhipin.com/c100010000/?query=%E5%89%8D%E7%AB%AF%E5%BC%80%E5%8F%91&page=1', {
    waitUntil: 'commit', timeout: 30000
  });

  // 等待 URL 稳定（不再含 security）或最多 20 秒
  let stable = false;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    const u = page.url();
    if (u.includes('/c100010000/') && !u.includes('security')) {
      // 再等 3 秒给 SPA 渲染
      await page.waitForTimeout(3000);
      stable = true;
      console.log(`URL 稳定 (${i+1}s):`, u.slice(0, 120));
      break;
    }
  }
  if (!stable) {
    console.log('URL 未稳定, 当前:', page.url().slice(0, 120));
  }

  // 安全地获取信息
  const safeEval = (fn) => page.evaluate(fn).catch(e => ({ error: e.message.slice(0, 80) }));
  const safeEvalAll = (sel, fn) => page.$$eval(sel, fn).catch(e => ({ count: 0, error: e.message.slice(0, 80) }));

  const title = await safeEval(() => document.title);
  console.log('标题:', title);

  // 找 job_detail 链接
  const jdCount = await safeEval(() => document.querySelectorAll('a[href*="job_detail"]').length);
  console.log('job_detail 链接数:', jdCount);

  if (jdCount > 0) {
    // 分析 DOM 结构
    const structure = await safeEval(() => {
      const links = document.querySelectorAll('a[href*="job_detail"]');
      const first = links[0];
      // 往上找最近的有 class 的祖先
      const path = [];
      let el = first;
      for (let i = 0; i < 15 && el && el !== document.body; i++) {
        path.push(el.tagName + (el.className ? '.' + el.className.split(' ')[0] : '') + (el.children.length ? `[${el.children.length}]` : ''));
        el = el.parentElement;
      }
      return { count: links.length, path: path.slice(0, 8) };
    });
    console.log('链接祖先路径:', structure.path ? structure.path.join(' > ') : structure);

    // 找到共同卡片容器
    const cardInfo = await safeEval(() => {
      const links = document.querySelectorAll('a[href*="job_detail"]');
      const first = links[0];
      // 往上第 2-4 层找有 textContent 的祖先
      let card = first.parentElement;
      for (let i = 0; i < 8 && card; i++) {
        const sibCount = card.parentElement ? [...card.parentElement.children].filter(c => c.className === card.className).length : 0;
        if (sibCount >= 3 && sibCount <= 30) {
          const sel = card.tagName + (card.className ? '.' + card.className.split(' ').slice(0, 2).join('.') : '');
          return { selector: sel, level: i, siblingCount: sibCount };
        }
        card = card.parentElement;
      }
      return { error: 'not found', parentClasses: [...new Set([...first.parentElement?.parentElement?.parentElement?.children || []].map(c => c.className))].slice(0, 5) };
    });
    console.log('卡片选择器:', JSON.stringify(cardInfo));

    // 用找到的选择器提取
    if (cardInfo.selector) {
      const cards = await page.$$(cardInfo.selector);
      console.log('卡片数量:', cards.length);
      if (cards.length > 0) {
        const firstHTML = await cards[0].evaluate(el => el.outerHTML.slice(0, 1000));
        console.log('\n第一个卡片:');
        console.log(firstHTML);
        console.log('\n---');
        
        // 子元素列表
        const children = await cards[0].evaluate(el => 
          [...el.children].map(c => ({
            tag: c.tagName,
            cls: c.className?.slice(0, 60),
            text: c.textContent?.trim()?.slice(0, 50),
          }))
        );
        console.log('子元素:', JSON.stringify(children, null, 2));
      }
    }
  } else {
    // 没有 job_detail 链接，看看页面内容
    const bodyText = await safeEval(() => document.body?.innerText?.slice(0, 300));
    console.log('页面文本:', bodyText);
    const bodyLen = await safeEval(() => document.body?.innerHTML?.length);
    console.log('body HTML长度:', bodyLen);
  }

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });