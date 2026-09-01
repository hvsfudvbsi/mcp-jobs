// 批量验证候选公司 slug 是否真实存在于 Levels.fyi（供 levelsFyiService 别名表扩容）
// 判据：标题匹配 /Salary | ... | Levels.fyi/ 说明公司薪资页真实存在
const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// [公司名, [候选 slug...]] — 按优先级排列，验证后取第一个有效的
const CANDIDATES = [
  ['比亚迪', ['byd', 'byd-company']],
  ['蔚来', ['nio', 'nio-inc']],
  ['理想汽车', ['li-auto', 'lixiang', 'li']],
  ['小鹏汽车', ['xpeng', 'xiaopeng']],
  ['中兴通讯', ['zte', 'zte-corporation']],
  ['海康威视', ['hikvision']],
  ['大华股份', ['dahua', 'zhejiang-dahua']],
  ['科大讯飞', ['iflytek']],
  ['商汤科技', ['sensetime']],
  ['旷视科技', ['megvii']],
  ['地平线', ['horizon-robotics']],
  ['寒武纪', ['cambricon']],
  ['一加', ['oneplus']],
  ['魅族', ['meizu']],
  ['传音控股', ['transsion']],
  ['富士康', ['foxconn', 'hon-hai']],
  ['荣耀', ['honor']],
  ['唯品会', ['vipshop', 'vip.com']],
  ['得物', ['dewu', 'dewushop']],
  ['叮咚买菜', ['dingdong', 'dingdong-maicai']],
  ['每日优鲜', ['missfresh']],
  ['苏宁易购', ['suning', 'suning-commerce', 'suning-com']],
  ['名创优品', ['miniso']],
  ['泡泡玛特', ['popmart', 'pop-mart']],
  ['米哈游', ['mihoyo', 'miHoYo', 'miHoYo-games']],
  ['莉莉丝', ['lilith', 'lilith-games']],
  ['鹰角网络', ['hypergryph', 'hypergryph-co']],
  ['叠纸游戏', ['papergames', 'paper-games']],
  ['心动公司', ['xd', 'xdinc', 'xd-game']],
  ['三七互娱', ['37games', 'sanqi-interactive', '37-games']],
  ['完美世界', ['perfect-world', 'perfectworld']],
  ['游族网络', ['youzu', 'youzu-interactive']],
  ['巨人网络', ['giant-network', 'giant-nework']],
  ['极致游戏', ['apex-games']],
  ['货拉拉', ['lalamove']],
  ['去哪儿', ['qunar', 'qunar-travel']],
  ['飞猪', ['fliggy']],
  ['同程旅行', ['tongcheng', 'tongcheng-elong', 'ly.com']],
  ['马蜂窝', ['mafengwo']],
  ['富途', ['futu', 'futu-holdings']],
  ['老虎证券', ['tiger-brokers']],
  ['度小满', ['duxiaoman']],
  ['陆金所', ['lufax']],
  ['众安保险', ['zhongan']],
  ['中国平安', ['pingan', 'ping-an', 'ping-an-insurance']],
  ['东方财富', ['eastmoney', 'eastmoney-securities']],
  ['同花顺', ['10jqka', 'hithink-royalflush']],
  ['金蝶', ['kingdee']],
  ['用友', ['yonyou']],
  ['广联达', ['glodon']],
  ['金山云', ['ksyun', 'kingsoft-cloud']],
  ['青云科技', ['qingcloud']],
  ['UCloud', ['ucloud']],
  ['奇安信', ['qianxin', 'qi-anxin', 'qihoo-360-qianxin']],
  ['深信服', ['sangfor']],
  ['中软国际', ['chinasoft-international', 'chinasoft']],
  ['软通动力', ['isoftstone', 'isoftstone-tech']],
  ['京东方', ['boe', 'boe-technology']],
  ['蓝思科技', ['lens-technology', 'lens-tech']],
  ['东山精密', ['dongshen-precision']],
  ['华勤技术', ['huaqin']],
  ['闻泰科技', ['wingtech']],
  ['汇川技术', ['inovance']],
  ['先导智能', ['leadintelligent']],
  ['欣旺达', ['sunwoda']],
  ['比亚迪电子', ['byd-electronics']],
  ['猿辅导', ['yuanfudao']],
  ['作业帮', ['zuoyebang']],
  ['好未来', ['tal', 'tal-education', 'xueersi']],
  ['新东方', ['new-oriental', 'new-oriental-education', 'eastedu']],
  ['网易有道', ['youdao']],
  ['流利说', ['liulishuo']],
  ['Keep', ['keep']],
  ['Soul', ['soul-app', 'soul']],
  ['小红书', ['xiaohongshu']],
  ['SHEIN', ['shein']],
  ['Anker', ['anker']],
  ['出门问问', ['mobvoi']],
  ['思必驰', ['aispeech']],
  ['云从科技', ['cloudwalk']],
  ['第四范式', ['4paradigm']],
  ['极飞科技', ['xaircraft']],
  ['大疆', ['dji']],
  // 海外/外企
  ['思科', ['cisco']],
  ['戴尔', ['dell']],
  ['惠普', ['hp', 'hewlett-packard']],
  ['ServiceNow', ['servicenow']],
  ['Workday', ['workday']],
  ['Atlassian', ['atlassian']],
  ['JetBrains', ['jetbrains']],
  ['Figma', ['figma']],
  ['Canva', ['canva']],
  ['PayPal', ['paypal']],
  ['Block', ['block', 'square']],
  ['Coinbase', ['coinbase']],
  ['Robinhood', ['robinhood']],
  ['Spotify', ['spotify']],
  ['DoorDash', ['doordash']],
  ['Lyft', ['lyft']],
  ['Dropbox', ['dropbox']],
  ['GitLab', ['gitlab']],
  ['MongoDB', ['mongodb']],
  ['Datadog', ['datadog']],
  ['Unity', ['unity', 'unity-technologies']],
  ['Roblox', ['roblox']],
  ['Epic Games', ['epic-games', 'epic']],
  ['Riot Games', ['riot-games', 'riot']],
  ['暴雪', ['blizzard', 'activision-blizzard']],
  ['任天堂', ['nintendo']],
  ['索尼', ['sony']],
  ['高通', ['qualcomm']],
  ['博通', ['broadcom']],
  ['联发科', ['mediatek']],
  ['台积电', ['tsmc']],
  ['ARM', ['arm']],
  ['诺基亚', ['nokia']],
  ['爱立信', ['ericsson']],
  ['施耐德', ['schneider-electric']],
  ['西门子', ['siemens']],
  ['博世', ['bosch']],
  ['大众汽车', ['volkswagen']],
  ['宝马', ['bmw']],
  ['梅赛德斯-奔驰', ['mercedes-benz', 'mercedes']],
  ['沃尔沃', ['volvo']],
  ['丰田', ['toyota']],
  ['耐克', ['nike']],
  ['Adidas', ['adidas']],
  ['迪士尼', ['disney', 'the-walt-disney-company']],
  ['Netflix', ['netflix']],
  ['Hulu', ['hulu']],
  ['Reddit', ['reddit']],
  ['Pinterest', ['pinterest']],
  ['Snap', ['snap']],
  ['Duolingo', ['duolingo']],
  ['Notion', ['notion']],
  ['Discord', ['discord']],
  ['Cloudflare', ['cloudflare']],
  ['Vercel', ['vercel']],
  ['Shopify', ['shopify']],
  ['Stripe', ['stripe']],
  ['Twilio', ['twilio']],
  ['Okta', ['okta']],
  ['CrowdStrike', ['crowdstrike']],
  ['Palo Alto Networks', ['palo-alto-networks']],
  ['Palantir', ['palantir']],
  ['Snowflake', ['snowflake']],
  ['Databricks', ['databricks']],
];

