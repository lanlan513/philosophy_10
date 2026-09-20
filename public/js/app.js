/**
 * 墨与大理石 · 前端主程序（原生 ESM，无框架依赖）
 *
 * 长廊顺序：每位人物是一个虚拟 item；每对人物之间夹一个“共同问题”圆节。
 * 桌面：东（左）—问题（中）—西（右）在同一对单元；移动：纵向堆叠。
 * 为兼顾成对排版与虚拟回收，item 以“对”为粒度挂载：pair-east, question, pair-west。
 */
import { api, recordVisit, getRecent, flushVisitQueue, isOffline, ApiError } from './api.js';
import { createPortrait } from './portraits.js';
import { VirtualList } from './virtual-list.js';

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  figures: [],            // 摘要列表
  figureById: new Map(),
  questions: [],
  questionById: new Map(),
  traditions: [],
  traditionById: new Map(),
  pairs: [],              // [{ east, west, question }]
  detailCache: new Map(), // id -> 详情
  revealed: new Set(),    // 已显影的 item key（滚动回收后不重播）
  recent: [],
  vlist: null,
};

const corridor = $('#corridor');
const overlay = $('#overlay');
const overlayBody = $('#overlayBody');
const toastEl = $('#toast');
let lastFocused = null;
let toastTimer = 0;
let lockedScrollY = 0;

/* ------------------------------- 工具 ------------------------------- */

function toast(message, warn = false, ms = 2600) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.toggle('is-warn', warn);
  toastEl.hidden = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function lowEndDetect() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (cores <= 4 && mem <= 4 && coarse) document.body.classList.add('low-end');
}

/* ------------------------------- 数据加载 ------------------------------- */

async function bootstrap() {
  lowEndDetect();
  try {
    const [{ figures }, { questions }, { traditions }, recentRes] = await Promise.all([
      api.figures(),
      api.questions(),
      api.traditions(),
      getRecent().catch(() => ({ recent: [] })),
    ]);
    state.figures = figures;
    figures.forEach((f) => state.figureById.set(f.id, f));
    state.questions = questions;
    questions.forEach((q) => state.questionById.set(q.id, q));
    state.traditions = traditions;
    traditions.forEach((t) => state.traditionById.set(t.id, t));
    state.recent = recentRes.recent || [];

    // 按问题把人物两两成对（问题数据给出 east / west）
    state.pairs = questions
      .map((q) => ({
        question: q,
        east: state.figureById.get(q.east),
        west: state.figureById.get(q.west),
      }))
      .filter((p) => p.east && p.west);

    renderRecentHead();
    buildCorridor();
    handleRoute(); // 初始 hash（如 #/question/xxx）
  } catch (err) {
    renderFatal(err);
  }
}

function renderFatal(err) {
  const offline = err instanceof ApiError && err.offline;
  corridor.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'error-block';
  box.innerHTML = `
    <h2>${offline ? '网络中断，且没有缓存。' : '档案暂时无法展开。'}</h2>
    <p>${escapeHTML(err.message || '未知错误')}</p>
    <p style="font-size:12px;color:var(--paper-faint)">长廊内容全部是文字档案；网络恢复后可重新打开。你也可以直接访问 <a href="/api/figures">/api/figures</a> 阅读纯文本数据。</p>
    <button type="button" class="retry-btn" id="retryBtn">重新尝试</button>`;
  corridor.appendChild(box);
  $('#retryBtn').addEventListener('click', () => {
    corridor.innerHTML = '<div class="loading-block" aria-live="polite"><span class="loading-seal">墨</span><p>正在重新展开档案目录……</p></div>';
    bootstrap();
  });
}

/* ------------------------------- 长廊（虚拟列表） ------------------------------- */

