import { chromium, firefox, webkit, Browser, BrowserContext, Page, ElementHandle } from 'playwright';
import { SiteConfig, CrawlerRule } from '../config/crawlerConfig';
import { crawlerConfigs } from '../config/crawlerConfig';
import { crawlerConfigService } from '../services/crawlerConfigService';

export interface CrawlerData {
  url: string;
  data: Record<string, any>;
  rawData?: Record<string, any>;  // 存储原始数据
  timestamp: number;
  params?: Record<string, string>;
  succeeded: boolean;
  errors?: string[];
}

export class WebCrawler {
  private crawledData: Map<string, CrawlerData[]>;
  private debug: boolean;
  private browser: Browser | null;
  private context: BrowserContext | null;
  private currentSiteConfig?: SiteConfig;

  constructor(debug?: boolean) {
    // 如果没有明确指定 debug，则从配置服务获取
    this.debug = debug !== undefined ? debug : crawlerConfigService.isDebugMode();
    this.crawledData = new Map();
    this.browser = null;
    this.context = null;
    this.log('Initializing WebCrawler...');
    this.log(crawlerConfigService.getConfigSummary());
  }

  private log(message: string, data?: any): void {
    if (this.debug) {
      const timestamp = new Date().toISOString();
      // console.log(`[${timestamp}] ${message}`);
      // if (data) {
      //   console.log(JSON.stringify(data, null, 2));
      // }
    }
  }

  private async setupBrowser(): Promise<void> {
    if (!this.browser) {
      this.log('Launching browser...');

      const launchOptions = {
        headless: true,
        args: [
          '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
        ],
      };

      this.browser = await chromium.launch(launchOptions);
      this.log('Browser launched');
    }

    if (!this.context) {
      this.log('Creating browser context...');

      const bc = this.currentSiteConfig?.browserConfig;
      const contextOptions: any = {
        viewport: bc?.viewport || { width: 1280, height: 800 },
        userAgent: bc?.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36',
        locale: 'zh-CN',
      };
      if (bc?.isMobile) {
        contextOptions.isMobile = true;
        contextOptions.hasTouch = true;
      }
      console.log('[context] vp=', JSON.stringify(contextOptions.viewport), 'mobile=', contextOptions.isMobile);

      this.context = await this.browser.newContext(contextOptions);
      this.log('Browser context created');
    }
  }

  private async closeBrowser(): Promise<void> {
    if (this.context) {
      this.log('Closing browser context...');
      await this.context.close();
      this.context = null;
    }
    
    if (this.browser) {
      this.log('Closing browser...');
      await this.browser.close();
      this.browser = null;
    }
  }

  private async handleUrl(url: string, config: SiteConfig, params?: Record<string, string>): Promise<void> {
    this.log(`Starting to crawl URL: ${url}`);
    
    if (!this.browser || !this.context) {
      await this.setupBrowser();
    }
    
    let page: Page | null = null;
    // Stealth 模式下在轮询中提取的数据，跳过后续 extractData
    let stealthExtracted: { rawData: Record<string, any>, processedData: Record<string, any> } | null = null;
    
    try {
      this.log('Creating new page...');
      page = await this.context!.newPage();

      // 注入 stealth 反检测脚本
      if (config.stealthMode) {
        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
          Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
          Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
          (window as any).chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
        });
      }
      
      // Navigate to the URL with timeout
      const timeout = config.timeout || 30000;
      this.log(`Navigating to ${url} with timeout ${timeout}ms`);
      
