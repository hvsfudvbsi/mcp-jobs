// 立即提取：内容出现的瞬间就抓，不等它消失
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
    waitUntil: 'domcontentloaded', timeout: 30000
  });

  // 轮询：一旦内容出现就立即提取
  let snapshot = null;
  for (let i = 1; i <= 30; i++) {
    await page.waitForTimeout(500); // 500ms 轮询
    const u = page.url();
    try {
      const info = await page.evaluate(() => {
        const bodyLen = document.body?.innerHTML?.length || 0;
        if (bodyLen < 5000) return { bodyLen, ready: false };
        
        // 页面内容可用，立即抓取全部 DOM 信息
        const links = document.querySelectorAll('a[href*="job_detail"]');
        if (links.length === 0) return { bodyLen, links: 0, ready: false };
        
        // 分析卡片
        const first = links[0];
        let card = first.parentElement;
        let cardSel = null, cardCount = 0;
        
        for (let j = 0; j < 6 && card; j++) {
          const cls = card.className;
          if (cls) {
            const sel = card.tagName + '.' + cls.split(' ').slice(0, 2).join('.');
            const cnt = document.querySelectorAll(sel).length;
            if (cnt >= 2 && cnt <= 30 && !cardSel) {
              cardSel = sel;
              cardCount = cnt;
            }
          }
          card = card.parentElement;
        }
        
        if (!cardSel) return { bodyLen, links: links.length, ready: false, noCardSel: true };
        
        // 提取第一个卡片的所有子元素
        const firstCard = document.querySelectorAll(cardSel)[0];
        const children = [...firstCard.children].map(c => ({
          tag: c.tagName,
          cls: c.className?.slice(0, 60),
          text: c.textContent?.trim()?.slice(0, 50),
        }));
        
        // 尝试提取结构化数据
        const title = firstCard.querySelector('.title-text, .job-title, .job-name, [class*="name"], [class*="title"]')?.textContent?.trim();
        const salary = firstCard.querySelector('.salary, .red, [class*="salary"], [class*=pay]')?.textContent?.trim();
        const company = firstCard.querySelector('.company, .company-text, .company-name, [class*="company"]')?.textContent?.trim();
        const address = firstCard.querySelector('.workplace, .address, [class*="address"], [class*="area"], [class*=location]')?.textContent?.trim();
        const tags = [...firstCard.querySelectorAll('.labels span, .tag, [class*="tag"], [class*="label"]')].map(e => e.textContent?.trim()).filter(Boolean);
        const jobDetail = firstCard.querySelector('a[href*="job_detail"]')?.getAttribute('href');
        
        // 列所有 li.item
        const itemLis = document.querySelectorAll('li.item');
        const itemCount = itemLis.length;
        
        return {
          bodyLen, ready: true,
          cardSelector: cardSel, cardCount,
          links: links.length,
          itemLis: itemCount,
          extracted: { title, salary, company, address, tags, jobDetail },
          children,
          firstCardHTML: firstCard.outerHTML.slice(0, 1000),
        };
      });
      
      if (info.ready) {
        console.log(`  ${(i * 0.5).toFixed(1)}s ⚡ 提取成功! body=${info.bodyLen} links=${info.links} cardSel=${info.cardSelector} itemLis=${info.itemLis}`);
        snapshot = info;
        break;
      } else if (info.bodyLen > 5000) {
        console.log(`  ${(i * 0.5).toFixed(1)}s body=${info.bodyLen} links=${info.links || 0} (等待卡片...)`);
      }
    } catch (e) {
      // 导航中
      if (i <= 10) console.log(`  ${(i * 0.5).toFixed(1)}s ${u.slice(0, 60)}`);
    }
    
    if (u === 'about:blank' && i > 4) {
      console.log(`  ${(i * 0.5).toFixed(1)}s 页面已重置为 about:blank`);
      break;
    }
  }

  if (snapshot) {
    console.log('\n======== 提取结果 ========');
    console.log('卡片选择器:', snapshot.cardSelector, '(共', snapshot.cardCount, '个)');
    console.log('job_detail 链接:', snapshot.links);
    console.log('li.item:', snapshot.itemLis);
    console.log('\n结构化提取:', JSON.stringify(snapshot.extracted, null, 2));
    console.log('\n卡片子元素:', JSON.stringify(snapshot.children, null, 2));
    console.log('\n卡片 HTML:', snapshot.firstCardHTML);
  } else {
    console.log('\n未提取到数据');
  }

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });