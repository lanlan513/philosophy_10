import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 4173);
// 开发期可模拟慢网络：LATENCY=400 npm start
const LATENCY = Number(process.env.LATENCY || 0);
// 开发期可模拟接口随机失败：FAIL_RATE=0.3 npm start
const FAIL_RATE = Number(process.env.FAIL_RATE || 0);

const db = JSON.parse(await readFile(path.join(__dirname, 'data.json'), 'utf8'));

const FIGURE_BY_ID = new Map(db.figures.map((f) => [f.id, f]));
const TRADITION_BY_ID = new Map(db.traditions.map((t) => [t.id, t]));
const KEYWORD_BY_ID = new Map(db.keywords.map((k) => [k.id, k]));
const QUESTION_BY_ID = new Map(db.questions.map((q) => [q.id, q]));

/**
 * 最近访问：按匿名访客（httpOnly cookie）在内存中保存最近两位人物。
 * 只做内存存储，重启即清空；不追踪任何身份信息。
 */
const recentByVisitor = new Map();
const VISIT_COOKIE = 'im_vid';
const VISIT_TTL_MS = 1000 * 60 * 60 * 24 * 90;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function sendJSON(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders
  });
  res.end(payload);
}

function readBody(req, limit = 2 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function getVisitorId(req, res) {
  const cookie = req.headers.cookie || '';
  const match = cookie.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${VISIT_COOKIE}=`));
  if (match) return decodeURIComponent(match.slice(VISIT_COOKIE.length + 1));
  const id = crypto.randomBytes(12).toString('hex');
  res.setHeader('set-cookie', `${VISIT_COOKIE}=${id}; Path=/; Max-Age=${Math.floor(VISIT_TTL_MS / 1000)}; HttpOnly; SameSite=Lax`);
  return id;
}

/* ------------------------- 只读序列化（刻意保留不完整数据） ------------------------- */

// 列表只给摘要，引用与关键词解析留给详情接口（关系数据不完整时不阻塞列表）。
function figureSummary(f) {
  return {
    id: f.id,
    name: f.name,
    latin: f.latin,
    era: f.era,
    hemisphere: f.hemisphere,
    traditionId: f.traditionId ?? null,
    order: f.order,
    portrait: f.portrait ?? null, // null = 档案中无图，前端直接走文本占位，不发请求
    monogram: f.monogram || f.name.slice(0, 1),
    guide: f.guide ?? null, // 可能缺失，前端显示档案式占位
    keywords: (f.keywords || []).map((id) => {
      const k = KEYWORD_BY_ID.get(id);
      return { id, label: k ? k.label : '未著录关键词' };
    })
  };
}

function figureDetail(f) {
  const keywords = (f.keywords || []).map((id) => {
    const k = KEYWORD_BY_ID.get(id);
    if (!k) return { id, label: '未著录关键词', to: null, via: null, broken: true };
    return {
      id: k.id,
      label: k.label,
      to: k.to, // null = 关键词没有下一跳
      via: k.via ?? null,
      relation: k.relation ?? null
    };
  });

  const relations = db.relations
    .filter((r) => r.from === f.id || r.to === f.id)
    .map((r) => {
      const otherId = r.from === f.id ? r.to : r.from;
      const other = FIGURE_BY_ID.get(otherId);
      return {
        id: r.id,
        kind: r.kind ?? '未注明关系',
        direction: r.from === f.id ? 'out' : 'in',
        targetId: otherId,
        targetName: other ? other.name : '档案未收录',
        targetTraditionId: other ? other.traditionId : null,
        targetExists: Boolean(other), // 悬挂关系：目标在档案中不存在
        quote: r.quote ?? null, // 可能整段原文缺失，前端不虚构
        source: r.source ?? null,
        note: r.note ?? null
      };
    });

  return {
    ...figureSummary(f),
    keywords,
    bio: f.bio ?? null,
    quotes: Array.isArray(f.quotes) ? f.quotes : [],
    relations
  };
}

function resolveKeyword(k) {
  if (!k.to) {
    return { id: k.id, label: k.label, to: null, via: k.via ?? null, resolved: null };
  }
  const { kind, id } = k.to;
  if (kind === 'question') {
    const q = QUESTION_BY_ID.get(id);
    return {
      id: k.id,
      label: k.label,
      to: k.to,
      via: k.via ?? null,
      resolved: q ? {
        kind: 'question',
        id: q.id,
        label: q.label,
        east: q.east,
        west: q.west,
        anchor: q.anchor
      } : { kind: 'question', id, missing: true }
    };
  }
  const f = FIGURE_BY_ID.get(id);
  return {
    id: k.id,
    label: k.label,
    to: k.to,
    via: k.via ?? null,
    resolved: f ? { kind: 'figure', id: f.id, name: f.name, latin: f.latin, order: f.order } : { kind: 'figure', id, missing: true }
  };
}

/* ------------------------------- 路由 ------------------------------- */

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const collection = parts[1];
  const id = parts[2];
  const action = parts[3];

  if (req.method === 'GET' && collection === 'figures' && !id) {
    const list = db.figures.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(figureSummary);
    return { ok: true, count: list.length, figures: list };
  }

  if (req.method === 'GET' && collection === 'figures' && id && !action) {
    const f = FIGURE_BY_ID.get(id);
    if (!f) return sendJSON(res, 404, { ok: false, error: 'figure_not_found', id });
    return sendJSON(res, 200, { ok: true, figure: figureDetail(f) });
  }

  if (req.method === 'GET' && collection === 'traditions' && !id) {
    return { ok: true, traditions: db.traditions };
  }
  if (req.method === 'GET' && collection === 'traditions' && id) {
    const t = TRADITION_BY_ID.get(id);
    if (!t) return sendJSON(res, 404, { ok: false, error: 'tradition_not_found', id });
    const members = db.figures.filter((f) => f.traditionId === id).map(figureSummary);
    return sendJSON(res, 200, { ok: true, tradition: t, members });
  }

  if (req.method === 'GET' && collection === 'keywords' && !id) {
    return { ok: true, keywords: db.keywords.map((k) => ({ id: k.id, label: k.label, hasHop: k.to !== null && k.to !== undefined })) };
  }
  if (req.method === 'GET' && collection === 'keywords' && id && action === 'hop') {
    const k = KEYWORD_BY_ID.get(id);
    if (!k) return sendJSON(res, 404, { ok: false, error: 'keyword_not_found', id });
    return sendJSON(res, 200, { ok: true, keyword: resolveKeyword(k) });
  }

  if (req.method === 'GET' && collection === 'questions' && !id) {
    return { ok: true, questions: db.questions.map((q) => ({ id: q.id, label: q.label, east: q.east, west: q.west, anchor: q.anchor })) };
  }
  if (req.method === 'GET' && collection === 'questions' && id) {
    const q = QUESTION_BY_ID.get(id);
    if (!q) return sendJSON(res, 404, { ok: false, error: 'question_not_found', id });
    const sides = ['east', 'west'].map((side) => {
      const f = FIGURE_BY_ID.get(q[side]);
      return { side, figure: f ? figureDetail(f) : null };
    });
    return sendJSON(res, 200, { ok: true, question: q, sides });
  }

  if (req.method === 'GET' && collection === 'relations' && !id) {
    // 关系只读接口：直接暴露原始记录（含悬挂目标），由前端判断 targetExists。
    return { ok: true, relations: db.relations };
  }

  // 最近访问：GET 读取最近两位（写入在下面 POST 分支处理）
  if (req.method === 'GET' && collection === 'visits' && !id) {
    const vid = getVisitorId(req, res);
    const ids = recentByVisitor.get(vid) || [];
    const recent = ids.map((fid) => FIGURE_BY_ID.get(fid)).filter(Boolean).map(figureSummary);
    return sendJSON(res, 200, { ok: true, recent });
  }

  if (req.method === 'POST' && collection === 'visits' && !id) {
    const vid = getVisitorId(req, res);
    let body;
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return sendJSON(res, 400, { ok: false, error: 'invalid_json' });
    }
    const fid = typeof body.figureId === 'string' ? body.figureId : null;
    if (!fid || !FIGURE_BY_ID.has(fid)) return sendJSON(res, 404, { ok: false, error: 'figure_not_found', figureId: fid });
    const current = recentByVisitor.get(vid) || [];
    const next = [fid, ...current.filter((x) => x !== fid)].slice(0, 2); // 只保留最近两位
    recentByVisitor.set(vid, next);
    const recent = next.map((x) => FIGURE_BY_ID.get(x)).filter(Boolean).map(figureSummary);
    return sendJSON(res, 200, { ok: true, recent });
  }

  return sendJSON(res, 404, { ok: false, error: 'unknown_api_route', path: url.pathname });
}

/* ------------------------------- 静态文件 ------------------------------- */

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  if (!existsSync(filePath)) {
    // 单页应用的历史路由回退仅限非资源路径
    if (!path.extname(pathname)) {
      return streamOrString(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html; charset=utf-8');
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('404');
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  createReadStream(filePath).on('error', () => {
    if (!res.headersSent) res.writeHead(500);
    res.end('read error');
  }).pipe(res);
}

function streamOrString(res, file, type) {
  if (existsSync(file)) {
    res.writeHead(200, { 'content-type': type });
    createReadStream(file).pipe(res);
  } else {
    res.writeHead(200, { 'content-type': type });
    res.end('<!doctype html><meta charset="utf-8"><title>墨与大理石</title><p>页面构建未完成。</p>');
  }
}

/* ------------------------------- 服务器 ------------------------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // 本地可选的人工延迟 / 失败注入，便于在真实浏览器里测试降级
  if (LATENCY > 0) await new Promise((r) => setTimeout(r, LATENCY));
  if (FAIL_RATE > 0 && url.pathname.startsWith('/api/') && Math.random() < FAIL_RATE) {
    return sendJSON(res, 503, { ok: false, error: 'injected_failure' });
  }

  try {
    if (url.pathname.startsWith('/api/')) {
      const result = await handleApi(req, res, url);
      if (result !== undefined) sendJSON(res, 200, result);
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, url);
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('method not allowed');
  } catch (err) {
    const status = err.statusCode || 500;
    if (!res.headersSent) sendJSON(res, status, { ok: false, error: status === 413 ? 'payload_too_large' : 'server_error' });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`墨与大理石 · 长廊已开放  http://localhost:${PORT}`);
  if (LATENCY) console.log(`· 注入延迟 ${LATENCY}ms`);
  if (FAIL_RATE) console.log(`· 注入失败率 ${FAIL_RATE}`);
});
