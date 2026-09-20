// 墨与大理石 · 后端
// 只读接口：人物 / 传统 / 关键词 / 引用关系 / 共同问题
// 唯一写操作：记录每位访客最近访问的两位人物（匿名 cookie 会话，落盘持久化）
// 运行：node server/index.js   （默认 8321 端口，可用 PORT 覆盖）
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8321);
const DATA_DIR = path.join(__dirname, 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// ---------- 数据加载 ----------
function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}
const db = {
  figures: loadJson('figures.json').figures,
  questions: loadJson('questions.json').questions,
  keywords: loadJson('keywords.json').keywords,
  traditions: loadJson('traditions.json').traditions,
  relations: loadJson('relations.json').relations,
};
const figureById = new Map(db.figures.map((f) => [f.id, f]));
const questionById = new Map(db.questions.map((q) => [q.id, q]));

// ---------- 会话（最近访问的两位人物） ----------
let sessions = {};
try {
  sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
  if (!sessions || typeof sessions !== 'object') sessions = {};
} catch { sessions = {}; }

let saveTimer = null;
function persistSessions() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = SESSIONS_FILE + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(sessions));
      fs.renameSync(tmp, SESSIONS_FILE);
    } catch { /* 持久化失败不致命，内存中仍然可用 */ }
  }, 250);
}

