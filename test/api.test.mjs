/**
 * API 端到端冒烟测试（零依赖，启动真实 http server 子进程）
 * 运行：npm test
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4391;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

async function req(method, p, { body, cookie } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  let json = null;
  try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json, setCookie };
}

const server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.mjs')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'inherit'],
});

await new Promise((r) => {
  let ready = false;
  server.stdout.on('data', (d) => { if (!ready && d.toString().includes('长廊')) { ready = true; r(); } });
  setTimeout(r, 3000);
});

try {
  console.log('列表与人物');
  const list = await req('GET', '/api/figures');
  ok(list.status === 200, 'GET /api/figures → 200');
  ok(list.json.count === 20, '共 20 位人物');
  const byId = new Map(list.json.figures.map((f) => [f.id, f]));
  const mozi = byId.get('mozi');
  ok(mozi.portrait === null, '墨翟 portrait=null（档案无图，前端不应发图像请求）');
  const hobbes = byId.get('hobbes');
  ok(hobbes.portrait === '/portraits/hobbes.svg', '霍布斯有图像路径但文件缺失（404 场景）');

  console.log('详情与不完整数据');
  const detail = await req('GET', '/api/figures/mozi');
  ok(detail.json.figure.guide && detail.json.figure.relations.length === 0, '墨翟有导览但关系为空（空数据不伪造）');
  const hanfei = await req('GET', '/api/figures/hanfei');
  const relLao = hanfei.json.figure.relations.find((r) => r.id === 'rel-hanfei-jielao');
  ok(relLao && relLao.targetExists && relLao.quote, '韩非《解老》关系含原文且指向存在的老子');
  const aquinas = await req('GET', '/api/figures/aquinas');
  const relAr = aquinas.json.figure.relations.find((r) => r.id === 'rel-aquinas-aristotle');
  ok(relAr && relAr.targetExists === false && relAr.targetName === '档案未收录', '阿奎那→亚里士多德为悬挂关系（目标未收录，前端须封口）');
  const dewey = await req('GET', '/api/figures/dewey');
  const relChina = dewey.json.figure.relations.find((r) => r.id === 'rel-dewey-china');
  ok(relChina && relChina.quote === null, '杜威在华关系的原文为 null（前端不代拟）');

  console.log('关键词跳转');
  const dead = await req('GET', '/api/keywords/kw-socrates-aporia/hop');
  ok(dead.status === 200 && dead.json.keyword.to === null, '“困境 aporia”无下一跳（to=null）');
  const hopFigure = await req('GET', '/api/keywords/kw-confucius-ritual/hop');
  ok(hopFigure.json.keyword.resolved?.missing === true, '“礼乐教化”指向未收录的荀子（悬挂，resolved.missing）');
  const hopQ = await req('GET', '/api/keywords/kw-confucius-ren/hop');
  ok(hopQ.json.keyword.resolved?.kind === 'question' && hopQ.json.keyword.resolved.east === 'confucius', '“仁”跳到共同问题');
  const hopExist = await req('GET', '/api/keywords/kw-mencius-kuochong/hop');
  ok(hopExist.json.keyword.resolved?.kind === 'figure' && hopExist.json.keyword.resolved.id === 'rousseau', '“扩充”跳到卢梭');
  const kw404 = await req('GET', '/api/keywords/nope/hop');
  ok(kw404.status === 404, '未知关键词 → 404');

  console.log('问题与传统');
  const qs = await req('GET', '/api/questions');
  ok(qs.json.questions.length === 10, '10 个共同问题');
  const q1 = await req('GET', '/api/questions/q-virtue-teachable');
  ok(q1.json.sides.length === 2 && q1.json.sides[0].figure.id === 'confucius', '问题详情同时返回东/西两侧人物');
  const trad = await req('GET', '/api/traditions/ru');
  ok(trad.json.members.some((m) => m.id === 'confucius'), '传统 ru 含孔子');

  console.log('最近访问：只保留两位、按访客隔离');
  const v1 = await req('POST', '/api/visits', { body: { figureId: 'confucius' } });
  ok(v1.setCookie && v1.json.recent.length === 1, '首次访问种下访客 cookie，返回 1 位');
  const cookieA = v1.setCookie.split(';')[0];
  await req('POST', '/api/visits', { body: { figureId: 'socrates' }, cookie: cookieA });
  await req('POST', '/api/visits', { body: { figureId: 'zhuangzi' }, cookie: cookieA });
  const after3 = await req('GET', '/api/visits', { cookie: cookieA });
  ok(after3.json.recent.map((f) => f.id).join(',') === 'zhuangzi,socrates', '第三次访问后只保留最近两位（庄子, 苏格拉底）');
  // 重复访问置顶而不重复
  await req('POST', '/api/visits', { body: { figureId: 'socrates' }, cookie: cookieA });
  const repeat = await req('GET', '/api/visits', { cookie: cookieA });
  ok(repeat.json.recent.map((f) => f.id).join(',') === 'socrates,zhuangzi', '重复访问置顶且不重复');
  // 访客隔离
  const v2 = await req('POST', '/api/visits', { body: { figureId: 'kant' } });
  ok(v2.json.recent.length === 1, '另一位访客相互隔离');
  const badBody = await req('POST', '/api/visits', { body: { figureId: 'nope' }, cookie: cookieA });
  ok(badBody.status === 404, '访问未知人物 → 404');
  const badJson = await fetch(BASE + '/api/visits', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not-json',
  });
  ok(badJson.status === 400, '坏 JSON → 400');

  console.log('静态与降级');
  const home = await fetch(BASE + '/');
  ok(home.status === 200 && (await home.text()).includes('墨与大理石'), '首页 HTML 可访问');
  const missingImg = await fetch(BASE + '/portraits/hobbes.svg');
  ok(missingImg.status === 404, '霍布斯石像 404（前端失败占位）');
  const existImg = await fetch(BASE + '/portraits/laozi.svg');
  ok(existImg.status === 200 && (await existImg.text()).includes('<svg'), '老子墨像 SVG 200');
  const api404 = await req('GET', '/api/nope');
  ok(api404.status === 404 && api404.json.error === 'unknown_api_route', '未知 API 路由 → 404 JSON');
} catch (e) {
  failed++;
  console.error('测试异常：', e);
} finally {
  server.kill();
}

console.log(`\n${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);
