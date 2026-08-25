// 职位搜索站点列表
// 2026-08 实测状态：
// - 51job（we.51job.com/pc/search）：✅ 可用
// - 智联（www.zhaopin.com/jobs）：✅ 可用
// - BOSS直聘（m.zhipin.com）：⚠️ 实验性，stealth 模式受 IP 限速，不稳定
// - 猎聘（liepin.com）：❌ IP 级封禁
// - 拉勾（lagou.com）：❌ 阿里云 WAF 拦截
// - 牛客网（nowcoder.com）：❌ 阿里云 WAF 拦截（API square-search 返回验证码）
// - 应届生求职网（yingjiesheng.com）：❌ 滑块验证码拦截（51job 系，q.yingjiesheng.com 统一滑动验证）
// - 脉脉（maimai.cn）：❌ 需登录 + 强反爬
// - 实习僧（shixiseng.com）：⏳ 待验证
// - 58同城（58.com）：❌ 强反爬
// - 赶集网（ganji.com）：❌ 强反爬
// - LinkedIn（linkedin.com）：❌ 需登录 + 强反爬
// - Indeed（indeed.com）：❌ 强反爬
// - Glassdoor（glassdoor.com）：❌ 需登录
// - Levels.fyi（levels.fyi）：⏳ 待验证（技术薪资数据）
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
  // 以下站点实验性支持（选择器待探测验证）
  // {
  //   url: 'https://www.shixiseng.com/interns',
  //   name: 'shixiseng',
  // },
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
  // {
  //   url: 'https://www.levels.fyi/',
  //   name: 'levels-fyi',
  // },
];