function pairItems() {
  // 每“站”是一个虚拟 item：东（左）—问题（中）—西（右）同处一行；
  // 移动端由 CSS 改为单列堆叠（问题在最前）。
  const isMobile = window.innerWidth <= 820;
  const items = [{ key: 'corridor-intro', heightEstimate: 170, render: renderCorridorIntro }];
  state.pairs.forEach((pair, pi) => {
    items.push({
      key: `pair:${pair.east.id}:${pair.west.id}`,
      heightEstimate: isMobile ? 980 : 470,
      pair,
      pairIndex: pi,
      render: () => renderPair(pair, pi),
    });
  });
  return items;
}

function renderCorridorIntro() {
  const el = document.createElement('div');
  el.style.padding = '26px 4px 8px';
  el.style.textAlign = 'center';
  el.innerHTML = `
    <p style="font-family:Georgia,serif;font-size:11px;letter-spacing:.5em;color:var(--paper-faint);margin:0 0 10px">THE CORRIDOR · 十 个 问 题</p>
    <p style="color:var(--paper-dim);font-size:14px;max-width:640px;margin:0 auto">
      每一站，先出现的是<strong style="color:var(--gold)">问题</strong>，再分别展开两端人物。
      卡片上的关键词是引文织成的路口：点开它，会说明“为什么跳到那里”，再由你确认跳转。
    </p>`;
  return el;
}

/** 一对人物的完整单元：桌面三列并置，移动由 CSS 重排为单列（问题在上） */
function renderPair(pair, pairIndex) {
  const row = document.createElement('div');
  row.className = 'pair-row';
  row.dataset.pair = String(pairIndex);

  const index = document.createElement('div');
  index.className = 'pair-index';
  index.textContent = `第 ${String(pairIndex + 1).padStart(2, '0')} 站`;
  row.appendChild(index);

  const eastSlot = document.createElement('div');
  eastSlot.className = 'card-east';
  eastSlot.appendChild(renderFigureCard(pair.east, pair, 'east'));

  const spineSlot = document.createElement('div');
  spineSlot.className = 'pair-spine';
  spineSlot.appendChild(renderQuestionNode(pair, pairIndex));

  const westSlot = document.createElement('div');
  westSlot.className = 'card-west';
  westSlot.appendChild(renderFigureCard(pair.west, pair, 'west'));

  row.appendChild(eastSlot);
  row.appendChild(spineSlot);
  row.appendChild(westSlot);

  requestReveal(row, pairIndex);
  return row;
}

