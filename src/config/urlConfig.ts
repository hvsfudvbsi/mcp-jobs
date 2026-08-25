// 职位搜索站点列表
// 2026-08 实测状态：
// - 51job（we.51job.com/pc/search）：✅ 可用，支持异步渲染职位列表
// - 智联（www.zhaopin.com/jobs）：✅ 可用，SSR 渲染不需 API token
// - 猎聘（liepin.com）：❌ 匿名被反爬清空页面 + API 返回 400
// - BOSS直聘（m.zhipin.com）：❌ 跳转登录页 + API 需 __zp_stoken__ 签名
// - 拉勾（lagou.com）：❌ 阿里云 WAF 拦截
// 后三者需提供登录态 Cookie 或 stealtR浏览器指纹后可尝试启用。
export const jobSearchUrls = [
  {
    url: 'https://we.51job.com/pc/search',
    name: '51job',
  },
  {
    url: 'https://www.zhaopin.com/jobs',
    name: 'zhaopin-jobs',
  },
  // {
  //   url: 'https://m.zhipin.com/c100010000',
  //   name: 'zhipin',
  // },
  // {
  //   url: 'https://www.liepin.com/zhaopin/',
  //   name: 'liepin',
  // },
  // {
  //   url: 'https://www.lagou.com/',
  //   name: 'lagou',
  // },
];