function getSession(req, res) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0])
  );
  let sid = cookies.im_sid;
  if (!sid || !/^[a-f0-9]{24}$/.test(sid)) {
    sid = crypto.randomBytes(12).toString('hex');
    res.setHeader('Set-Cookie', `im_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
  }
  if (!Array.isArray(sessions[sid])) sessions[sid] = [];
  return sid;
}

// ---------- 工具 ----------
function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}
const ok = (res, data, headers) => send(res, 200, data, headers);
const fail = (res, status, code, message) => send(res, status, { error: { code, message } });

function figureLite(f) {
  return {
    id: f.id, name: f.name, latin: f.latin, monogram: f.monogram, era: f.era,
    side: f.side, traditionId: f.traditionId, keywords: f.keywords, summary: f.summary,
    portrait: `/api/gallery/portrait/${f.id}.svg`,
  };
}

// 关系数据可能不完整：引文或人物缺失时返回 null，由前端明示「资料待补」
function resolveSide(s) {
  const fig = figureById.get(s.figure);
  const quote = fig && Array.isArray(fig.quotes) ? fig.quotes.find((q) => q.id === s.quote) : null;
  return {
    figure: s.figure,
    figureName: fig ? fig.name : null,
    side: fig ? fig.side : null,
    quoteId: s.quote,
    quote: quote ? { text: quote.text, source: quote.source } : null,
  };
}
function resolveRelation(r) {
  return { id: r.id, question: r.question, note: r.note || '', a: resolveSide(r.a), b: resolveSide(r.b) };
}
function resolveEntry(e) {
  const side = resolveSide({ figure: e.figure, quote: e.quote });
  return { ...side, note: e.note || '' };
}

// ---------- 生成式肖像（墨 / 大理石 两种视觉语言） ----------
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const F = (n) => Math.round(n * 10) / 10;

function inkPortrait(fig, rnd) {
  // 东方：宣纸、墨的圆相与笔触、朱印
  const cx = 300 + (rnd() - 0.5) * 60, cy = 340 + (rnd() - 0.5) * 60;
  const r = 165 + rnd() * 40;
  const start = rnd() * 360, sweep = 285 + rnd() * 55;
  const end = start + sweep;
  const p = (a, rr) => `${F(cx + rr * Math.cos((a * Math.PI) / 180))},${F(cy + rr * Math.sin((a * Math.PI) / 180))}`;
  const strokes = [];
  for (let i = 0; i < 3; i++) {
    const x = 90 + rnd() * 420, y0 = 90 + rnd() * 140, len = 320 + rnd() * 260;
    const bend = (rnd() - 0.5) * 160, w = 2 + rnd() * 9, o = 0.08 + rnd() * 0.14;
    strokes.push(`<path d="M${F(x)},${F(y0)} C${F(x + bend)},${F(y0 + len * 0.4)} ${F(x - bend)},${F(y0 + len * 0.7)} ${F(x + bend * 0.4)},${F(y0 + len)}" stroke="#1c1a17" stroke-width="${F(w)}" stroke-linecap="round" fill="none" opacity="${F(o)}"/>`);
  }
  const washes = [];
  for (let i = 0; i < 2; i++) {
    washes.push(`<circle cx="${F(120 + rnd() * 360)}" cy="${F(150 + rnd() * 480)}" r="${F(60 + rnd() * 110)}" fill="#1c1a17" opacity="${F(0.03 + rnd() * 0.04)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" role="img" aria-label="${fig.name} · 墨像">
  <rect width="600" height="800" fill="#f0ebdf"/>
  <rect width="600" height="800" fill="url(#g)"/><defs><radialGradient id="g" cx="50%" cy="42%" r="75%"><stop offset="0%" stop-color="#f6f2e8"/><stop offset="100%" stop-color="#e4ddcc"/></radialGradient></defs>
  ${washes.join('\n  ')}
  <path d="M${p(start, r)} A${F(r)},${F(r)} 0 ${sweep > 180 ? 1 : 0} 1 ${p(end, r)}" stroke="#1c1a17" stroke-width="${F(14 + rnd() * 10)}" stroke-linecap="round" fill="none" opacity="0.88"/>
  <path d="M${p(start + 14, r - 34)} A${F(r - 34)},${F(r - 34)} 0 ${sweep > 180 ? 1 : 0} 1 ${p(end - 24, r - 34)}" stroke="#1c1a17" stroke-width="3" fill="none" opacity="0.28"/>
  ${strokes.join('\n  ')}
  <g transform="translate(468,606) rotate(${F((rnd() - 0.5) * 6)})">
    <rect width="86" height="86" rx="6" fill="#a4342a" opacity="0.92"/>
    <text x="43" y="58" text-anchor="middle" font-size="46" fill="#f0ebdf" font-family="'Songti SC','Noto Serif CJK SC',serif">${fig.monogram}</text>
  </g>
  <text x="46" y="742" font-size="21" letter-spacing="6" fill="#1c1a17" opacity="0.72" font-family="'Songti SC','Noto Serif CJK SC',serif">${fig.name}</text>
  <text x="46" y="770" font-size="12" letter-spacing="2" fill="#6d675c" font-family="Georgia,serif" font-style="italic">${fig.latin}</text>
</svg>`;
}

function marblePortrait(fig, rnd) {
  // 西方：大理石、拱与几何、石纹
  const veins = [];
  for (let i = 0; i < 6; i++) {
    const y0 = rnd() * 800, drift = (rnd() - 0.5) * 300;
    veins.push(`<path d="M-20,${F(y0)} C180,${F(y0 + drift)} 380,${F(y0 - drift)} 620,${F(y0 + drift * 0.6)}" stroke="#8f8a80" stroke-width="${F(0.6 + rnd() * 1.4)}" fill="none" opacity="${F(0.12 + rnd() * 0.16)}"/>`);
  }
  const archX = 150 + rnd() * 60, archW = 300 - rnd() * 40, archTop = 150 + rnd() * 50, archBottom = 640;
  const cols = [];
  for (let i = 0; i < 3; i++) {
    const x = archX + 30 + i * ((archW - 60) / 2);
    cols.push(`<line x1="${F(x)}" y1="${F(archTop + archW / 2 + 20)}" x2="${F(x)}" y2="${archBottom}" stroke="#3a3835" stroke-width="${F(1 + rnd())}" opacity="0.35"/>`);
  }
  const discR = 52 + rnd() * 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" role="img" aria-label="${fig.name} · 大理石像">
  <rect width="600" height="800" fill="#e9e6df"/>
  <rect width="600" height="800" fill="url(#g)"/><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#efede7"/><stop offset="100%" stop-color="#dbd7cd"/></linearGradient></defs>
  ${veins.join('\n  ')}
  <path d="M${F(archX)},${archBottom} L${F(archX)},${F(archTop + archW / 2)} A${F(archW / 2)},${F(archW / 2)} 0 0 1 ${F(archX + archW)},${F(archTop + archW / 2)} L${F(archX + archW)},${archBottom} Z" fill="#dcd8cf" stroke="#3a3835" stroke-width="2.5" opacity="0.9"/>
  ${cols.join('\n  ')}
  <circle cx="${F(archX + archW / 2)}" cy="${F(archTop + archW / 2 + 130)}" r="${F(discR)}" fill="none" stroke="#3a3835" stroke-width="2" opacity="0.75"/>
  <circle cx="${F(archX + archW / 2)}" cy="${F(archTop + archW / 2 + 130)}" r="${F(discR * 0.45)}" fill="#3a3835" opacity="0.8"/>
  <line x1="60" y1="${archBottom}" x2="540" y2="${archBottom}" stroke="#3a3835" stroke-width="3"/>
  <line x1="90" y1="${archBottom + 26}" x2="510" y2="${archBottom + 26}" stroke="#3a3835" stroke-width="1.4" opacity="0.6"/>
  <g transform="translate(472,64) rotate(${F((rnd() - 0.5) * 6)})">
    <rect width="78" height="78" rx="2" fill="none" stroke="#a4342a" stroke-width="2.5"/>
    <text x="39" y="52" text-anchor="middle" font-size="40" fill="#a4342a" font-family="Georgia,serif" font-style="italic">${fig.latin.replace(/[^A-Za-z]/g, ' ').trim().charAt(0) || fig.monogram}</text>
  </g>
  <text x="46" y="742" font-size="21" letter-spacing="6" fill="#2b2926" opacity="0.8" font-family="'Songti SC','Noto Serif CJK SC',serif">${fig.name}</text>
  <text x="46" y="770" font-size="12" letter-spacing="2" fill="#6d675c" font-family="Georgia,serif" font-style="italic">${fig.latin}</text>
</svg>`;
}

function portraitSvg(fig) {
  const rnd = mulberry32(hashSeed(fig.id));
  return fig.side === 'east' ? inkPortrait(fig, rnd) : marblePortrait(fig, rnd);
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  // CORS：允许携带 cookie 的跨源（vite 代理下同源，直连时亦可用）
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  try {
    // 生成肖像
    let m = p.match(/^\/api\/gallery\/portrait\/([a-z-]+)\.svg$/);
    if (m) {
      const fig = figureById.get(m[1]);
      if (!fig) return fail(res, 404, 'NOT_FOUND', '没有这个人物的肖像');
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      return res.end(portraitSvg(fig));
    }

    if (p === '/api/gallery/figures' && req.method === 'GET') {
      return ok(res, { figures: db.figures.map(figureLite) }, { 'Cache-Control': 'public, max-age=60' });
    }

    m = p.match(/^\/api\/gallery\/figures\/([a-z-]+)$/);
    if (m && req.method === 'GET') {
      const fig = figureById.get(m[1]);
      if (!fig) return fail(res, 404, 'NOT_FOUND', `没有 id 为「${m[1]}」的人物`);
      const relations = db.relations
        .filter((r) => r.a.figure === fig.id || r.b.figure === fig.id)
        .map(resolveRelation);
      const questions = db.questions.filter((q) => q.figures.includes(fig.id))
        .map((q) => ({ id: q.id, no: q.no, title: q.title, figures: q.figures }));
      return ok(res, { figure: { ...fig, portrait: `/api/gallery/portrait/${fig.id}.svg` }, relations, questions });
    }

    if (p === '/api/gallery/questions' && req.method === 'GET') {
      return ok(res, { questions: db.questions }, { 'Cache-Control': 'public, max-age=60' });
    }

    m = p.match(/^\/api\/gallery\/questions\/([a-z-]+)$/);
    if (m && req.method === 'GET') {
      const q = questionById.get(m[1]);
      if (!q) return fail(res, 404, 'NOT_FOUND', `没有 id 为「${m[1]}」的问题`);
      const relations = db.relations.filter((r) => r.question === q.id).map(resolveRelation);
      const figures = q.figures.map((id) => figureById.get(id)).filter(Boolean).map(figureLite);
      const question = { ...q, entries: (q.entries || []).map(resolveEntry) };
      return ok(res, { question, relations, figures });
    }

    if (p === '/api/gallery/keywords' && req.method === 'GET') {
      return ok(res, { keywords: db.keywords }, { 'Cache-Control': 'public, max-age=60' });
    }

    if (p === '/api/gallery/traditions' && req.method === 'GET') {
      return ok(res, { traditions: db.traditions }, { 'Cache-Control': 'public, max-age=60' });
    }

    if (p === '/api/gallery/relations' && req.method === 'GET') {
      return ok(res, { relations: db.relations }, { 'Cache-Control': 'public, max-age=60' });
    }

    if (p === '/api/gallery/me/recent') {
      const sid = getSession(req, res);
      if (req.method === 'GET') {
        const recent = sessions[sid]
          .map((r) => ({ ...r, figure: figureById.get(r.id) ? figureLite(figureById.get(r.id)) : null }))
          .filter((r) => r.figure);
        return ok(res, { recent });
      }
      if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        let id;
        try { id = JSON.parse(body || '{}').id; } catch { return fail(res, 400, 'BAD_JSON', '请求体不是合法的 JSON'); }
        if (!figureById.has(id)) return fail(res, 404, 'NOT_FOUND', `没有 id 为「${id}」的人物`);
        sessions[sid] = [{ id, at: Date.now() }, ...sessions[sid].filter((r) => r.id !== id)].slice(0, 2);
        persistSessions();
        const recent = sessions[sid].map((r) => ({ ...r, figure: figureLite(figureById.get(r.id)) }));
        return ok(res, { recent });
      }
      return fail(res, 405, 'METHOD_NOT_ALLOWED', '仅支持 GET / POST');
    }

    if (p === '/api/gallery/health') return ok(res, { ok: true, figures: db.figures.length });

    return fail(res, 404, 'NOT_FOUND', '接口不存在');
  } catch (err) {
    return fail(res, 500, 'INTERNAL', `服务器内部错误：${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`[墨与大理石] API 已启动  http://localhost:${PORT}/api/gallery/health`);
});