function requestReveal(row, pairIndex) {
  if (state.revealed.has(pairIndex)) {
    row.classList.add('is-revealed');
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.disconnect();
      state.revealed.add(pairIndex);
      document.querySelectorAll(`.pair-row[data-pair="${pairIndex}"]`).forEach((r) => r.classList.add('is-revealed'));
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
  io.observe(row);
}

/* ------------------------------- 卡片 ------------------------------- */

function renderFigureCard(f, pair, side) {
  const card = document.createElement('article');
  card.className = `figure-card is-${f.hemisphere}`;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${f.name}，${f.era}。打开人物档案`);

  // 逐层显影的四层：肖像 / 年代 / 关键词 / 导览
  const top = document.createElement('div');
  top.className = 'card-top';

  const portraitStage = document.createElement('div');
  portraitStage.className = 'stage';
  portraitStage.dataset.i = '0';
  portraitStage.appendChild(createPortrait({
    portrait: f.portrait,
    monogram: f.monogram,
    hemisphere: f.hemisphere,
    alt: `${f.name}的抽象${f.hemisphere === 'east' ? '墨像' : '石像'}（非容貌）`,
  }));

  const head = document.createElement('div');
  head.className = 'card-head stage';
  head.dataset.i = '1';
  const tradition = state.traditionById.get(f.traditionId);
  head.innerHTML = `
    <p class="card-era">${escapeHTML(f.era)}</p>
    <h3 class="card-name">${escapeHTML(f.name)}</h3>
    <p class="card-latin">${escapeHTML(f.latin || '')}</p>
    <p class="card-tradition">${tradition ? escapeHTML(tradition.name) : '传统未著录'}</p>`;

  top.appendChild(portraitStage);
  top.appendChild(head);
  card.appendChild(top);

  const kwStage = document.createElement('div');
  kwStage.className = 'stage';
  kwStage.dataset.i = '2';
  const kwRow = document.createElement('div');
  kwRow.className = 'keyword-row';
  kwRow.setAttribute('role', 'group');
  kwRow.setAttribute('aria-label', `关键词，点击可跳转到相关人物或共同问题`);
  for (const kw of f.keywords || []) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'keyword-chip';
    chip.textContent = kw.label;
    chip.dataset.kw = kw.id;
    // 摘要列表无法判断下一跳（null / 悬挂），统一点击后由 /hop 解析；无下一跳会在弹层里说明
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      onKeywordClick(kw, f, chip);
    });
    kwRow.appendChild(chip);
  }
  kwStage.appendChild(kwRow);
  card.appendChild(kwStage);

  const guideStage = document.createElement('div');
  guideStage.className = 'stage';
  guideStage.dataset.i = '3';
  const guide = document.createElement('p');
  if (f.guide) {
    guide.className = 'card-guide';
    guide.textContent = f.guide;
  } else {
    guide.className = 'card-guide is-missing';
    guide.textContent = '（此位人物的短导览在档案中暂缺，仅存年代与著录。）';
  }
  guideStage.appendChild(guide);
  const more = document.createElement('p');
  more.className = 'card-more';
  more.textContent = '展开原文与关系档案 →';
  guideStage.appendChild(more);
  card.appendChild(guideStage);

  const open = (e) => { e.stopPropagation(); openFigure(f.id); };
  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => {
    if (e.target !== card) return; // 关键词 chip 自己处理
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFigure(f.id); }
  });

  return card;
}

function renderQuestionNode(pair, pairIndex) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'question-node stage';
  btn.innerHTML = `<span class="qn-num">Q ${String(pairIndex + 1).padStart(2, '0')}</span><span>${escapeHTML(pair.question.label.replace(/^共同问题：/, ''))}</span>`;
  btn.setAttribute('aria-label', `${pair.question.label}，展开双方原文与分歧`);
  btn.addEventListener('click', () => openQuestion(pair.question.id));
  return btn;
}

function buildCorridor() {
  const loading = $('#loadingBlock');
  if (loading) loading.remove();
  if (state.vlist) state.vlist.destroy();
  // 清掉旧的虚拟列表脚手架（noscript 保留）
  corridor.querySelectorAll('.virtual-spacer,.virtual-mount,.error-block,#loadingBlock').forEach((n) => n.remove());

  const items = pairItems();
  state.vlist = new VirtualList({
    container: corridor,
    items,
    itemState: {},
  });

  // 旋转屏 / 移动端地址栏伸缩（visualViewport resize）后重算可见区
  const relayout = () => state.vlist?._onScroll();
  window.visualViewport?.addEventListener('resize', relayout, { passive: true });
  window.addEventListener('orientationchange', relayout, { passive: true });
}

/* ------------------------------- 关键词跳转 ------------------------------- */

async function onKeywordClick(kw, fromFigure, chipEl) {
  chipEl.disabled = true;
  try {
    const { keyword } = await api.hop(kw.id);
    showHopPanel(keyword, fromFigure);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      toast('这个关键词的下一跳档案已遗失，无路可走。', true);
    } else if (err instanceof ApiError && err.offline) {
      toast('网络中断，无法解析这条关键词；请在恢复连接后重试。', true, 3600);
    } else {
      toast('下一跳暂时无法打开，请稍后再试。', true);
    }
  } finally {
    chipEl.disabled = false;
  }
}

function showHopPanel(keyword, fromFigure) {
  lastFocused = document.activeElement;
  const to = keyword.to;
  let body = '';
  body += `<p class="q-label">KEYWORD · 引文路径</p>`;
  body += `<h2 class="q-title" id="overlayTitle">「${escapeHTML(keyword.label)}」</h2>`;
  if (keyword.via) body += `<p class="q-anchor">${escapeHTML(keyword.via)}</p>`;

  if (!to) {
    // 关键词没有下一跳：明确告诉用户，而不是假装有路
    body += `<div class="hop-card"><p class="hop-dead">这个关键词在档案中<strong>没有下一跳</strong>——它是长廊的一个尽头，而不是通往另一位人物或问题的门。<br>有些词只负责把问题说尽。</p></div>`;
    body += `<p style="margin-top:14px"><button type="button" class="linklike" data-figure="${escapeHTML(fromFigure.id)}">回到 ${escapeHTML(fromFigure.name)} 的档案</button></p>`;
  } else if (keyword.resolved?.missing) {
    // 下一跳指向尚未收录的条目（悬挂关系）
    const kindText = to.kind === 'question' ? '共同问题' : '人物';
    body += `<div class="hop-card is-missing">
      <p>它指向${kindText}档案 <code>${escapeHTML(to.id)}</code>，但该条目<strong>尚未收入长廊</strong>。</p>
      <p class="hop-dead">档案不完整处不补全、不虚构：这里只保留指向，等待以后的编目。</p>
    </div>

    <p style="margin-top:14px"><button type="button" class="linklike" data-figure="${escapeHTML(fromFigure.id)}">返回 ${escapeHTML(fromFigure.name)}</button></p>`;
  } else if (to.kind === 'question') {
    const r = keyword.resolved;
    body += `<div class="hop-card">
      <p>跳到把两端系在一起的共同问题——</p>
      <button type="button" class="linklike" data-question="${escapeHTML(r.id)}">${escapeHTML(r.label)}</button>
      <p class="hop-via">${escapeHTML(r.anchor || '')}</p>
    </div>`;
  } else {
    const r = keyword.resolved;
    body += `<div class="hop-card">
      <p>沿这条引文路径，走到长廊另一端的人物——</p>
      <button type="button" class="linklike" data-figure="${escapeHTML(r.id)}">${escapeHTML(r.name)}（${escapeHTML(r.latin || '')}）</button>
    </div>`;
  }

  setOverlay(body);
  bindOverlayActions();
}

/* ------------------------------- 人物档案弹层 ------------------------------- */

async function openFigure(id, { record = true } = {}) {
  history.replaceState(null, '', `#/figure/${id}`);
  lastFocused = document.activeElement;
  setOverlay(`<p class="q-label">FILE · 正在调阅原始档案……</p><div class="loading-block" style="border:0;padding:30px"><span class="loading-seal">墨</span></div>`);

  let detail;
  if (state.detailCache.has(id)) {
    detail = state.detailCache.get(id);
  } else {
    try {
      const res = await api.figure(id);
      detail = res.figure;
      state.detailCache.set(id, detail);
    } catch (err) {
      setOverlay(errorHTML(id, err, 'figure'));
      bindOverlayActions();
      return;
    }
  }

  if (record) {
    const { recent, queued } = await recordVisit(id, state.figureById.get(id) || null);
    if (recent) state.recent = recent;
    renderRecentHead();
    if (queued) toast('网络中断：这次访问已记在本机，恢复后同步。', false, 2400);
  }

  renderFigureDetail(detail);
}

function errorHTML(id, err, kind = 'figure') {
  const offline = err instanceof ApiError && err.offline;
  const notFound = err instanceof ApiError && err.status === 404;
  const retryAttr = kind === 'question' ? 'data-retry-question' : 'data-retry-figure';
  const noun = kind === 'question' ? '问题' : '档案';
  return `<p class="q-label">${kind === 'question' ? 'QUESTION' : 'FILE'} · 调阅失败</p>
    <h2 class="q-title">${notFound ? `${noun}中没有这一条。` : offline ? '网络中断。' : `暂时打不开这份${noun}。`}</h2>
    <p class="q-anchor">${escapeHTML(err.message || '')}</p>
    <p style="margin-top:14px"><button type="button" class="linklike" ${retryAttr}="${escapeHTML(id)}">重试</button>　<button type="button" class="linklike" data-close>回到长廊</button></p>`;
}

function renderFigureDetail(f) {
  const tradition = state.traditionById.get(f.traditionId);
  let html = '';
  html += `<div class="detail-hero">
    <div id="detailPortraitSlot"></div>
    <div style="min-width:0;flex:1">
      <p class="detail-era">${escapeHTML(f.era)} ｜ ${tradition ? escapeHTML(tradition.name) : '传统未著录'}</p>
      <h2 class="detail-name" id="overlayTitle">${escapeHTML(f.name)}</h2>
      <p class="detail-latin">${escapeHTML(f.latin || '')}</p>
      ${f.bio ? `<p class="detail-bio">${escapeHTML(f.bio)}</p>` : '<p class="detail-bio" style="color:var(--paper-faint)">（生平行实暂缺）</p>'}
    </div>
  </div>`;

  // 关键词（此处带解析状态：死路 / 悬挂 / 可跳）
  html += `<section class="detail-section"><h3>关键词 · 引文织成的路口</h3><div class="keyword-row">`;
  for (const kw of f.keywords || []) {
    let cls = 'keyword-chip';
    let suffix = '';
    if (kw.broken) { cls += ' is-broken'; suffix = '（著录缺失）'; }
    else if (!kw.to) { cls += ' is-dead'; suffix = ' · 尽头'; }
    html += `<button type="button" class="${cls}" data-kw-detail="${escapeHTML(kw.id)}">${escapeHTML(kw.label)}${suffix}</button>`;
  }
  html += `</div></section>`;

  // 原文
  if (f.quotes?.length) {
    html += `<section class="detail-section"><h3>原文 · 不靠名言的形似</h3>`;
    for (const q of f.quotes) {
      html += `<figure class="quote-block"><blockquote>${escapeHTML(q.text || '')}</blockquote><cite>${escapeHTML(q.source || '出处未详')}</cite></figure>`;
    }
    if (!f.guide) html += `<p style="color:var(--paper-faint);font-size:13px">短导览暂缺，但原文仍可供自行判断。</p>`;
    html += `</section>`;
  }

  // 关系档案（注释 / 论辩 / 援引 / 道统……含悬挂目标）
  html += `<section class="detail-section"><h3>引用与论辩关系（${f.relations?.length || 0}）</h3>`;
  if (!f.relations?.length) {
    html += `<p style="color:var(--paper-faint);font-size:13px">这位人物的关系数据在当前档案中为空——这并不意味着他没有影响或对手，只代表编目尚未完成。</p>`;
  } else {
    for (const r of f.relations) {
      const dirText = r.direction === 'out'
        ? `以此关系指向 ${r.targetName}`
        : `${r.targetName} 以此关系指向本位人物`;
      html += `<article class="relation-card ${r.targetExists ? '' : 'is-dangling'}">
        <div class="relation-head">
          <span class="rel-kind">${escapeHTML(r.kind)}</span>
          <span style="color:var(--paper-faint)">${escapeHTML(dirText)}</span>
        </div>
        ${r.quote ? `<blockquote>${escapeHTML(r.quote)}</blockquote>` : '<blockquote style="color:var(--paper-faint)">（关系卡片中的原文暂缺，不代拟）</blockquote>'}
        ${r.source ? `<p class="rel-source">— ${escapeHTML(r.source)}</p>` : ''}
        ${r.note ? `<p class="rel-note">${escapeHTML(r.note)}</p>` : ''}
        <p style="margin:8px 0 0">
          ${r.targetExists
            ? `<button type="button" class="rel-target" data-figure="${escapeHTML(r.targetId)}">打开 ${escapeHTML(r.targetName)} 的档案 →</button>`
            : `<button type="button" class="rel-target" disabled>${escapeHTML(r.targetName)} <span class="rel-missing-note">（目标尚未收入档案，路口封闭）</span></button>`}
        </p>
      </article>`;
    }
  }
  html += `</section>`;

  setOverlay(html);
  // 肖像在弹层里也走懒加载/占位
  const slot = $('#detailPortraitSlot');
  slot.appendChild(createPortrait({
    portrait: f.portrait,
    monogram: f.monogram,
    hemisphere: f.hemisphere,
    alt: `${f.name}抽象档案图`,
  }));
  bindOverlayActions();
}

/* ------------------------------- 共同问题弹层 ------------------------------- */

async function openQuestion(id) {
  history.replaceState(null, '', `#/question/${id}`);
  lastFocused = document.activeElement;
  setOverlay(`<p class="q-label">QUESTION · 正在展开双方原文……</p><div class="loading-block" style="border:0;padding:30px"><span class="loading-seal">墨</span></div>`);
  try {
    const { question, sides } = await api.question(id);
    renderQuestionDetail(question, sides);
  } catch (err) {
    setOverlay(errorHTML(id, err, 'question'));
    bindOverlayActions();
  }
}

function renderQuestionDetail(q, sides) {
  const bySide = Object.fromEntries(sides.map((s) => [s.side, s.figure]));
  const east = bySide.east;
  const west = bySide.west;

  let html = `
    <p class="q-label">共同问题 · QUESTION</p>
    <h2 class="q-title" id="overlayTitle">${escapeHTML(q.label)}</h2>
    <p class="q-anchor">${escapeHTML(q.anchor || '')}</p>
    <div class="q-cols">
      <div class="q-col east">
        <h4><button type="button" class="linklike" ${east ? `data-figure="${escapeHTML(east.id)}"` : 'disabled'}>东方 · ${east ? escapeHTML(east.name) : '档案缺失'}</button></h4>
        ${east ? `<p style="font-size:12px;color:var(--paper-faint);margin:2px 0 0">${escapeHTML(east.era)}</p>` : ''}
      </div>
      <div class="q-col west">
        <h4><button type="button" class="linklike" ${west ? `data-figure="${escapeHTML(west.id)}"` : 'disabled'}>西方 · ${west ? escapeHTML(west.name) : '档案缺失'}</button></h4>
        ${west ? `<p style="font-size:12px;color:var(--paper-faint);margin:2px 0 0">${escapeHTML(west.era)}</p>` : ''}
      </div>
    </div>`;

  const quoteLines = (fig) => (fig?.quotes || []).map((qu) =>
    `<figure class="quote-block"><blockquote>${escapeHTML(qu.text)}</blockquote><cite>${escapeHTML(fig.name)} · ${escapeHTML(qu.source)}</cite></figure>`
  ).join('');
  html += `<section class="detail-section"><h3>原文对读</h3><div class="q-cols" style="margin:0">
    <div>${east ? quoteLines(east) : '<p class="hop-dead">该侧档案缺失。</p>'}</div>
    <div>${west ? quoteLines(west) : '<p class="hop-dead">该侧档案缺失。</p>'}</div>
  </div></section>`;

  html += `<section class="detail-section q-prose">
    <h3>为什么把他们放在这里</h3>
    <p>${escapeHTML(q.convergence || '')}</p>
    <p class="q-divider">分 歧</p>
    <p>${escapeHTML(q.divergence || '')}</p>
  </section>`;

  setOverlay(html);
  bindOverlayActions();
}

/* ------------------------------- 总目 / 传统 / 最近 ------------------------------- */

function openIndex() {
  history.replaceState(null, '', '#/index');
  lastFocused = document.activeElement;
  let html = `<p class="q-label">INDEX · 长廊总目</p><h2 class="q-title" id="overlayTitle">二十位人物，十个问题</h2>`;
  html += renderRecentBlock();
  html += `<div class="index-grid">`;
  for (const f of state.figures) {
    html += `<button type="button" class="index-item" data-figure="${escapeHTML(f.id)}">
      <span class="ii-era">${escapeHTML(f.era)}</span><br>
      <span class="ii-name">${escapeHTML(f.name)}</span><br>
      <span class="ii-hem ${f.hemisphere}">${f.hemisphere === 'east' ? '东 · 墨' : '西 · 石'}</span>
    </button>`;
  }
  html += `</div>`;
  setOverlay(html);
  bindOverlayActions();
}

function openTraditions() {
  history.replaceState(null, '', '#/traditions');
  lastFocused = document.activeElement;
  let html = `<p class="q-label">TRADITIONS · 思想传统</p><h2 class="q-title" id="overlayTitle">传统不是标签，是问题的来处</h2>`;
  for (const t of state.traditions) {
    const members = state.figures.filter((f) => f.traditionId === t.id);
    html += `<article class="tradition-item">
      <h4><span class="t-hem ${t.hemisphere}">${t.hemisphere === 'east' ? '东' : '西'}</span>${escapeHTML(t.name)}<span class="t-period">${escapeHTML(t.period || '')}</span></h4>
      <p>${escapeHTML(t.summary || '')}</p>
      <p style="margin-top:6px">${members.map((m) => `<button type="button" class="rel-target" data-figure="${escapeHTML(m.id)}">${escapeHTML(m.name)}</button>`).join(' · ') || '<span style="color:var(--paper-faint);font-size:12px">长廊中暂无该传统的人物卡片</span>'}</p>
    </article>`;
  }
  setOverlay(html);
  bindOverlayActions();
}

function renderRecentBlock() {
  if (!state.recent.length) {
    return `<p class="recent-empty">还没有访问记录。点开任一人物卡片后，这里会保留最近两位（只存在服务端本次会话中）。</p>`;
  }
  return `<div class="recent-chips">
    ${state.recent.map((f) => `<button type="button" class="recent-chip" data-figure="${escapeHTML(f.id)}">
      <span class="rc-avatar"
        data-portrait="${escapeHTML(f.portrait || '')}"
        data-monogram="${escapeHTML(f.monogram)}"
        data-hemisphere="${escapeHTML(f.hemisphere)}">
        <span class="rc-monogram">${escapeHTML(f.monogram)}</span>
      </span>
      <span>${escapeHTML(f.name)}</span>
    </button>`).join('')}
  </div>`;
}

/** 为最近访问里的小头像启用与卡片一致的懒加载/失败占位 */
function hydrateRecentAvatars(root = overlayBody) {
  root.querySelectorAll('.rc-avatar').forEach((host) => {
    if (host.dataset.hydrated) return;
    host.dataset.hydrated = '1';
    const portrait = host.dataset.portrait || null;
    const frame = createPortrait({
      portrait,
      monogram: host.dataset.monogram,
      hemisphere: host.dataset.hemisphere,
      alt: '',
    });
    frame.style.flex = '0 0 26px';
    frame.style.width = '26px';
    frame.style.aspectRatio = '1';
    host.replaceWith(frame);
  });
}

function openRecent() {
  history.replaceState(null, '', '#/recent');
  lastFocused = document.activeElement;
  const html = `<p class="q-label">RECENT · 最近访问</p><h2 class="q-title" id="overlayTitle">你最近走过的两站</h2>
    ${renderRecentBlock()}
    <p style="color:var(--paper-faint);font-size:12px">记录由后端按匿名访客保存，仅保留最近两位；离线期间的访问先存在本机，恢复后同步。</p>
    <p style="margin-top:14px"><button type="button" class="linklike" data-nav-index="1">查看长廊总目</button></p>`;
  setOverlay(html);
  bindOverlayActions();
}

async function refreshRecent() {
  try {
    const res = await getRecent();
    state.recent = res.recent || [];
    renderRecentHead();
  } catch { /* 顶栏最近访问非关键，静默 */ }
}

function renderRecentHead() {
  const btn = $('#recentHeadBtn');
  if (!state.recent.length) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  $('#recentHeadLabel').textContent = state.recent.map((f) => f.name).join(' / ');
}

/* ------------------------------- 弹层通用 ------------------------------- */

function setOverlay(html) {
  overlayBody.innerHTML = html;
  overlay.hidden = false;
  // 锁定背景：记录当前位置后固定 body；关闭时精确恢复，
  // 避免 iOS 地址栏伸缩时 body 锁顶导致的“滚动位置错误”
  lockedScrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  const closeBtn = $('.overlay-close', overlay);
  closeBtn?.focus();
}

function closeOverlay() {
  overlay.hidden = true;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  overlayBody.innerHTML = '';
  window.scrollTo(0, lockedScrollY);
  if (location.hash !== '#/' && location.hash !== '') history.replaceState(null, '', '#/');
  lastFocused?.focus?.();
}

function bindOverlayActions() {
  hydrateRecentAvatars();
  overlayBody.querySelectorAll('[data-figure]').forEach((b) => {
    b.addEventListener('click', () => openFigure(b.dataset.figure));
  });
  overlayBody.querySelectorAll('[data-question]').forEach((b) => {
    b.addEventListener('click', () => openQuestion(b.dataset.question));
  });
  overlayBody.querySelectorAll('[data-kw-detail]').forEach((b) => {
    b.addEventListener('click', async () => {
      const kwId = b.dataset.kwDetail;
      b.disabled = true;
      try {
        const { keyword } = await api.hop(kwId);
        const fromId = location.hash.split('/').pop();
        showHopPanel(keyword, state.figureById.get(fromId) || { id: fromId, name: '当前人物' });
      } catch (err) {
        toast(err instanceof ApiError && err.offline ? '网络中断，无法解析关键词。' : '该关键词档案无法打开。', true);
      } finally {
        b.disabled = false;
      }
    });
  });
  overlayBody.querySelectorAll('[data-retry-figure]').forEach((b) => {
    b.addEventListener('click', () => openFigure(b.dataset.retryFigure, { record: false }));
  });
  overlayBody.querySelectorAll('[data-retry-question]').forEach((b) => {
    b.addEventListener('click', () => openQuestion(b.dataset.retryQuestion));
  });
  overlayBody.querySelectorAll('[data-close]').forEach((b) => {
    b.addEventListener('click', closeOverlay);
  });
  overlayBody.querySelectorAll('[data-nav-index]').forEach((b) => {
    b.addEventListener('click', openIndex);
  });
}

overlay.addEventListener('click', (e) => {
  if (e.target.matches('[data-close]')) closeOverlay();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !overlay.hidden) closeOverlay();
});

