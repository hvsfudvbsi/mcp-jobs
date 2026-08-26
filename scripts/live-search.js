#!/usr/bin/env node
/**
 * /api/search 真实链路冒烟测试（不 mock，真实爬取招聘网站）
 *
 * 用法：
 *   npm run build     # 先构建 dist
 *   npm run test:live # 启动 HTTP 服务并调用 /api/search
 *
 * 说明：会真实访问多个招聘网站，全程约 1~3 分钟；
 * 部分站点可能因反爬返回空结果，只要整体链路与字段结构正确即视为通过。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3999;
const DIST = path.join(__dirname, '..', 'dist', 'mcp.js');
const KEYWORD = process.argv[2] || 'java';

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(DIST)) {
  fail(`未找到 ${DIST}，请先执行 npm run build`);
}

const server = spawn(process.execPath, [DIST, '--http'], {
  env: { ...process.env, MCP_PORT: String(PORT) },
  stdio: 'ignore',
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (res.ok) return;
    } catch { /* 服务未就绪，重试 */ }
    await sleep(1000);
  }
  fail('HTTP 服务 30 秒内未就绪');
}

async function main() {
  await waitReady();
  console.log(`>> 调用 /api/search?keyword=${KEYWORD}（真实爬取中，约 1~3 分钟）...`);
  const t0 = Date.now();
  const res = await fetch(`http://127.0.0.1:${PORT}/api/search?keyword=${encodeURIComponent(KEYWORD)}&page=1`);
  const body = await res.json();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  if (!res.ok) fail(`HTTP ${res.status}: ${body.error || res.statusText}`);
  if (!Array.isArray(body.jobs)) fail('响应中 jobs 不是数组');
  if (body.total !== body.jobs.length) fail(`total(${body.total}) 与 jobs 数量(${body.jobs.length})不一致`);

  const sample = body.jobs[0];
  if (body.jobs.length > 0) {
    for (const field of ['title', 'salary', 'company', 'source']) {
      if (!(field in sample)) fail(`职位缺少字段: ${field}`);
    }
    if (typeof sample.source !== 'string' || !sample.source) {
      fail('职位缺少 source 来源标签');
    }
  }

  console.log(`✅ live 冒烟通过：HTTP ${res.status}，${body.total} 个职位（${elapsed}s）`);
  if (body.jobs.length > 0) {
    const counts = {};
    body.jobs.forEach((j) => { counts[j.source] = (counts[j.source] || 0) + 1; });
    console.log(`   来源分布: ${JSON.stringify(counts)}`);
    console.log(`   样例: ${JSON.stringify(sample)}`);
  } else {
    console.log('   未获取到职位（可能被站点反爬拦截，链路本身正常）');
  }
}

main()
  .catch((e) => fail(e.message))
  .finally(() => {
    server.kill();
    process.exit(0);
  });
