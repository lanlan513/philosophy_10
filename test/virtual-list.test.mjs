/**
 * 虚拟列表纯算法测试：用最小 DOM 桩驱动真实的 VirtualList 类，
 * 验证范围计算、回收与实测高度后的滚动锚定。
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let scrollY = 0;
const viewH = 800;

class El {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.className = '';
    this.hidden = false;
    this.attrs = {};
    this.offsetHeight = 0;
    this.scrollByCalls = [];
    this._listeners = {};
    this._ro = null;
  }
  appendChild(c) {
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  remove() {
    this.parentNode?.children?.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  querySelectorAll() { return []; }
  addEventListener() {}
  getBoundingClientRect() {
    // 简化：根据自身 transform 与 scrollY
    const y = parseFloat(this.style.transform?.replace('translateY(', '') || '0');
    return { top: y - scrollY, bottom: y - scrollY + (this.offsetHeight || 0) };
  }
  scrollBy(_x, y) { scrollY += y; this.scrollByCalls.push(y); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
}
class RO {
  constructor(cb) { this.cb = cb; RO.instances.push(this); this.el = null; }
  observe(el) {
    this.el = el;
    el._ro = this;
  }
  disconnect() { this.el = null; }
  fire(h) {
    if (!this.el) return;
    this.el.offsetHeight = h;
    this.cb([{ target: this.el, borderBoxSize: [{ blockSize: h }] }], this);
  }
}
RO.instances = [];

globalThis.window = {
  innerWidth: 1200,
  innerHeight: viewH,
  scrollY: 0,
  get scrollYVal() { return scrollY; },
  addEventListener() {},
  removeEventListener() {},
  scrollTo() {},
  scrollBy: (_x, y) => { scrollY += y; },
  requestAnimationFrame: (cb) => { setTimeout(() => cb(), 0); return 1; },
  cancelAnimationFrame() {},
  visualViewport: undefined,
  matchMedia: () => ({ matches: false }),
};
globalThis.requestAnimationFrame = (cb) => { setTimeout(() => cb(), 0); return 1; };
globalThis.cancelAnimationFrame = () => {};
globalThis.document = {
  createElement: (t) => new El(t),
  querySelectorAll: () => [],
  documentElement: { scrollHeight: 0 },
};
globalThis.ResizeObserver = RO;

// 动态 import 以便全局桩先生效
const { VirtualList } = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'js', 'virtual-list.js')).href);

let passed = 0;
let failed = 0;
const tick = () => new Promise((r) => setTimeout(r, 0));
const ok = (c, n) => { c ? (passed++, console.log('  ✓', n)) : (failed++, console.error('  ✗', n)); };

const N = 100;
const items = Array.from({ length: N }, (_, i) => ({
  key: `k${i}`,
  heightEstimate: 500,
  render: () => new El(),
}));
const container = new El();
const vl = new VirtualList({ container, items });

// 初始：总高 = 50000
ok(Math.abs(vl.total - N * 500) < 1, `总高 = ${N}×500 = 50000（实得 ${vl.total}）`);
ok(vl.mounted.size < 10, `初始只挂载视口附近的少量 item（实得 ${vl.mounted.size}）`);

// 模拟滚动到中部（rAF 在真实浏览器里也是下一帧才执行 _render）
scrollY = 20000;
window.scrollY = scrollY;
vl._onScroll();
await tick();
const mountedKeys = [...vl.mounted.keys()];
ok(mountedKeys.some((k) => k === 'k40'), '滚动到 20000 后挂载了 k40 附近');
ok(!vl.mounted.has('k0'), '视口外的 k0 已回收');

// 实测高度：模拟当前挂载的第一个 item 实际高 600（预估 500）
const firstKey = mountedKeys[0];
const firstMount = vl.mounted.get(firstKey);
const firstIndex = firstMount.index;
const topsBefore = vl.tops[firstIndex + 1];
firstMount.el.offsetHeight = 600;
firstMount.el._ro.fire(600);
ok(vl.heights[firstIndex] === 600, '实测高度 600 被采纳');
ok(vl.tops[firstIndex + 1] === topsBefore + 100, '后续 item 顶部偏移被修正 +100');

// 滚动到末尾不越界
scrollY = 49500;
window.scrollY = scrollY;
vl._onScroll();
await tick();
ok(vl.mounted.has(`k${N - 1}`), '滚动到底部挂载最后一项 k99');
ok([...vl.mounted.keys()].every((k) => Number(k.slice(1)) < N), '没有越界 item 被挂载');

// destroy 后 RO 全部断开
vl.destroy();
ok(RO.instances.every((r) => r.el === null), 'destroy 断开所有 ResizeObserver');

console.log(`\n${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);