/* ------------------------------- hash 路由 ------------------------------- */

function handleRoute() {
  const hash = location.hash || '#/';
  const [, section, id] = hash.split('/');
  if (section === 'figure' && id) openFigure(id, { record: false });
  else if (section === 'question' && id) openQuestion(id);
  else if (section === 'index') openIndex();
  else if (section === 'traditions') openTraditions();
  else if (section === 'recent') openRecent();
  else if (!overlay.hidden) closeOverlay();
}
window.addEventListener('hashchange', handleRoute);

/* ------------------------------- 顶栏 / 网络状态 ------------------------------- */

document.querySelectorAll('.head-nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const nav = btn.dataset.nav;
    if (nav === 'index') openIndex();
    else if (nav === 'traditions') openTraditions();
    else if (nav === 'recent') openRecent();
  });
});

const offlineBanner = $('#offlineBanner');
function updateOnlineUI() {
  const offline = isOffline();
  offlineBanner.hidden = !offline;
  if (!offline) {
    flushVisitQueue().then(({ flushed }) => {
      if (flushed > 0) {
        toast(`网络恢复，已同步 ${flushed} 条访问记录。`);
        refreshRecent();
      }
    });
  }
}
window.addEventListener('online', updateOnlineUI);
window.addEventListener('offline', updateOnlineUI);
updateOnlineUI();

/* 阅读进度（墨线沿长廊延展） */
window.addEventListener('scroll', () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const pct = max > 0 ? Math.min(1, window.scrollY / max) : 0;
  $('#scrollProgress').style.width = `${pct * 100}%`;
}, { passive: true });

bootstrap();
