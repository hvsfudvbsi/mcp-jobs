// 职位搜索站点列表
// 2026-08 实测状态：
// - 51job（we.51job.com/pc/search）：✅ 可用
// - 智联（www.zhaopin.com/jobs）：✅ 可用
// - BOSS直聘（m.zhipin.com）：⚠️ 实验性，stealth 模式受 IP 限速，不稳定
// - 猎聘（liepin.com）：❌ IP 级封禁
// - 拉勾（lagou.com）：❌ 阿里云 WAF 拦截
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
  // {
  //   url: 'https://www.liepin.com/zhaopin/',
  //   name: 'liepin',
  // },
  // {
  //   url: 'https://www.lagou.com/',
  //   name: 'lagou',
  // },
];
