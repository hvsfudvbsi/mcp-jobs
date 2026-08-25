import { ElementHandle } from 'playwright';

export interface CrawlerRule {
  selector: string;      // CSS 选择器
  attribute?: string;    // 要获取的属性（如 href, src 等）
  type: 'text' | 'attribute' | 'html';  // 获取类型
  handler?: (currentData: Record<string, any>, extractedValue: any, element: ElementHandle<Element>) => Promise<any>;  // 数据处理器
}

export interface BrowserConfig {
  headless?: boolean;    // 是否无头模式运行
  timeout?: number;      // 页面超时时间
  viewport?: {           // 视窗大小
    width: number;
    height: number;
  };
  userAgent?: string;    // 用户代理
  initScript?: string;   // 页面加载前注入的反检测脚本
  isMobile?: boolean;    // 移动端模式
  hasTouch?: boolean;    // 触摸支持
}

export interface SiteConfig {
  url: string;           // 网站URL
  name: string;          // 网站名称
  urlPattern?: string;   // URL 匹配模式（支持正则表达式）
  urlBuilder: (url: string, params: Record<string, any>, paramsConfig: Record<string, any>) => string; // URL 构建器
  rules: {              // 数据提取规则
    [key: string]: CrawlerRule;
  };
  config?: {
    [key: string]: {
      name: string;
      description: string;
      type: string;
      default: string;
      rule?: Record<string, string>;
    };
  };
  maxRequestsPerCrawl?: number;
  maxConcurrency?: number;
  timeout?: number;
  waitForSelector?: string;  // 动态渲染页面：等待该选择器出现后再提取数据
  browserConfig?: BrowserConfig;  // 浏览器配置
  stealthMode?: boolean;  // 是否启用反检测模式（注入 stealth 脚本）
}

