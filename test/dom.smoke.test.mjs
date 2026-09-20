/**
 * 前端 DOM 冒烟测试（需要 jsdom，且服务器已在 localhost:4173 运行）：
 *   BASE=http://localhost:4173 node test/dom.smoke.test.mjs
 * 缺少 jsdom 时静默跳过（不作为默认零依赖测试套件的失败项）。
 *
 * 覆盖：
 *  - 启动后虚拟长廊挂载成对卡片（东/问题/西）
 *  - 文本优先：孔子卡含年代；墨翟 portrait=null 时无 <img> 且标记“档案无图”
 *  - 肖像 404（霍布斯）退回“图像缺失”文字占位
 *  - 点卡片 → 详情（原文 / 关系），并记录最近访问
 *  - 死路关键词（aporia）明确提示“没有下一跳”
 *  - 问题圆节 → 共同问题面板含双方原文
 *  - 滚动后虚拟列表回收/挂载
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://localhost:4173';

let JSDOM;
try {
  const jsdomSpecifier = process.env.JSDOM_PATH
    ? pathToFileURL(path.join(process.env.JSDOM_PATH, 'lib', 'api.js')).href
    : 'jsdom';
  ({ JSDOM } = await import(jsdomSpecifier));
} catch (e) {
  console.log('（跳过 DOM 冒烟测试：未安装 jsdom —', e.message, '）');
  process.exit(0);
}

let passed = 0;
let failed = 0;
const ok = (c, n) => { c ? (passed++, console.log('  ✓', n)) : (failed++, console.error('  ✗', n)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const html = await (await fetch(BASE + '/')).text();
const dom = new JSDOM(html, { url: BASE + '/#/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

// 最小观察器桩：立即视为进入视口（逐层显影与懒加载随即触发）
class IO {
  constructor(cb) { this.cb = cb; }
  observe(el) { this.el = el; this.cb([{ isIntersecting: true, target: el, boundingClientRect: { top: 0 } }], this); }
  unobserve() {} disconnect() { this.el = null; }
  takeRecords() { return []; }
}
class RO { observe() {} unobserve() {} disconnect() {} }
window.IntersectionObserver = IO;
window.ResizeObserver = RO;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
window.scrollBy = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};

for (const key of ['window', 'document', 'navigator', 'localStorage', 'location', 'history', 'Image', 'Event', 'CustomEvent', 'Node', 'HTMLElement', 'getComputedStyle']) {
  globalThis[key] = window[key];
}
globalThis.IntersectionObserver = IO;
globalThis.ResizeObserver = RO;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const publicUrl = (p) => pathToFileURL(path.join(__dirname, '..', 'public', p)).href;

// Node fetch 不支持相对 URL（浏览器会基于 document URL 解析）；这里做等价补全
const nodeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' && input.startsWith('/') ? BASE + input : input;
  return nodeFetch(url, init);
};
window.fetch = globalThis.fetch;

await import(publicUrl('js/api.js')); // 先确保模块解析顺序（app.js 内部也会 import）
await import(publicUrl('js/app.js'));

await sleep(300); // bootstrap 的 Promise.all + 微任务 + rAF

const doc = window.document;
console.log('长廊渲染');
const rows = [...doc.querySelectorAll('.pair-row')];
ok(rows.length >= 4, `虚拟列表首批挂载 ${rows.length} 站（含最近的四对）`);
const confuciusCard = [...doc.querySelectorAll('.figure-card')].find((c) => c.textContent.includes('孔子'));
ok(!!confuciusCard, '孔子卡片已渲染');
ok(confuciusCard.textContent.includes('公元前 551'), '文本优先：年代文字在卡片上（不依赖图像）');
ok(confuciusCard.querySelectorAll('.keyword-chip').length === 3, '孔子卡片含 3 个关键词');

console.log('图像降级');
const moziCard = [...doc.querySelectorAll('.figure-card')].find((c) => c.textContent.includes('墨翟'));
ok(!!moziCard, '墨翟卡片已渲染（无图档案）');
ok(moziCard && !moziCard.querySelector('img'), '墨翟 portrait=null：不创建任何 <img>（不发图像请求）');
ok(moziCard?.querySelector('.portrait-frame')?.dataset.state === 'missing-archive', '墨翟相框标记 missing-archive');
const moziTag = moziCard?.querySelector('.portrait-tag')?.textContent;
ok(moziTag === '档案无图', `墨翟显示纯文字占位「${moziTag}」`);

// 霍布斯在下一屏：滚动到 pair 5 触发挂载
const scrollY0 = window.scrollY;
Object.defineProperty(window, 'scrollY', { value: 2600, configurable: true, writable: true });
window.dispatchEvent(new window.Event('scroll'));
await sleep(80);
const hobbesCard = () => [...doc.querySelectorAll('.figure-card')].find((c) => c.textContent.includes('霍布斯'));
ok(!!hobbesCard(), '滚动后霍布斯卡片被虚拟挂载');
if (hobbesCard()) {
  const img = hobbesCard().querySelector('img');
  ok(!!img, '霍布斯有 <img>（档案声称有图）');
  img.dispatchEvent(new window.Event('error'));
  await sleep(20);
  ok(!hobbesCard().querySelector('img'), '图像 404 后 <img> 被移除');
  ok(hobbesCard().querySelector('.portrait-frame')?.dataset.state === 'failed', '相框标记 failed');
  ok(hobbesCard().querySelector('.portrait-tag')?.textContent === '图像缺失', '显示「图像缺失」文字占位');
  // 卡上文字仍然完好
  ok(hobbesCard().textContent.includes('利维坦'), '图像失败后年代/关键词/导览文字完好（文本优先）');
}
Object.defineProperty(window, 'scrollY', { value: scrollY0, configurable: true, writable: true });
window.dispatchEvent(new window.Event('scroll'));
await sleep(120); // 等待虚拟列表 rAF 节流后重新挂载首批卡片

console.log('人物详情与最近访问');
confuciusCard.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(300);
const overlay = doc.getElementById('overlay');
ok(!overlay.hidden, '点击卡片打开档案弹层');
ok(overlay.textContent.includes('《论语·述而》'), '详情含原文与出处');
ok(overlay.textContent.includes('引用与论辩关系'), '详情含引用关系区');
// 密尔观察孔子（他者观察）关系应出现在孔子详情
ok(overlay.textContent.includes('他者观察') || overlay.textContent.includes('习俗的专制'), '孔子详情含密尔《论自由》对他的观察关系');
await sleep(200);
const recentBtn = doc.getElementById('recentHeadBtn');
ok(!recentBtn.hidden, '访问后顶栏出现“最近”入口');

// 关闭
doc.querySelector('.overlay-close').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(50);
ok(overlay.hidden, '关闭按钮关闭弹层');

console.log('死路关键词');
const aporiaChip = [...doc.querySelectorAll('.keyword-chip')].find((c) => c.textContent.includes('困境'));
ok(!!aporiaChip, '苏格拉底卡上有“困境 aporia”关键词');
aporiaChip.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(300);
ok(!overlay.hidden && overlay.textContent.includes('没有下一跳'), '无下一跳关键词明确告知这是尽头');
doc.querySelector('.overlay-close').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(50);

console.log('共同问题');
const qNode = doc.querySelector('.question-node');
qNode.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(300);
ok(overlay.textContent.includes('共同问题') && overlay.textContent.includes('原文对读'), '问题面板含双方原文对读');
ok([...overlay.querySelectorAll('cite')].some((c) => c.textContent.includes('美诺篇')), '对读中苏格拉底一侧的出处为《美诺篇》');
ok([...overlay.querySelectorAll('blockquote')].some((b) => b.textContent.includes('回忆')), '对读中包含“回忆”说的原文内容');
ok(overlay.textContent.includes('分 歧') || overlay.textContent.includes('分歧'), '面板同时说明分歧（不制造表面相似）');

console.log(`\n${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);