      if (config.stealthMode) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeout });
        
        // 完全复制测试的 evaluate 轮询方式
        const sel = config.waitForSelector || 'body';
        for (let i = 0; i < 40; i++) {
          await page.waitForTimeout(500);
          try {
            const status: any = await page.evaluate((s) => {
              const u = window.location.href;
              if (u === 'about:blank') return { state: 'blank' };
              if (u.includes('security') || u.includes('passport')) return { state: 'security' };
              const count = document.querySelectorAll(s).length;
              return { state: count > 0 ? 'ready' : 'waiting', count };
            }, sel);
            if (status.state === 'ready') {
              console.log(`[stealth] ready after ${(i+1)*0.5}s (${status.count} items)`);
              stealthExtracted = await this.extractData(page, config);
              break;
            }
            if (status.state === 'blank' && i > 10) break;
          } catch {
            // eval error during transition, retry
          }
        }
        if (!stealthExtracted) {
          console.log('[stealth] did not stabilize');
        }
      } else {
        // 正常模式
        await page.goto(url, { 
          waitUntil: 'domcontentloaded',
          timeout: timeout
        });
        
        await page.waitForTimeout(2000);
        
        if (config.waitForSelector) {
          try {
            await page.waitForSelector(config.waitForSelector, { timeout: 15000 });
          } catch (error) {
            this.log(`waitForSelector "${config.waitForSelector}" timed out`, error);
          }
        }
        
        // 小延迟让 AJAX/SPA 完成渲染
        await page.waitForTimeout(500);
      }
      
      this.log('Page loaded successfully');
      
      this.log('Extracting data using rules:', config.rules);
      const { rawData, processedData } = stealthExtracted || await this.extractData(page, config);
      this.log('Data extracted successfully:', { raw: rawData, processed: processedData });
      
      const crawlerData: CrawlerData = {
        url: url,
        data: processedData,
        rawData,
        timestamp: Date.now(),
        params: params,
        succeeded: true
      };

      this.log(`Saving data for site: ${config.name}`);
      this.saveData(config.name, crawlerData);
      this.log('Data saved successfully');
      
    } catch (error: any) {
      this.log(`Error crawling ${url}:`, error);
      const errorData: CrawlerData = {
        url: url,
        data: {},
        timestamp: Date.now(),
        succeeded: false,
        errors: [error.message]
      };
      this.log('Saving error data');
      this.saveData(config.name, errorData);
    } finally {
      if (page) {
        this.log('Closing page...');
        await page.close();
      }
    }
  }

  private saveData(siteName: string, data: CrawlerData): void {
    this.log(`Saving data for site: ${siteName}`, data);
    if (!this.crawledData.has(siteName)) {
      this.log(`Creating new data array for site: ${siteName}`);
      this.crawledData.set(siteName, []);
    }
    this.crawledData.get(siteName)?.push(data);
    this.log(`Current data count for ${siteName}: ${this.crawledData.get(siteName)?.length}`);
  }

  private async extractData(page: Page, config?: SiteConfig): Promise<{ rawData: Record<string, any>, processedData: Record<string, any> }> {
    const rawData: Record<string, any> = {};
    const processedData: Record<string, any> = {};
    const rules = config?.rules || crawlerConfigs.find(c => {
      return c.url === page.url() || (c.urlPattern && new RegExp(c.urlPattern).test(page.url()))
    })?.rules;

    for (const [key, rule] of Object.entries(rules || [])) {
      this.log(`Extracting data for rule: ${key}`, rule);
      try {
        const elements = await page.$$(rule.selector);
        this.log(`Found ${elements.length} elements for selector: ${rule.selector}`);
        
        // 获取原始数据
        const values = await Promise.all(
          elements.map(async (element) => {
            switch (rule.type) {
              case 'text':
                return await element.textContent();
              case 'attribute':
                return await element.getAttribute(rule.attribute || '');
              case 'html':
                return await element.innerHTML();
              default:
                return null;
            }
          })
        );

        // 存储原始数据
        rawData[key] = values.length === 1 ? values[0] : values;
        this.log(`Extracted raw value for ${key}:`, rawData[key]);

        // 应用数据处理器
        if (rule.handler) {
          try {
            // 对每个元素应用处理器
            const results = await Promise.all(
              elements.map(async (element) => {
                return rule.handler!(processedData, rawData[key], element);
              })
            );

            processedData[key] = results.length === 1 ? results[0] : results;
            this.log(`Processed value for ${key}:`, processedData[key]);
          } catch (error) {
            this.log(`Error in handler for ${key}:`, error);
            processedData[key] = rawData[key];
          }
        } else {
          processedData[key] = rawData[key];
        }

      } catch (error) {
        this.log(`Error extracting data for rule ${key}:`, error);
        rawData[key] = null;
        processedData[key] = null;
      }
    }

    return { rawData, processedData };
  }

  async crawl(config: SiteConfig & { params?: Record<string, string> }): Promise<void> {
    this.log('Starting crawl with config:', config);

    // 设置当前站点配置，以便 setupBrowser 可以使用站点特定的浏览器配置
    this.currentSiteConfig = config;

    try {
      await this.setupBrowser();
      await this.handleUrl(config.url, config, config.params);
    } finally {
      // Only close the browser when we're done with all URLs
      await this.closeBrowser();
      // 清理当前站点配置
      this.currentSiteConfig = undefined;
    }

    this.log('Crawl completed');
  }

  // 数据读取接口
  getData(siteName?: string): | CrawlerData[] | null {
    this.log(`Getting data${siteName ? ` for site: ${siteName}` : ' for all sites'}`);
    const data = siteName 
      ? this.crawledData.get(siteName) || null
      : Array.from(this.crawledData.entries()).reduce((acc, [key, value]) => {
          acc.push(...value);
          return acc;
        }, [] as CrawlerData[])
    this.log('Retrieved data:', data);
    return data;
  }

  // 获取最新数据
  getLatestData(siteName: string): CrawlerData | null {
    this.log(`Getting latest data for site: ${siteName}`);
    const siteData = this.crawledData.get(siteName);
    if (!siteData || siteData.length === 0) {
      this.log(`No data found for site: ${siteName}`);
      return null;
    }
    const latestData = siteData[siteData.length - 1];
    this.log('Latest data:', latestData);
    return latestData;
  }

  // 获取成功爬取的数据
  getSuccessfulData(siteName: string): CrawlerData[] {
    this.log(`Getting successful data for site: ${siteName}`);
    const siteData = this.crawledData.get(siteName);
    if (!siteData) {
      this.log(`No data found for site: ${siteName}`);
      return [];
    }
    const successfulData = siteData.filter(data => data.succeeded);
    this.log(`Found ${successfulData.length} successful entries`);
    return successfulData;
  }

  // 获取失败的数据
  getFailedData(siteName: string): CrawlerData[] {
    this.log(`Getting failed data for site: ${siteName}`);
    const siteData = this.crawledData.get(siteName);
    if (!siteData) {
      this.log(`No data found for site: ${siteName}`);
      return [];
    }
    const failedData = siteData.filter(data => !data.succeeded);
    this.log(`Found ${failedData.length} failed entries`);
    return failedData;
  }

  // 清除数据
  clearData(siteName?: string): void {
    if (siteName) {
      this.log(`Clearing data for site: ${siteName}`);
      this.crawledData.delete(siteName);
    } else {
      this.log('Clearing all data');
      this.crawledData.clear();
    }
  }
} 