// 职位搜索站点列表
// 2026-08 实测状态：
// - 51job（we.51job.com/pc/search）：✅ 可用
// - 智联（www.zhaopin.com/jobs）：✅ 可用
// - BOSS直聘（m.zhipin.com）：⚠️ 实验性，stealth 模式受 IP 限速，不稳定
// - 实习僧（shixiseng.com）：⚠️ 可用但标题/薪资字体混淆（Nuxt SSR）
// - 猎聘（liepin.com）：❌ IP 级封禁
// - 拉勾（lagou.com）：❌ 阿里云 WAF 拦截
// - 牛客网（nowcoder.com）：❌ 阿里云 WAF 拦截（API square-search 返回验证码）
// - 应届生求职网（yingjiesheng.com）：❌ 滑块验证码拦截（51job 系）
// - 脉脉（maimai.cn）：❌ 需登录 + 强反爬
// - 58同城（58.com）：❌ 强反爬
// - 赶集网（ganji.com）：❌ 强反爬
// - LinkedIn（linkedin.com）：❌ 需登录 + 强反爬
// - Indeed（indeed.com）：❌ 强反爬
// - Glassdoor（glassdoor.com）：❌ 需登录
// - Levels.fyi（levels.fyi）：✅ 可抓取（2026-08 实测：SSR 渲染无验证墙，公司薪资表可按级别提取；
//   属技术薪资数据站而非职位列表站，暂不纳入关键词搜索聚合，需要时可单独接入参考查询）
export const jobSearchUrls = [
  {
    url: 'https://we.51job.com/pc/search',
    name: '51job',
  },
  {
    url: 'https://www.zhaopin.com/jobs',
    name: 'zhaopin-jobs',
  },
  {
    url: 'https://m.zhipin.com/c100010000',
    name: 'zhipin',
  },
  {
    url: 'https://www.shixiseng.com/interns',
    name: 'shixiseng',
  },
  // 以下站点因反爬限制暂不可用
  // {
  //   url: 'https://www.yingjiesheng.com/commence',
  //   name: 'yingjiesheng',
  // },
  // {
  //   url: 'https://www.nowcoder.com/job/center',
  //   name: 'nowcoder',
  // },
  // {
  //   url: 'https://www.liepin.com/zhaopin/',
  //   name: 'liepin',
  // },
  // {
  //   url: 'https://www.lagou.com/',
  //   name: 'lagou',
  // },
  // {
  //   url: 'https://maimai.cn/',
  //   name: 'maimai',
  // },
  // {
  //   url: 'https://www.58.com/',
  //   name: '58tongcheng',
  // },
  // {
  //   url: 'https://www.ganji.com/',
  //   name: 'ganji',
  // },
  // {
  //   url: 'https://www.linkedin.com/jobs/',
  //   name: 'linkedin',
  // },
  // {
  //   url: 'https://www.indeed.com/',
  //   name: 'indeed',
  // },
  // {
  //   url: 'https://www.glassdoor.com/Job/',
  //   name: 'glassdoor',
  // },
  // Levels.fyi — ✅ 可抓取（薪资数据站，非职位列表源，暂不启用）
  // {
  //   url: 'https://www.levels.fyi/companies/google/salaries/software-engineer',
  //   name: 'levels-fyi',
  // },
];