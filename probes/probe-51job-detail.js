// 探测 51job 职位详情页（真实 URL 格式 + DOM 结构）
const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // 打开搜索列表页
  await page.goto('https://we.51job.com/pc/search?keyword=%E5%89%8D%E7%AB%AF%E5%BC%80%E5%8F%91&searchType=2&sortType=0&metro=', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.joblist-item', { timeout: 15000 });

  // 找出所有链接，区分公司链接 vs 职位详情链接
  const links = await page.$$eval('.joblist-item', els => els.slice(0, 3).map(e => {
    const allA = [...e.querySelectorAll('a')];
    return allA.map(a => ({
      text: a.textContent.trim().slice(0, 30),
      href: a.getAttribute('href'),
      class: a.className.slice(0, 50),
    }));
  }));
  console.log('=== 51job 列表页卡片内链接 ===');
  console.log(JSON.stringify(links, null, 2));

  // 点击第一个职位的标题链接
  const firstTitleLink = await page.$('.joblist-item .jname');
  if (firstTitleLink) {
    console.log('\n=== 点击职位标题 ===');
    const [newPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 15000 }).catch(() => [null]),
      firstTitleLink.click(),
    ]);
    if (newPage) {
      await newPage.waitForLoadState('domcontentloaded', { timeout: 30000 });
      await newPage.waitForTimeout(3000);
      console.log('详情页URL:', newPage.url().slice(0, 200));
      console.log('标题:', await newPage.title());

      // 打印关键 DOM
      const info = await newPage.evaluate(() => {
        const body = document.body;
        if (!body) return { error: 'no body' };

        // 职位名称
        const title = document.querySelector('h1, .job-name, .jname, [class*=job-name], [class*=title]');
        // 薪资
        const salary = document.querySelector('.sal, [class*=salary], [class*=pay], .salary');
        // 公司
        const company = document.querySelector('.cname, [class*=company], .comName');
        // 职位描述
        const desc = document.querySelector('.job-desc, .job-detail, .job-intro, [class*=job-desc], [class*=job-intro], .bmsg, .job_msg, .tBorderTop_box');
        // 职位要求
        const req = document.querySelector('[class*=requirement], [class*=qualification], [class*=job-require]');

        return {
          title: title ? title.textContent.trim().slice(0, 100) : null,
          titleSelector: title ? (title.className || title.tagName) : null,
          salary: salary ? salary.textContent.trim().slice(0, 50) : null,
          company: company ? company.textContent.trim().slice(0, 50) : null,
          desc: desc ? desc.textContent.trim().slice(0, 400) : null,
          descSelector: desc ? (desc.className || desc.tagName) : null,
          req: req ? req.textContent.trim().slice(0, 200) : null,
          bodyText: body.innerText.slice(0, 600),
        };
      });
      console.log('\n详情页信息:');
      console.log(JSON.stringify(info, null, 2));

      // 列出包含 job/desc/bmsg 的 class
      const classes = await newPage.evaluate(() => {
        const all = document.querySelectorAll('[class]');
        const set = new Set();
        all.forEach(el => {
          el.classList.forEach(c => {
            if (/job|desc|bmsg|detail|intro|require|content/i.test(c)) set.add(c);
          });
        });
        return [...set].slice(0, 40);
      });
      console.log('\n相关 class:', classes.join(', '));

      await newPage.close();
    } else {
      console.log('没有打开新页面（可能是相同 tab 内跳转）');
      // 检查当前页URL变化
      await page.waitForTimeout(3000);
      console.log('当前URL:', page.url().slice(0, 200));
      const bodyText = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 500) : '');
      console.log('body:', bodyText.replace(/\n+/g, ' | '));
    }
  }

  await browser.close();
})();