const TITLE_RE = /Salary\s*\|/i;

async function verify(browser, slug) {
  const page = await browser.newPage({ userAgent: UA, locale: 'en-US' });
  try {
    await page.goto(`https://www.levels.fyi/companies/${slug}/salaries/software-engineer`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const title = await page.title().catch(() => '');
    return TITLE_RE.test(title);
  } catch {
    return false;
  } finally {
    await page.close().catch(() => {});
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const results = [];
  const queue = [];
  for (const [name, slugs] of CANDIDATES) {
    slugs.forEach((slug) => queue.push({ name, slug }));
  }
  const CONCURRENCY = 3;
  const worker = async () => {
    while (queue.length) {
      const job = queue.shift();
      const ok = await verify(browser, job.slug);
      console.log(`${ok ? '✅' : '❌'} ${job.name} -> ${job.slug}`);
      results.push({ name: job.name, slug: job.slug, ok });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  await browser.close();

  console.log('\n=== 有效 slug 汇总 ===');
  const good = results.filter((r) => r.ok);
  const byName = {};
  for (const r of results) {
    (byName[r.name] = byName[r.name] || []).push(r);
  }
  for (const [name, list] of Object.entries(byName)) {
    const valid = list.filter((r) => r.ok).map((r) => r.slug);
    const chosen = valid[0] || null;
    if (valid.length) console.log(`  ${name} => ${chosen}${valid.length > 1 ? ' (备选: ' + valid.slice(1).join(', ') + ')' : ''}`);
  }
  console.log('\n全部无有效 slug:', Object.entries(byName).filter(([, l]) => !l.some((r) => r.ok)).map(([n]) => n).join('、') || '无');
})();