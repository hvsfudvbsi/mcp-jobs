#!/usr/bin/env node

import http from 'http';
import os from 'os';
import { webcrypto } from 'crypto';

// Node 18 下全局 crypto 未默认启用，SDK 依赖它，这里做兼容 polyfill
if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = webcrypto;
}
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  Tool,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { searchJobList, crawlJobDetail, enrichSalaryRefs, SearchParams } from './index';
import { buildSummary, getSummaryCoreSource } from './services/summaryService';

// 页面内嵌脚本的总结纯逻辑：直接注入 summaryService 编译后源码（单一源码，避免前后端分叉）
const SUMMARY_CORE_SOURCE = getSummaryCoreSource();


dotenv.config();

// 服务版本：与 package.json 保持一致，Server 信息与 /health 统一从这里取
const VERSION = '1.5.0';

// Web 搜索页面（内嵌单文件，无需额外静态资源）
export const WEB_UI_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>mcp-jobs 职位搜索</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; background: #f5f7fa; color: #333; padding: 24px; }
  .container { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .sub { color: #888; font-size: 13px; margin-bottom: 20px; }
  form { display: flex; flex-wrap: wrap; gap: 10px; background: #fff; padding: 16px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 20px; }
  input { padding: 9px 12px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 14px; }
  input.kw { flex: 1 1 220px; }
  input.sm { width: 110px; }
  button { padding: 9px 26px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
  button:disabled { background: #93b4f5; cursor: wait; }
  .status { margin: 12px 2px; color: #666; font-size: 14px; min-height: 20px; }
  .export-bar { display: none; gap: 10px; margin: 0 2px 12px; align-items: center; }
  .export-bar.show { display: flex; }
  .export-bar button { background: #fff; color: #2563eb; border: 1px solid #2563eb; padding: 6px 16px; font-size: 13px; }
  .export-bar button:hover { background: #eff6ff; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid #eef1f5; font-size: 14px; vertical-align: top; }
  th { background: #f0f4f8; color: #555; font-weight: 600; white-space: nowrap; }
  tr:hover td { background: #f8fbff; }
  .salary { color: #e6532e; font-weight: 600; white-space: nowrap; }
  .name a { color: #2563eb; text-decoration: none; }
  .empty { text-align: center; color: #999; padding: 40px 0 !important; }
  .progress-wrap { margin: 4px 2px 14px; }
  .progress { height: 6px; background: #e5e9f0; border-radius: 3px; overflow: hidden; position: relative; }
  .progress .bar { position: absolute; left: -30%; width: 30%; height: 100%; background: linear-gradient(90deg, #60a5fa, #2563eb); border-radius: 3px; animation: slide 1.2s ease-in-out infinite; }
  @keyframes slide { 0% { left: -30%; } 100% { left: 100%; } }
  .elapsed { color: #2563eb; font-weight: 600; }
  .filter-bar { display: none; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 2px 12px; }
  .flabel { color: #999; font-size: 13px; }
  .chip { background: #fff; color: #555; border: 1px solid #dcdfe6; border-radius: 999px; padding: 5px 14px; font-size: 13px; cursor: pointer; }
  .chip:hover { border-color: #2563eb; color: #2563eb; }
  .chip.active { background: #2563eb; border-color: #2563eb; color: #fff; }
  .src { color: #888; font-size: 12px; white-space: nowrap; }
  .pager { display: none; gap: 12px; align-items: center; justify-content: center; margin: 16px 0; }
  .pager button { background: #fff; color: #2563eb; border: 1px solid #dcdfe6; padding: 7px 18px; font-size: 13px; }
  .pager button:hover:not(:disabled) { border-color: #2563eb; }
  .pager button:disabled { color: #bbb; cursor: not-allowed; }
  #pageInfo { color: #666; font-size: 13px; }
  /* 搜索总结面板 */
  .summary { background: #fff; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,.08); padding: 16px; margin-bottom: 20px; }
  .sum-head { font-size: 15px; font-weight: 700; margin-bottom: 12px; }
  .sum-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 14px; }
  .sum-card { background: #f8fafc; border: 1px solid #eef1f5; border-radius: 8px; padding: 10px 12px; }
  .sum-card .num { font-size: 18px; font-weight: 700; color: #2563eb; }
  .sum-card .lbl { font-size: 12px; color: #888; margin-top: 2px; }
  .sum-sec { margin-top: 14px; }
  .sum-sec-title { display: block; font-size: 13px; font-weight: 600; color: #555; margin-bottom: 8px; }
  .sum-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .sum-chip { background: #eff6ff; color: #2563eb; border-radius: 999px; padding: 4px 10px; font-size: 12px; }
  .sum-chip b { margin-left: 2px; }
  .sum-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .sum-table th, .sum-table td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #eef1f5; }
  .sum-table th { background: #f0f4f8; color: #555; white-space: nowrap; }
  .sum-table .g-title { font-weight: 600; }
  .sum-cos { display: flex; flex-wrap: wrap; gap: 8px; }
  .sum-cos .co { background: #f8fafc; border: 1px solid #eef1f5; border-radius: 6px; padding: 4px 10px; font-size: 12px; color: #555; }
  .sum-cos .co span { color: #2563eb; font-weight: 600; }
</style>
</head>
<body>
<div class="container">
  <h1>🔍 mcp-jobs 职位搜索</h1>
  <div class="sub">多平台招聘信息聚合 · MCP 端点：<code id="mcpUrl">/mcp</code></div>
  <form id="f">
    <input class="kw" name="keyword" placeholder="关键词，如：前端开发" required>
    <input class="sm" name="city" placeholder="城市（可选）">
    <input class="sm" name="salary" placeholder="薪资（可选）">
    <input class="sm" name="workYear" placeholder="经验（可选）">
    <input class="sm" name="page" type="number" value="1" min="1" style="width:70px">
    <button id="btn" type="submit">搜 索</button>
  </form>
  <div class="status" id="status">提示：搜索会实时爬取多个招聘网站，可能需要 30~90 秒。<span class="elapsed" id="elapsed"></span></div>
  <div class="progress-wrap" id="progress" style="display:none">
    <div class="progress"><div class="bar"></div></div>
  </div>
  <div class="export-bar" id="exportBar">
    <span style="color:#999;font-size:13px">导出结果：</span>
    <button type="button" onclick="exportData('csv')">⬇ 导出 CSV</button>
    <button type="button" onclick="exportData('json')">⬇ 导出 JSON</button>
    <button type="button" onclick="exportData('md')">⬇ 导出 MD</button>
  </div>
  <div class="summary" id="summaryPanel" style="display:none">
    <div class="sum-head">📊 岗位要求总结</div>
    <div class="sum-cards">
      <div class="sum-card"><div class="num" id="sumTotal">0</div><div class="lbl">职位总数</div></div>
      <div class="sum-card"><div class="num" id="sumSources">0</div><div class="lbl">来源站点</div></div>
      <div class="sum-card"><div class="num" id="sumSalary">—</div><div class="lbl">薪资区间（万/年）</div></div>
      <div class="sum-card"><div class="num" id="sumMedian">—</div><div class="lbl">薪资中位数</div></div>
    </div>
    <div class="sum-sec"><span class="sum-sec-title">🛠 技能要求 Top</span><div id="sumSkillChips" class="sum-chips"></div></div>
    <div class="sum-sec"><span class="sum-sec-title">💰 薪资分布（万/年，月薪按 ×12 折算）</span><div id="sumBands" class="sum-chips"></div></div>
    <div class="sum-sec"><span class="sum-sec-title">🧭 不同岗位：要求/技能/薪资</span>
      <table class="sum-table"><thead><tr><th>岗位方向</th><th>职位数</th><th>薪资区间</th><th>薪资中位数</th><th>技能要求</th></tr></thead><tbody id="sumGroups"></tbody></table>
    </div>
    <div class="sum-sec"><span class="sum-sec-title">🏢 热门公司</span><div id="sumCompanies" class="sum-cos"></div></div>
  </div>
  <div class="summary" id="salaryPanel" style="display:none">
    <div class="sum-head">💰 公司薪资参考（Levels.fyi）</div>
    <div id="salaryBody"></div>
  </div>
  <div class="filter-bar" id="filterBar"></div>
  <table id="tbl" style="display:none">
    <thead><tr><th>职位</th><th>公司</th><th>薪资</th><th>地点</th><th>发布时间</th><th>来源</th></tr></thead>
    <tbody id="tbody"><tr><td colspan="6" class="empty">暂无结果</td></tr></tbody>
  </table>
  <div class="pager" id="pager">
    <button type="button" id="prevBtn" onclick="changePage(-1)">‹ 上一页</button>
    <span id="pageInfo"></span>
    <button type="button" id="nextBtn" onclick="changePage(1)">下一页 ›</button>
  </div>
</div>
<script>
const $ = s => document.querySelector(s);
let lastJobs = [], filteredJobs = [], lastSalaryRefs = [], curSource = 'all', curPage = 1;
const PAGE_SIZE = 10;
let timerId = null;
$('#mcpUrl').textContent = location.origin + '/mcp';
function startProgress() {
  const t0 = Date.now();
  $('#progress').style.display = 'block';
  $('#status').firstChild.textContent = '⏳ 正在爬取招聘网站，请耐心等待…';
  $('#elapsed').textContent = '';
  timerId = setInterval(() => {
    $('#elapsed').textContent = '（已用 ' + Math.round((Date.now() - t0) / 1000) + ' 秒）';
  }, 500);
}
function stopProgress() {
  if (timerId) { clearInterval(timerId); timerId = null; }
  $('#progress').style.display = 'none';
}
$('#f').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target), q = new URLSearchParams();
  for (const [k, v] of fd.entries()) if (v && !(k === 'page' && v === '1')) q.set(k, v);
  $('#btn').disabled = true;
  startProgress();
  try {
    const r = await fetch('/api/search?' + q.toString());
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    stopProgress();
    lastJobs = data.jobs || [];
    lastSalaryRefs = data.salaryRefs || [];
    curSource = 'all'; curPage = 1;
    renderChips();
    applyFilter();
    renderSalaryRefs(lastSalaryRefs);
    $('#exportBar').classList.toggle('show', lastJobs.length > 0);
    $('#status').firstChild.textContent = '✅ 共找到 ' + lastJobs.length + ' 个职位';
    $('#elapsed').textContent = '';
  } catch (err) {
    stopProgress();
    $('#status').firstChild.textContent = '❌ 搜索失败：' + err.message;
    $('#elapsed').textContent = '';
  } finally {
    $('#btn').disabled = false;
  }
});
function renderChips() {
  const counts = {};
  lastJobs.forEach(j => { const s = j.source || '未知来源'; counts[s] = (counts[s] || 0) + 1; });
  const bar = $('#filterBar');
  bar.style.display = Object.keys(counts).length ? 'flex' : 'none';
  bar.innerHTML = '<span class="flabel">来源：</span>' + ['all'].concat(Object.keys(counts)).map(s => {
    const label = s === 'all' ? '全部 (' + lastJobs.length + ')' : s + ' (' + counts[s] + ')';
    return '<button type="button" class="chip' + (s === curSource ? ' active' : '') + '" data-s="' + esc(s) + '" onclick="setSource(this.dataset.s)">' + esc(label) + '</button>';
  }).join('');
}
function setSource(s) { curSource = s; curPage = 1; renderChips(); applyFilter(); }
function changePage(d) {
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));
  curPage = Math.min(Math.max(curPage + d, 1), totalPages);
  applyFilter();
}
function applyFilter() {
  filteredJobs = curSource === 'all' ? lastJobs : lastJobs.filter(j => (j.source || '未知来源') === curSource);
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));
  if (curPage > totalPages) curPage = totalPages;
  render(filteredJobs.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE));
  const pager = $('#pager');
  pager.style.display = filteredJobs.length ? 'flex' : 'none';
  $('#pageInfo').textContent = '第 ' + curPage + ' / ' + totalPages + ' 页 · 共 ' + filteredJobs.length + ' 条';
  $('#prevBtn').disabled = curPage <= 1;
  $('#nextBtn').disabled = curPage >= totalPages;
  renderSummary(buildSummary(filteredJobs));
}
const EXPORT_FIELDS = ['title', 'company', 'salary', 'address', 'jobDetail', 'tags', 'source'];
const EXPORT_HEADERS = ['职位', '公司', '薪资', '地点', '详情链接', '标签', '来源'];
function csvCell(v) {
  const s = Array.isArray(v) ? v.join(' | ') : String(v ?? '');
  return '"' + s.replace(/"/g, '""') + '"';
}
function exportData(fmt) {
  if (!filteredJobs.length) return;
  let blob;
  if (fmt === 'csv') {
    const rows = [EXPORT_HEADERS].concat(filteredJobs.map(j => EXPORT_FIELDS.map(f => csvCell(j[f]))));
    // BOM 头，保证 Excel 打开 CSV 中文不乱码
    blob = new Blob(['\\uFEFF' + rows.map(r => r.join(',')).join('\\r\\n')], { type: 'text/csv;charset=utf-8' });
  } else if (fmt === 'md') {
    blob = new Blob([buildMarkdown(buildSummary(filteredJobs), filteredJobs, lastSalaryRefs)], { type: 'text/markdown;charset=utf-8' });
  } else {
    // JSON 导出同时包含总结、公司薪资参考与职位列表
    blob = new Blob([JSON.stringify({ summary: buildSummary(filteredJobs), salaryRefs: lastSalaryRefs, jobs: filteredJobs }, null, 2)], { type: 'application/json;charset=utf-8' });
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (fmt === 'md' ? 'mcp-jobs-summary-' : 'mcp-jobs-') + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + fmt;
  a.click();
  URL.revokeObjectURL(a.href);
}
function esc(s) { return String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\\"':'&quot;',"'":'&#39;'}[c])); }
function render(jobs) {
  $('#tbl').style.display = 'table';
  const tb = $('#tbody');
  if (!jobs.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">未找到职位（部分站点可能有反爬限制）</td></tr>'; return; }
  else {
    tb.innerHTML = jobs.map(j => {
      const link = j.jobDetail || j.link || j.url;
      const title = link ? '<a href="' + esc(link) + '" target="_blank">' + esc(j.title) + '</a>' : esc(j.title);
      const tags = Array.isArray(j.tags) && j.tags.length ? '<div style="color:#999;font-size:12px;margin-top:4px">' + esc(j.tags.slice(0, 6).join(' · ')) + '</div>' : '';
      return '<tr><td class="name">' + title + tags + '</td><td>' + esc(j.company) + '</td><td class="salary">' + esc(j.salary) + '</td><td>' + esc(j.address || j.location || '') + '</td><td>' + esc(j.publishTime || j.time || '') + '</td><td class="src">' + esc(j.source || '') + '</td></tr>';
    }).join('');
  }
}// ===== 岗位要求总结 =====
// 纯逻辑（parseSalary/fmtWan/normalizeTitle/buildSummary）由 summaryService 注入，单一源码避免前后端分叉
${SUMMARY_CORE_SOURCE}
// ===== 岗位要求总结 UI + MD 导出（页面专属）=====

function renderSummary(sum) {
  const panel = $('#summaryPanel');
  if (!sum.total) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  $('#sumTotal').textContent = sum.total;
  $('#sumSources').textContent = Object.keys(sum.sources).length;
  $('#sumSalary').textContent = sum.salaries.length ? fmtWan(sum.salaryMin) + ' ~ ' + fmtWan(sum.salaryMax) : '—';
  $('#sumMedian').textContent = sum.salaries.length ? fmtWan(sum.salaryMedian) : '—';
  $('#sumSkillChips').innerHTML = sum.topSkills.length
    ? sum.topSkills.map(([t, c]) => '<span class="sum-chip">' + esc(t) + ' <b>' + c + '</b></span>').join('')
    : '<span style="color:#999">暂无标签数据</span>';
  $('#sumBands').innerHTML = Object.entries(sum.bands)
    .map(([k, v]) => '<span class="sum-chip">' + k + ' <b>' + v + '</b></span>').join('');
  const tb = $('#sumGroups');
  tb.innerHTML = sum.groupList.length
    ? sum.groupList.map(g => '<tr><td class="g-title">' + esc(g.title) + '</td><td>' + g.count + '</td><td>' + esc(g.salary) + '</td><td>' + esc(g.salaryMedian) + '</td><td>' + esc(g.skills) + '</td></tr>').join('')
    : '<tr><td colspan="5" class="empty">暂无数据</td></tr>';
  $('#sumCompanies').innerHTML = sum.topCompanies.length
    ? sum.topCompanies.map(([c, n]) => '<div class="co">' + esc(c) + ' <span>' + n + '</span></div>').join('')
    : '<span style="color:#999">—</span>';
}
function mdTable(headers, rows) {
  // 单元格转义：竖线与换行不破坏 Markdown 表格结构
  const escCell = v => String(v ?? '').replace(/\\|/g, '\\\\|').replace(/[\\r\\n]+/g, ' ');
  return '| ' + headers.map(escCell).join(' | ') + ' |\\n| ' + headers.map(() => '---').join(' | ') + ' |\\n' + rows.map(r => '| ' + r.map(escCell).join(' | ') + ' |').join('\\n');
}
// 公司薪资参考面板（Levels.fyi）：公司 / 薪资范围 / 级别薪资 Total
function renderSalaryRefs(refs) {
  const panel = $('#salaryPanel');
  if (!refs || !refs.length) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  $('#salaryBody').innerHTML = '<table class="sum-table"><thead><tr><th>公司</th><th>薪资范围</th><th>级别薪资（Total）</th></tr></thead><tbody>' + refs.map(r => {
    const name = r.url ? '<a href="' + esc(r.url) + '" target="_blank">' + esc(r.company) + '</a>' : esc(r.company);
    const levels = (r.levels || []).slice(0, 6).map(lv => '<span class="sum-chip">' + esc(lv.level) + ' <b>' + esc(lv.total) + '</b></span>').join('') || '—';
    return '<tr><td class="g-title">' + name + '</td><td>' + esc(r.range || '—') + '</td><td>' + levels + '</td></tr>';
  }).join('') + '</tbody></table>';
}
// 生成 Markdown 总结文档（含要求/技能/薪资/不同岗位分组/公司薪资参考与职位明细）
function buildMarkdown(sum, jobs, salaryRefs) {
  const L = [];
  const fd = new FormData($('#f'));
  L.push('# 🎯 岗位搜索结果总结');
  L.push('');
  L.push('**搜索时间**: ' + new Date().toLocaleString('zh-CN'));
  L.push('**关键词**: ' + (fd.get('keyword') || '—') + (fd.get('city') ? ' · **城市**: ' + fd.get('city') : ''));
  L.push('**职位总数**: ' + sum.total + '（' + Object.entries(sum.sources).map(([s, n]) => s + ': ' + n).join('、') + '）');
  L.push('');
  L.push('## 📊 总结');
  L.push('');
  L.push('### 💰 薪资概览（万/年，月薪按 ×12 折算）');
  L.push(mdTable(['指标', '值'], [
    ['可解析薪资职位', sum.salaries.length + ' / ' + sum.total],
    ['薪资区间', sum.salaries.length ? fmtWan(sum.salaryMin) + ' ~ ' + fmtWan(sum.salaryMax) : '—'],
    ['中位数', sum.salaries.length ? fmtWan(sum.salaryMedian) : '—'],
    ['分布', Object.entries(sum.bands).map(([k, v]) => k + ': ' + v).join('、')],
  ]));
  L.push('');
  L.push('### 🛠 技能要求 Top');
  L.push(mdTable(['技能', '出现次数'], sum.topSkills.length ? sum.topSkills : [['—', 0]]));
  L.push('');
  L.push('### 🧭 不同岗位（要求/技能/薪资）');
  L.push(mdTable(['岗位方向', '职位数', '薪资区间', '薪资中位数', '技能要求'],
    sum.groupList.length ? sum.groupList.map(g => [g.title, String(g.count), g.salary, g.salaryMedian, g.skills]) : [['—', 0, '—', '—', '—']]));
  L.push('');
  L.push('### 🏢 热门公司');
  if (sum.topCompanies.length) sum.topCompanies.forEach(([c, n], i) => L.push((i + 1) + '. ' + c + '（' + n + '）'));
  else L.push('—');
  L.push('');
  const refs = salaryRefs || [];
  if (refs.length) {
    L.push('## 💰 公司薪资参考（Levels.fyi）');
    L.push('');
    L.push(mdTable(['公司', '薪资范围', '级别薪资（Total）'], refs.map(r => [
      (r.company || '') + (r.url ? ' [' + r.url + '](' + r.url + ')' : ''),
      r.range || '—',
      (r.levels || []).slice(0, 6).map(lv => (lv.level || '') + ' ' + (lv.total || '')).join('、') || '—',
    ])));
    L.push('');
  }
  L.push('## 📋 职位列表（' + jobs.length + ' 条）');
  L.push('');
  L.push(mdTable(['职位', '公司', '薪资', '地点', '来源', '详情'],
    jobs.map(j => [j.title || '', j.company || '', j.salary || '', j.address || j.location || '', j.source || '', j.jobDetail ? '[' + j.jobDetail + '](' + j.jobDetail + ')' : ''])));
  return L.join('\\n');
}
</script>
</body>
</html>`;

// 职位搜索工具定义
const SEARCH_JOB_TOOL: Tool = {
  name: 'mcp_search_job',
  description: '搜索职位信息，返回职位列表与岗位要求总结（技能 Top、薪资分布/区间/中位数、不同岗位的要求/技能/薪资分组、热门公司）。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: '搜索关键词',
      },
      city: {
        type: 'string',
        description: '城市名称',
      },
      salary: {
        type: 'string',
        description: '薪资范围',
      },
      workYear: {
        type: 'string',
        description: '工作经验',
      },
      page: {
        type: 'number',
        description: '页码',
      }
    },
    required: ['keyword'],
  },
};

// 职位详情工具定义
const JOB_DETAIL_TOOL: Tool = {
  name: 'mcp_job_detail',
  description: '获取职位详情信息，包括职位名称、公司名称、薪资范围、工作地点、发布时间等。',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '职位详情页URL',
      },
    },
    required: ['url'],
  },
};

// 职位搜索参数接口定义
type SearchJobParams = SearchParams & {
  keyword: string; // 使其成为必需参数
};

// 职位详情参数接口定义
interface JobDetailParams {
  url: string;
}

// 参数验证函数 - 职位搜索
function isValidSearchJobParams(args: unknown): args is SearchJobParams {
  return (
    typeof args === 'object' &&
    args !== null &&
    'keyword' in args &&
    typeof (args as { keyword: unknown }).keyword === 'string' &&
    (('city' in args && typeof (args as { city: unknown }).city === 'string') || !('city' in args)) &&
    (('page' in args && typeof (args as { page: unknown }).page === 'number') || !('page' in args))
  );
}

// 参数验证函数 - 职位详情
function isValidJobDetailParams(args: unknown): args is JobDetailParams {
  return (
    typeof args === 'object' &&
    args !== null &&
    'url' in args &&
    typeof (args as { url: unknown }).url === 'string'
  );
}


// 创建 MCP 服务器实例的工厂函数（HTTP 无状态模式下每个请求创建独立实例）
export function createMcpServer(): Server {
  const server = new Server(
  {
    name: 'mcp-jobs',
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
      logging: {},
    },
  }
);


// 注册工具列表处理器
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [SEARCH_JOB_TOOL, JOB_DETAIL_TOOL],
}));

// 注册工具调用处理器
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const startTime = Date.now();
  try {
    const { name, arguments: args } = request.params;

    // 记录请求日志
    server.sendLoggingMessage({
      level: 'info',
      data: `[${new Date().toISOString()}] 收到工具调用请求: ${name}`,
    });

    if (!args) {
      throw new Error('未提供调用参数');
    }

    switch (name) {
      case 'mcp_search_job': {
        if (!isValidSearchJobParams(args)) {
          throw new Error('搜索职位的参数格式无效，请检查输入参数');
        }
        
        const { keyword, city, page, salary, workYear } = args;
        
        server.sendLoggingMessage({
          level: 'info',
          data: `开始搜索职位，关键词: ${keyword}, 城市: ${city || '全国'}, 页码: ${page || 1}`,
        });

        try {
          const results = await searchJobList({ keyword, city, page, salary, workYear });

          server.sendLoggingMessage({
            level: 'info',
            data: `搜索完成，找到 ${results.length} 个职位`,
          });

          // 附带岗位要求总结（与 Web 页面同一套逻辑）：技能 Top / 薪资分布 / 不同岗位分组薪资 / 热门公司
          const summary = buildSummary(results);

          // 附带公司薪资参考（Levels.fyi）：结果中 Top 公司按级别薪资，失败自动降级为空数组
          const companySalaryRefs = await enrichSalaryRefs(results);

          const responseData = {
            jobs: results,
            summary,
            companySalaryRefs,
            metadata: {
              totalResults: results.length,
              searchParams: { keyword, city, page, salary, workYear },
            }
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(responseData) }],
            isError: false,
          };
        } catch (error) {
          server.sendLoggingMessage({
            level: 'error',
            data: `搜索失败: ${error instanceof Error ? error.message : String(error)}`,
          });

          // Provide fallback response even when search fails
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                jobs: [],
                summary: buildSummary([]),
                metadata: {
                  totalResults: 0,
                  searchParams: { keyword, city, page, salary, workYear },
                  error: '搜索服务暂时不可用，请稍后重试',
                }
              })
            }],
            isError: false,
          };
        }
      }
      
      case 'mcp_job_detail': {
        if (!isValidJobDetailParams(args)) {
          throw new Error('获取职位详情的参数格式无效，请检查输入参数');
        }
        
        const { url } = args;
        
        server.sendLoggingMessage({
          level: 'info',
          data: `开始获取职位详情，URL: ${url}`,
        });

        try {
          const detail = await crawlJobDetail(url);

          if (!detail) {
            const responseData = {
              jobDetail: null,
              metadata: {
                url: url,
                error: '未找到职位详情',
              }
            };

            return {
              content: [{ type: 'text', text: JSON.stringify(responseData) }],
              isError: false,
            };
          }

          server.sendLoggingMessage({
            level: 'info',
            data: `职位详情获取成功: ${detail.title || '未知职位'}`,
          });

          const responseData = {
            jobDetail: detail,
            metadata: {
              url: url,
            }
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(responseData) }],
            isError: false,
          };
        } catch (error) {
          server.sendLoggingMessage({
            level: 'error',
            data: `获取职位详情失败: ${error instanceof Error ? error.message : String(error)}`,
          });

          const responseData = {
            jobDetail: null,
            metadata: {
              url: url,
              error: '职位详情获取失败，请检查URL或稍后重试',
            }
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(responseData) }],
            isError: false,
          };
        }
      }
    
      default:
        return {
          content: [{ type: 'text', text: `未知工具: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    // 记录错误日志
    server.sendLoggingMessage({
      level: 'error',
      data: {
        message: `请求失败: ${error instanceof Error ? error.message : String(error)}`,
        tool: request.params.name,
        arguments: request.params.arguments,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      },
    });
    return {
      content: [
        {
          type: 'text',
          text: `错误: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  } finally {
    // 记录请求完成日志
    server.sendLoggingMessage({
      level: 'info',
      data: `请求处理完成，耗时 ${Date.now() - startTime}ms`,
    });
  }
});
  return server;
}

// 启动 stdio 模式服务器（默认，供 Cursor / Claude Desktop 等 AI 客户端使用）
async function runStdioServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  server.sendLoggingMessage({
    level: 'info',
    data: '职位搜索服务初始化成功',
  });

  console.error('职位搜索服务已启动（stdio 模式），正在运行中...');
}

// 启动 HTTP 模式服务器（通过 --http 参数或 MCP_HTTP=1 环境变量开启）
// 返回 http.Server 实例，便于测试中监听随机端口与关闭
export async function runHttpServer(port: number, host: string): Promise<http.Server> {
  const httpServer = http.createServer(async (req, res) => {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Authorization',
    };

    // CORS 预检请求
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    // 健康检查（保留 JSON 输出供脚本探活）
    if (req.url === '/health') {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        name: 'mcp-jobs',
        version: VERSION,
        status: 'running',
        mcpEndpoint: `http://${req.headers.host}/mcp`,
        tools: ['mcp_search_job', 'mcp_job_detail'],
      }, null, 2));
      return;
    }

    // 搜索 API：/api/search?keyword=xxx&city=xxx&page=1&salary=xx&workYear=x
    if (req.url?.startsWith('/api/search')) {
      try {
        const query = new URL(req.url, 'http://localhost').searchParams;
        const keyword = (query.get('keyword') || '').trim();
        if (!keyword) {
          res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: '缺少 keyword 参数' }));
          return;
        }
        const params: SearchParams = {
          keyword,
          city: query.get('city') || undefined,
          page: parseInt(query.get('page') || '1', 10) || 1,
          salary: query.get('salary') || undefined,
          workYear: query.get('workYear') || undefined,
        };
        console.error(`[Web] 搜索职位: ${JSON.stringify(params)}`);
        const jobs = await searchJobList(params);
        // 附带公司薪资参考（Levels.fyi），失败自动降级为空数组
        const salaryRefs = await enrichSalaryRefs(jobs);
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ total: jobs.length, jobs, salaryRefs }));
      } catch (error) {
        console.error('[Web] 搜索失败:', error);
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }

    // 首页：Web 搜索界面
    if (req.url === '/') {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' });
      res.end(WEB_UI_HTML);
      return;
    }

    // MCP 端点：无状态模式，每个请求使用独立的 server/transport 实例
    if (req.url === '/mcp') {
      try {
        const mcpServer = createMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });

        res.on('close', () => {
          transport.close();
          mcpServer.close();
        });

        // 预设 CORS 响应头（writeHead 会保留未覆盖的 setHeader 项）
        Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error('处理 MCP 请求出错:', error);
        if (!res.headersSent) {
          res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }));
      }
      return;
    }

    // 其他路径返回 404
    res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not Found', hint: '请访问 / 查看服务信息，或连接 /mcp 端点' }, null, 2));
  });

  // 收集本机非内部 IPv4 地址（局域网/公网网卡），便于远程访问时找到正确地址
  const lanAddresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((info): info is os.NetworkInterfaceInfo => !!info && info.family === 'IPv4' && !info.internal)
    .map((info) => info.address);

  const displayHost = (h: string) => (h.includes(':') ? `[${h}]` : h); // IPv6 需加方括号
  const urlFor = (h: string, path: string) => `http://${displayHost(h)}:${port}${path}`;

  await new Promise<void>((resolve, reject) => {
    httpServer.on('error', reject);
    httpServer.listen(port, host, () => {
      console.error(`职位搜索服务已启动（HTTP 模式，监听 ${host}:${port}）`);
      if (host === '0.0.0.0' || host === '::') {
        console.error(`  本机访问:     ${urlFor('localhost', '/')}（MCP 端点: ${urlFor('localhost', '/mcp')}）`);
        for (const ip of lanAddresses) {
          console.error(`  局域网访问:   ${urlFor(ip, '/')}（MCP 端点: ${urlFor(ip, '/mcp')}）`);
        }
        if (lanAddresses.length === 0) {
          console.error(`  （未检测到外部网卡，仅本机可访问）`);
        }
        console.error(`  提示: 若需从其他设备通过公网 IP 访问，请确认云服务器安全组/防火墙已放行端口 ${port}；
        或在本地机器用 SSH 隧道转发：ssh -L ${port}:localhost:${port} <用户>@<服务器地址>`);
      } else {
        console.error(`  服务信息页面: ${urlFor(host, '/')}`);
        console.error(`  MCP 端点:     ${urlFor(host, '/mcp')}`);
      }
      resolve();
    });
  });
  return httpServer;
}

async function main() {
  const useHttp = process.argv.includes('--http') || process.env.MCP_HTTP === '1';
  const port = parseInt(process.env.MCP_PORT || process.env.PORT || '3000', 10);
  const host = process.env.MCP_HOST || '0.0.0.0';

  try {
    console.error('正在初始化职位搜索服务...');

    if (useHttp) {
      await runHttpServer(port, host);
    } else {
      await runStdioServer();
    }
  } catch (error) {
    console.error('服务器启动失败:', error);
    process.exit(1);
  }
}

// 直接运行时才启动服务；被测试/其他模块 import 时不启动（避免副作用）
if (require.main === module) {
  main().catch((error: any) => {
    console.error('服务器运行出错:', error);
    process.exit(1);
  });
}