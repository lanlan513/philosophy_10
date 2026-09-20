/**
 * 虚拟列表：
 *  - 所有 item 绝对定位在一个总高撑高（virtual-spacer）里，只挂载视口附近的 DOM
 *  - 预估高度先行，挂载后用 ResizeObserver 实测修正，并以锚定元素补偿滚动位置
 *    （解决“图片/字体后到导致高度变化、滚动位置错乱”，尤其是移动端地址栏伸缩）
 *  - reveal 状态由使用方在 itemState 中持有，避免回收后重复播放逐层显影动画
 */

const OVERSCREEN = 1.4; // 上下各多渲染 1.4 屏

export class VirtualList {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.container  内容容器（position: relative）
   * @param {Array} opts.items            { key, heightEstimate, render(state) }
   * @param {object} [opts.itemState]     外部可变状态对象，key -> 任意数据（如 revealed）
   */
  constructor({ container, items, itemState = {} }) {
    this.container = container;
    this.items = items;
    this.itemState = itemState;
    this.tops = [];
    this.heights = items.map((it) => it.heightEstimate);
    this.mounted = new Map(); // key -> { el, ro, index }
    this._raf = 0;
    this._buildScaffold();
    this._recomputeTops();
    this._onScroll = this._onScroll.bind(this);
    window.addEventListener('scroll', this._onScroll, { passive: true });
    window.addEventListener('resize', this._onScroll, { passive: true });
    this._render();
  }

  _buildScaffold() {
    this.spacer = document.createElement('div');
    this.spacer.className = 'virtual-spacer';
    this.mount = document.createElement('div');
    this.mount.className = 'virtual-mount';
    this.container.appendChild(this.spacer);
    this.container.appendChild(this.mount);
  }

  _recomputeTops() {
    let y = 0;
    this.tops = this.heights.map((h) => {
      const t = y;
      y += h;
      return t;
    });
    this.total = y;
    this.spacer.style.height = `${y}px`;
  }

  /** 更新单项实测高度；只在变化发生于视口内/上方时补偿滚动，避免移动端跳动 */
  _applyMeasure(index, measured) {
    const delta = measured - this.heights[index];
    if (Math.abs(delta) < 1) return;
    const itemTop = this.tops[index];
    const inOrAboveView = itemTop < window.scrollY + window.innerHeight;

    this.heights[index] = measured;
    this._recomputeTops();
    for (const [, m] of this.mounted) {
      m.el.style.transform = `translateY(${this.tops[m.index]}px)`;
    }
    // 浏览器自身的 scroll anchoring 大多已能处理；这里额外做一次锚定，
    // 覆盖移动端地址栏伸缩 + 绝对定位元素浏览器无法锚定的情况。
    if (inOrAboveView && !this._measuring) {
      this._measuring = true;
      // 用视口顶部对应的 item 作为锚点：测量它在屏幕上的位置变化并补偿
      const anchorIndex = this._firstVisibleIndex();
      const anchorMounted = anchorIndex >= 0 ? this.mounted.get(this.items[anchorIndex].key) : null;
      if (anchorMounted) {
        const before = anchorMounted.el.getBoundingClientRect().top;
        requestAnimationFrame(() => {
          const after = anchorMounted.el.getBoundingClientRect().top;
          const shift = after - before;
          if (Math.abs(shift) > 0.5) window.scrollBy(0, shift);
          this._measuring = false;
        });
      } else {
        this._measuring = false;
      }
    }
  }

  _firstVisibleIndex() {
    const y = window.scrollY;
    let lo = 0;
    let hi = this.tops.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.tops[mid] + this.heights[mid] <= y) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  _visibleRange() {
    const scrollTop = window.scrollY;
    const viewH = window.innerHeight;
    const over = viewH * OVERSCREEN;
    const top = Math.max(0, scrollTop - over);
    const bottom = scrollTop + viewH + over;

    // 二分找起始
    let lo = 0;
    let hi = this.tops.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.tops[mid] + this.heights[mid] < top) lo = mid + 1;
      else hi = mid;
    }
    const start = lo;
    let end = start;
    while (end < this.items.length && this.tops[end] < bottom) end++;
    // 上界多取一项作为 overscan，并显式包容恰好落在 bottom 上的末尾项
    return { start, end: Math.min(this.items.length, end + 1) };
  }

  _onScroll() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._render();
    });
  }

  _render() {
    const { start, end } = this._visibleRange();
    const wanted = new Set();

    for (let i = start; i < end; i++) {
      const item = this.items[i];
      wanted.add(item.key);
      let m = this.mounted.get(item.key);
      if (!m) {
        const el = document.createElement('div');
        el.className = 'virtual-item';
        el.style.transform = `translateY(${this.tops[i]}px)`;
        el.dataset.key = String(item.key);
        el.appendChild(item.render(this.itemState[item.key], i));

        // 实测高度校正（图像懒加载 / 字体加载 / 旋转屏后都会触发）
        const ro = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const h = Math.ceil(entry.borderBoxSize?.[0]?.blockSize || entry.target.offsetHeight);
            if (h > 0) this._applyMeasure(i, h);
          }
        });
        ro.observe(el);
        this._insertInOrder(el, i);
        this.mounted.set(item.key, { el, ro, index: i });
      } else {
        m.index = i;
        m.el.style.transform = `translateY(${this.tops[i]}px)`;
      }
    }

    // 回收视口外的 DOM（reveal 等状态保留在使用方的 state 中）
    for (const [key, m] of this.mounted) {
      if (!wanted.has(key)) {
        m.ro.disconnect();
        // 断开卡片内部图像的懒加载观察器，避免回收后仍持有回调
        m.el.querySelectorAll('.portrait-frame').forEach((p) => p._unobserve?.());
        m.el.remove();
        this.mounted.delete(key);
      }
    }
  }

  /**
   * 按 item 索引把新挂载元素插入到正确的 DOM 位置。
   * 回收后再挂载若用 appendChild 会打乱文档顺序（影响 Tab 键与读屏顺序），
   * 这里以第一个索引更大的已挂载元素为锚点。
   */
  _insertInOrder(el, index) {
    const mountedEls = [...this.mounted.values()].map((m) => ({ el: m.el, index: m.index }));
    const anchor = mountedEls.find((m) => m.index > index);
    if (anchor) this.mount.insertBefore(el, anchor.el);
    else this.mount.appendChild(el);
  }

  /** 滚动到第 n 项（用于关键词跳转人物、总目点击） */
  scrollToIndex(index, behavior = 'smooth') {
    const top = this.tops[index] ?? 0;
    const headOffset = 70;
    window.scrollTo({ top: Math.max(0, top - headOffset), behavior });
  }

  /** 按 item.key 查找索引 */
  indexOfKey(key) {
    return this.items.findIndex((it) => it.key === key);
  }

  destroy() {
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onScroll);
    if (this._raf) cancelAnimationFrame(this._raf);
    for (const [, m] of this.mounted) m.ro.disconnect();
    this.mounted.clear();
  }
}
