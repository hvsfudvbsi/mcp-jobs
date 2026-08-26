// 直接用 crawler 的类来测试
const { WebCrawler } = require('./dist/crawler/webCrawler');
const { crawlerConfigs } = require('./dist/config/crawlerConfig');

async function main() {
  const bossConfig = crawlerConfigs.find(c => c.name === 'zhipin');
  console.log('BOSS config:', JSON.stringify({ 
    url: bossConfig.url,
    stealthMode: bossConfig.stealthMode,
    browserConfig: bossConfig.browserConfig,
    waitForSelector: bossConfig.waitForSelector,
  }, null, 2));

  // 用 WebCrawler 直接爬
  const crawler = new WebCrawler();
  const url = 'https://m.zhipin.com/c100010000/?query=%E5%89%8D%E7%AB%AF%E5%BC%80%E5%8F%91&page=1';
  
  console.log('Starting crawl...');
  await crawler.crawl({ ...bossConfig, url, params: { keyword: '' } });
  
  const data = crawler.getData('zhipin');
  console.log('\nResult:', JSON.stringify(data, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });