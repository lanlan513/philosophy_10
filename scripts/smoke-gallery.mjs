// 端到端冒烟测试：在 jsdom 中运行构建产物，验证长廊各路由真实渲染
// 用法：node scripts/smoke-gallery.mjs <path>
// 运行前先 vite build，并保证后端在 8321 端口
import { JSDOM } from 'jsdom';
import { readdirSync } from 'fs';

const path = process.argv[2] || '/gallery';
const offlineExpect = process.env.OFFLINE_EXPECT === '1';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: `http://localhost:5173${path}`,
  pretendToBeVisual: true,
});

const { window } = dom;
window.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; }
  observe(el) { this.cb([{ isIntersecting: true, target: el }], this); }
  unobserve() {} disconnect() {}
};
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.scrollTo = (x, y) => { if (typeof x === 'object') { window.scrollY = x.top || 0; } else { window.scrollY = y || 0; } };
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
window.cancelAnimationFrame = clearTimeout;

for (const key of ['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'history', 'location', 'HTMLElement', 'CustomEvent', 'IntersectionObserver', 'ResizeObserver', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'Node', 'Element', 'Event', 'KeyboardEvent', 'MouseEvent']) {
  globalThis[key] = window[key] ?? globalThis[key];
}
globalThis.window = window;
globalThis.document = window.document;

const realFetch = globalThis.fetch;
const patched = (url, opts) => realFetch(String(url).startsWith('/') ? `http://localhost:8321${url}` : url, opts);
window.fetch = patched;
globalThis.fetch = patched;

const jsFile = readdirSync('./dist/assets').find((f) => f.endsWith('.js'));
await import(new URL(`../dist/assets/${jsFile}`, import.meta.url));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

const html = document.body.innerHTML;

const suites = {
  '/gallery': [
    ['长廊标题', html.includes('墨与大理石')],
    ['东方人物', html.includes('孔子')],
    ['西方人物', html.includes('苏格拉底')],
    ['共同问题节点', html.includes('德性可以教吗')],
    ['关键词印', html.includes('仁</button>')],
    ['肖像 img（懒加载）', html.includes('/api/gallery/portrait/')],
    ['人物链接', document.querySelectorAll('a[href^="/gallery/figure/"]').length > 0],
    ['问题链接', document.querySelectorAll('a[href^="/gallery/question/"]').length > 0],
  ],
  '/gallery/figure/confucius': [
    ['人物名', html.includes('孔子')],
    ['年代', html.includes('前 551')],
    ['传统', html.includes('儒家')],
    ['原文与出处', html.includes('克己复礼为仁') && html.includes('《论语·颜渊》')],
    ['引用关系对读', html.includes('未经省察的生活')],
    ['共同问题入口', html.includes('德性可以教吗')],
    ['上一位/下一位导航', html.includes('苏格拉底')],
  ],
  '/gallery/question/change': [
    ['问题标题', html.includes('何以自处')],
    ['对读·庄子', html.includes('方生方死')],
    ['对读·赫拉克利特', html.includes('河流')],
    ['分歧说明', html.includes('分歧')],
    ['残缺关系降级（r13）', html.includes('引文散佚')],
  ],
  '/gallery/question/reason-limit': [
    ['龙树原文', html.includes('不生亦不灭')],
    ['康德原文', html.includes('无法拒绝')],
  ],
  '/gallery/figure/nobody': [
    ['404 降级文案', html.includes('还没有这一位人物')],
    ['返回长廊入口', html.includes('返回长廊')],
  ],
  '/gallery/figure/laozi': [
    ['人物名', html.includes('老子')],
    ['原文', html.includes('有生于无')],
  ],
};

const checks = offlineExpect ? [
  ['断网错误态', html.includes('重试')],
  ['返回长廊入口', html.includes('返回长廊')],
  ['不白屏（文本优先）', html.includes('长廊')],
] : suites[path];
if (!checks) { console.error(`没有 ${path} 的测试用例`); process.exit(2); }
let failed = 0;
console.log(`== ${path} ==`);
for (const [name, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failed++;
}

// ---- 交互测试：关键词点击 ----
function clickKeyword(label) {
  const btn = [...document.querySelectorAll('button.im-kw')].find((b) => b.textContent.trim() === label);
  if (!btn) return false;
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return true;
}
if (path === '/gallery/figure/confucius') {
  // 「学」是死端关键词：应出现 toast，且按钮进入死端态
  const found = clickKeyword('学');
  await sleep(300);
  const toast = html2().includes('暂无下一跳');
  const dead = [...document.querySelectorAll('button.im-kw')].some((b) => b.textContent.trim() === '学' && b.className.includes('is-dead'));
  console.log(`${found && toast ? '✓' : '✗'} 死端关键词提示（学）`);
  console.log(`${dead ? '✓' : '✗'} 死端关键词标记`);
  if (!found || !toast || !dead) failed++;
}
if (path === '/gallery/figure/laozi') {
  // 「无」有多个下一跳：应弹出选择器
  clickKeyword('无');
  await sleep(300);
  const items = document.querySelectorAll('.im-chooser-item').length;
  console.log(`${items >= 3 ? '✓' : '✗'} 多目标关键词弹出选择器（无 → ${items} 个目标）`);
  if (items < 3) failed++;
}
function html2() { return document.body.innerHTML; }

process.exit(failed ? 1 : 0);