export const crawlerConfigs: SiteConfig[] = [
  {
    url: 'https://www.zhaopin.com/jobs',
    name: 'zhaopin-jobs',
    urlPattern: '^https://www\\.zhaopin\\.com/jobs.*$',
    urlBuilder: (url, params, paramsConfig) => {
      const { keyword, city, page } = params;
      const { cityCode } = paramsConfig;
      const code = (cityCode && cityCode.rule && cityCode.rule[city]) ? cityCode.rule[city] : '489';
      return `https://www.zhaopin.com/jobs?jl=${code}&kw=${encodeURIComponent(keyword || '')}&p=${page || 1}`;
    },
    config: {
      cityCode: {
        name: 'cityCode',
        description: '城市编码',
        type: 'string',
        default: '489',
        rule: {
          '北京': '489', '上海': '538', '广州': '763', '深圳': '765',
          '杭州': '801', '南京': '635', '武汉': '636', '成都': '725',
          '西安': '854', '天津': '531', '苏州': '738', '重庆': '551',
          '长沙': '749', '郑州': '719', '东莞': '393', '宁波': '689',
          '厦门': '686', '合肥': '597', '济南': '702',
          '青岛': '723', '大连': '650', '沈阳': '621', '福州': '536',
          '昆明': '744', '贵阳': '733', '哈尔滨': '690', '无锡': '770',
          '佛山': '616', '珠海': '797', '中山': '773', '常州': '709',
          '徐州': '643', '嘉兴': '750', '南昌': '660', '石家庄': '800',
          '烟台': '591', '南通': '816', '太原': '530', '长春': '742',
          '温州': '820', '绍兴': '825', '台州': '771', '泉州': '676',
          '海口': '806', '南宁': '672', '兰州': '712', '扬州': '848',
          '三亚': '865', '惠州': '830'
        }
      }
    },
    rules: {
      jobInfo: {
        selector: '.job-card',
        type: 'html',
        handler: async (currentData, value, element) => {
          const title = await element.$eval('[class*="title"] .vue-clamp__text, .job-card__title-clamp span[aria-label]', el => el.textContent?.trim() || '').catch(() => '');
          const salary = await element.$eval('.job-card__salary', el => el.textContent?.trim() || '').catch(() => '');
          const company = await element.$eval('.job-card__company-name', el => el.textContent?.trim() || '').catch(() => '');
          const address = await element.$eval('.job-card__location span', el => el.textContent?.trim() || '').catch(() => '');
          const tags = await element.$$eval('.job-card__skill-tag', els => els.map(el => el.textContent?.trim() || '')).catch(() => []);
          // 智联搜索页卡片只有公司链接没有职位详情链接（JS 事件），暂留空
          return { title, salary, company, address, jobDetail: '', tags };
        }
      }
    },
    maxRequestsPerCrawl: 1,
    maxConcurrency: 1,
    timeout: 60000
  },
  {
    url: 'https://www.liepin.com/zhaopin/',
    name: 'liepin',
    urlPattern: '^https://www\\.liepin\\.com/zhaopin/.*$',
    urlBuilder: (url, params, paramsConfig) => {
      const { keyword, salary, workYear, page } = params;
      const { salaryCode, workYearCode } = paramsConfig;
      return url + `?city=000&dq=000&key=${encodeURIComponent(keyword)}&currentPage=${page}&salaryCode=${salaryCode.rule[salary] || ''}&workYearCode=${workYearCode.rule[workYear] || ''}`;
    },
    // 示例：为猎聘网站配置特定的浏览器设置
    browserConfig: {
      // 可以在这里覆盖全局设置
      // headless: false,  // 如果需要调试此特定网站，可以设置为 false
      // timeout: 45000,   // 如果此网站需要更长的加载时间
    },
    config: {
      salaryCode: {
        name: 'salaryCode',
        description: '薪资编码',
        type: 'string',
        default: '',
        rule: {
          '10万以下': '1',
          '10-15万': '2',
          '16-20万': '3',
          '21-30万': '4',
          '31-50万': '5',
          '51-100万': '6',
          '100万以上': '7'
        }
      },
      workYearCode: {
        name: 'workYearCode',
        description: '工作经验',
        type: 'string',
        default: '',
        rule: {
          '应届生': '1',
          '实习生': '2',
          '1年以下': '0$1',
          '1-3年': '1$3',
          '3-5年': '3$5',
          '5-10年': '5$10',
          '10年以上': '10$999'
        }
      }
    },
    rules: {
      jobInfo: {
        selector: '.job-card-pc-container',
        type: 'html',
        handler: async (currentData, value, element) => {
          try {
            // console.log('element，当前元素内容：');
            // 使用 $eval 获取子元素内容
            const title = await element.$eval('.job-title-box > .ellipsis-1', el => el.textContent?.trim() || '');
            const salary = await element.$eval('.job-salary', el => el.textContent?.trim() || '');
            const company = await element.$eval('.company-name', el => el.textContent?.trim() || '');
            const address = await element.$eval('.job-dq-box', el => el.textContent?.trim() || '');
            // 使用 $$eval 获取多个子元素
            let tags = await element.$$eval('.job-labels-box span', elements => 
              elements.map(el => el.textContent?.trim() || '')
            );

            const companyTags = await element.$$eval('.company-tags-box span', elements => 
              elements.map(el => el.textContent?.trim() || '')
            );

            tags = [...tags, ...companyTags];

            // 职位详情
            const jobDetail = await element.$eval('a', el => el.getAttribute('href') || '');

            // console.log('Extracted job info:', { title, salary, company, address, tags, jobDetail });

            return {
              title,
              salary,
              company,
              address,
              tags,
              jobDetail
            };
          } catch (error) {
            console.error('Error extracting job info:', error);
            // 如果出错，尝试使用另一种方式获取
            const content = await element.textContent();
            // console.log('Raw element content:', content);
            return { content };
          }
        }
      },
    },
    maxRequestsPerCrawl: 1,
    maxConcurrency: 1,
    timeout: 30000
  },
  {
    url: 'https://m.zhipin.com/c100010000',
    name: 'zhipin',
    urlPattern: '^https://m\\.zhipin\\.com/c100010000.*$',
    browserConfig: {
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      isMobile: true,
      hasTouch: true,
    },
    urlBuilder: (url, params, paramsConfig) => {
      const { keyword, page } = params;
      const kw = keyword ? keyword.split(' ')[0] : '';
      return `https://m.zhipin.com/c100010000/?query=${encodeURIComponent(kw)}&page=${page || 1}`;
    },
    rules: {
      jobInfo: {
        selector: 'li.item',
        type: 'html',
        handler: async (currentData, value, element) => {
          // console.log('element，begin：');
          const title = await element.$eval('.title-text', el => el.textContent?.trim() || '');
          const salary = await element.$eval('.salary', el => el.textContent?.trim() || '');
          const company = await element.$eval('.company', el => el.textContent?.trim() || '');
          const address = await element.$eval('.workplace', el => el.textContent?.trim() || '');
          
          const jobDetail = await element.$eval('a', el => {
            const href = el.getAttribute('href') || '';
            return href.startsWith('https://') ? href : `https://m.zhipin.com${href}`;
          });
          
          const tags = await element.$$eval('.labels span', elements => 
            elements.map(el => el.textContent?.trim() || '')
          );
          // console.log('element，当前元素内容：', { title, salary, company, address, jobDetail, tags });
          return { title, salary, company, address, jobDetail, tags };
        }
      }
    },
    waitForSelector: 'li.item',
    stealthMode: true,
    timeout: 60000,
    maxRequestsPerCrawl: 1,
    maxConcurrency: 1,
  },
  {
    url: 'https://www.51job.com/',
    name: '51job',
    urlPattern: '^https://we\\.51job\\.com/pc/search.*$',
    urlBuilder: (url, params, paramsConfig) => {
      const { keyword, page } = params;
      // searchJobList 会把 keyword 和 city 拼在一起（如 "前端开发 北京"），51job 只需要关键词部分
      const key = keyword ? keyword.split(' ')[0] : '';
      return `https://we.51job.com/pc/search?keyword=${encodeURIComponent(key)}&searchType=2&sortType=0&metro=&pageNum=${page || 1}`;
    },
    rules: {
      jobInfo: {
        selector: '.joblist-item',
        type: 'html',
        handler: async (currentData, value, element) => {
          const title = await element.$eval('.jname', el => el.textContent?.trim() || '');
          const salary = await element.$eval('.sal', el => el.textContent?.trim() || '');
          const company = await element.$eval('.cname', el => el.textContent?.trim() || '');
          const address = await element.$eval('.area', el => el.textContent?.trim() || '');
          const jobDetail = await element.$eval('a', el => {
            const href = el.getAttribute('href') || '';
            return href.startsWith('http') ? href : `https://we.51job.com${href}`;
          });
          const tags = await element.$$eval('.tag', els => els.map(el => el.textContent?.trim() || ''));
          return { title, salary, company, address, jobDetail, tags };
        }
      }
    },
    waitForSelector: '.joblist-item',
    maxRequestsPerCrawl: 1,
    maxConcurrency: 1,
    timeout: 30000
  },
  {
    url: '',
    name: 'zhipin-detail',
    urlPattern: '^https://m\\.zhipin\\.com/job_detail/.*$',
    browserConfig: {
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      isMobile: true,
      hasTouch: true,
    },
    urlBuilder: (url, params, paramsConfig) => {
      return url;
    },
    rules: {
      job: {
        selector: '.job-detail',
        type: 'html',
        handler: async (currentData, value, element) => {
          const jobDescription = await element.$eval('.job-sec > .text', el => el.textContent?.trim() || '');
          const companyDescription = await element.$eval('.job-sec > .detail-text', el => el.textContent?.trim() || '');
          return { jobDescription, companyDescription };         
        }
      }
    },
    stealthMode: true,
  },
  {
    url: '',
    name: 'liepin-detail',
    urlPattern: '^https://www.liepin.com/job/.*$',
    urlBuilder: (url, params, paramsConfig) => {
      return url;
    },
    rules: {
      job: {
        selector: 'body',
        type: 'html',
        handler: async (currentData, value, element) => {
          const jobDescription = await element.$eval('.job-intro-container dd', el => el.textContent?.trim() || '');
          const companyDescription = await element.$eval('.company-intro-container .ellipsis-3', el => el.textContent?.trim() || '');
          return { jobDescription, companyDescription };         
        }
      }
    }
  },
  // ===== 2026-08 新增站点（实验性 / 禁用） =====
  //
  // 牛客网 nowcoder — ❌ 阿里云 WAF 拦截
  //   URL: https://www.nowcoder.com/job/center?recruitType=1
  //   API: POST /np-api/u/job/square-search
  //     body: requestFrom=1&page=1&pageSize=20&recruitType=2&pageSource=5001&query=${keyword}
  //     返回: WAF 验证码 HTML，无法获取 JSON
  //   输入框: .input-search-filter input（placeholder="请输入公司名或职位名搜索"）
  //   Vue SPA，交互式搜索（Enter 触发 square-search POST）
  //
  // 应届生求职网 yingjiesheng — ❌ 滑块验证码拦截（51job 系）
  //   搜索页: https://q.yingjiesheng.com/jobs/search/?jobarea=010000&keyword=
  //   搜索结果返回：滑动验证页面
  //   stealth 模式也无效，与 51job 主站不同（51job 搜索页可过，应届生子域必须滑块）
  //
  // 实习僧 shixiseng — ⏳ 待探测
  //   URL: https://www.shixiseng.com/interns?keyword=&type=intern
  // {
  //   url: 'https://www.nowcoder.com/job/center',
  //   name: 'nowcoder',
  //   urlPattern: '^https://www\\.nowcoder\\.com/job/center.*$',
  //   urlBuilder: (url, params, paramsConfig) => {
  //     const { keyword, page } = params;
  //     const kw = keyword ? keyword.split(' ')[0] : '';
  //     return `https://www.nowcoder.com/job/center?recruitType=1&keyword=${encodeURIComponent(kw)}&page=${page || 1}`;
  //   },
  //   ...
  // },
  {
    url: 'https://www.shixiseng.com/interns',
    name: 'shixiseng',
    urlPattern: '^https://www\\.shixiseng\\.com/interns.*$',
    urlBuilder: (url, params, paramsConfig) => {
      const { keyword, page } = params;
      const kw = keyword ? keyword.split(' ')[0] : '';
      return `https://www.shixiseng.com/interns?keyword=${encodeURIComponent(kw)}&page=${page || 1}&type=intern`;
    },
    rules: {
      jobInfo: {
        selector: '.intern-item',
        type: 'html',
        handler: async (currentData, value, element) => {
          const title = await element.$eval('.intern-title, .job-title, [class*="title"]', el => el.textContent?.trim() || '') as string;
          const salary = await element.$eval('.intern-salary, [class*="salary"], [class*="wage"]', el => el.textContent?.trim() || '') as string;
          const company = await element.$eval('.company-name, [class*="company"]', el => el.textContent?.trim() || '') as string;
          const address = await element.$eval('.intern-address, [class*="location"], [class*="city"]', el => el.textContent?.trim() || '') as string;
          const jobDetail = await element.$eval('a', (el: any) => {
            const href = el.getAttribute('href') || '';
            return href.startsWith('http') ? href : `https://www.shixiseng.com${href}`;
          }) as string;
          const tags: string[] = await element.$$eval('.intern-tag, [class*="tag"], [class*="label"]', (els: any[]) => els.map((el: any) => el.textContent?.trim() || ''));
          return { title, salary, company, address, jobDetail, tags };
        }
      }
    },
    waitForSelector: '.intern-item',
    maxRequestsPerCrawl: 1,
    maxConcurrency: 1,
    timeout: 30000
  },
  // 应届生求职网 — ❌ 滑块验证码（q.yingjiesheng.com，51job 系）
  //   实际搜索页: https://q.yingjiesheng.com/jobs/search/?jobarea=010000&keyword=
  //   stealth 也绕不过滑动验证
  // {
  //   url: 'https://q.yingjiesheng.com/jobs/search/',
  //   name: 'yingjiesheng',
  //   urlPattern: '^https://q\\.yingjiesheng\\.com/jobs/search.*$',
  //   urlBuilder: (url, params, paramsConfig) => {
  //     const { keyword, page } = params;
  //     const kw = keyword ? keyword.split(' ')[0] : '';
  //     return `https://q.yingjiesheng.com/jobs/search/?keyword=${encodeURIComponent(kw)}&jobarea=010000`;
  //   },
  //   rules: {
  //     jobInfo: {
  //       selector: '.job-item',
  //       type: 'html',
  //       handler: async (currentData, value, element) => {
  //         const title = await element.$eval('[class*="title"], a[class*="name"]', el => el.textContent?.trim() || '') as string;
  //         const salary = await element.$eval('[class*="salary"], [class*="wage"]', el => el.textContent?.trim() || '') as string;
  //         const company = await element.$eval('[class*="company"]', el => el.textContent?.trim() || '') as string;
  //         const address = await element.$eval('[class*="location"], [class*="city"]', el => el.textContent?.trim() || '') as string;
  //         const jobDetail = await element.$eval('a', (el: any) => { const href = el.getAttribute('href') || ''; return href.startsWith('http') ? href : `https://q.yingjiesheng.com${href}`; }) as string;
  //         const tags: string[] = await element.$$eval('[class*="tag"], [class*="label"]', (els: any[]) => els.map((el: any) => el.textContent?.trim() || ''));
  //         return { title, salary, company, address, jobDetail, tags };
  //       }
  //     }
  //   },
  //   waitForSelector: '.job-item',
  //   maxRequestsPerCrawl: 1, maxConcurrency: 1, timeout: 30000,
  //   stealthMode: true
  // },
];