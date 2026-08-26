// 实习僧 v9: wait for __NUXT__ state
var chromium = require('playwright').chromium;
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

(async function() {
  var browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  var context = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: UA, locale: 'zh-CN' });
  var page = await context.newPage();

  console.log('>> loading...');
  await page.goto('https://www.shixiseng.com/interns?keyword=%E5%89%8D%E7%AB%AF&type=intern', { timeout: 30000 })
    .catch(function() {});
  
  // Wait for __NUXT__ to be populated or until timeout
  var hasNuxt = false;
  for (var i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    hasNuxt = await page.evaluate(function() {
      var n = window.__NUXT__;
      return !!(n && n.state && Object.keys(n.state).length > 0);
    });
    if (hasNuxt) { console.log('  __NUXT__ ready after ' + (i+1) + 's'); break; }
  }
  if (!hasNuxt) console.log('  __NUXT__ not populated after 20s');

  console.log('  title:', await page.title().catch(function() { return '?'; }));

  // Dump state keys
  var stateKeys = await page.evaluate(function() {
    var n = window.__NUXT__;
    if (!n || !n.state) return null;
    return Object.keys(n.state);
  });
  console.log('  state keys:', JSON.stringify(stateKeys));

  // If state exists, dump first value deeply
  var stateSample = await page.evaluate(function() {
    var n = window.__NUXT__;
    if (!n || !n.state) return null;
    var keys = Object.keys(n.state);
    var result = {};
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = n.state[k];
      if (Array.isArray(v)) result[k] = 'array(' + v.length + ') ' + JSON.stringify(v[0]).substring(0, 300);
      else if (v && typeof v === 'object') result[k] = 'object keys=' + JSON.stringify(Object.keys(v).slice(0, 10));
      else result[k] = JSON.stringify(v).substring(0, 200);
    }
    return result;
  });
  console.log('  state sample:', JSON.stringify(stateSample, null, 2));

  // Look for internList or similar
  var findIntern = await page.evaluate(function() {
    var n = window.__NUXT__;
    if (!n || !n.state) return null;
    for (var k in n.state) {
      if (k.toLowerCase().indexOf('intern') > -1 || k.toLowerCase().indexOf('list') > -1) {
        var v = n.state[k];
        return { key: k, type: Array.isArray(v) ? 'array(' + v.length + ')' : typeof v };
      }
    }
    return null;
  });
  console.log('  findIntern:', JSON.stringify(findIntern));

  await browser.close();
  console.log('Done.');
})();