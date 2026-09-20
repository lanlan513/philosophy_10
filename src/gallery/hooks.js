// 墨与大理石 · 交互钩子：分层显现、滚动记忆（含移动端锚点修正）、最近访问
import { useEffect, useRef } from 'react';
import { api, writeLocalRecent } from './api.js';

// 接管浏览器的滚动恢复，避免与手动恢复互相打架（移动端尤其明显）
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

// 滚动分层显现：容器内所有 .rv 元素进入视口时加 .in
export function useReveal(containerRef, deps = []) {
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return undefined;
    const els = root.querySelectorAll('.rv:not(.in)');
    if (!els.length) return undefined;
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return undefined;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }
    }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, deps);
}

// 滚动记忆：
// - 每个路由独立保存滚动位置（sessionStorage），返回时恢复
// - 视口尺寸变化（移动端地址栏伸缩/旋转）时，以当前锚点行重新定位，避免错位
export function useScrollMemory(key, ready) {
  const anchorRef = useRef(null);
  useEffect(() => {
    if (!ready) return undefined;
    const storeKey = `im:scroll:${key}`;
    let saved = 0;
    try { saved = Number(sessionStorage.getItem(storeKey) || 0); } catch { saved = 0; }
    // 等一帧，让懒加载占位与图片框高度先生效，再恢复位置
    const raf = requestAnimationFrame(() => {
      if (saved > 0) window.scrollTo(0, saved);
      else window.scrollTo(0, 0);
    });
    // 虚拟行随后挂载、真实高度替换估算高度时会引起漂移，做两次迟滞校正
    const reassert = [300, 900].map((ms) => setTimeout(() => {
      if (saved > 0 && Math.abs(window.scrollY - saved) > 120) window.scrollTo(0, saved);
    }, ms));

    let scrollTimer = null;
    const onScroll = () => {
      if (scrollTimer) return;
      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        try { sessionStorage.setItem(storeKey, String(window.scrollY)); } catch { /* 忽略 */ }
        // 记录锚点：离视口顶部最近的 [data-anchor]
        let best = null;
        document.querySelectorAll('[data-anchor]').forEach((el) => {
          const top = el.getBoundingClientRect().top;
          if (best === null || Math.abs(top) < Math.abs(best.top)) best = { id: el.dataset.anchor, top };
        });
        if (best) anchorRef.current = best;
      }, 120);
    };

    let resizeTimer = null;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const a = anchorRef.current;
        if (!a) return;
        const el = document.querySelector(`[data-anchor="${a.id}"]`);
        if (!el) return;
        const drift = Math.abs(el.getBoundingClientRect().top - a.top);
        if (drift > 24) {
          window.scrollTo(0, window.scrollY + (el.getBoundingClientRect().top - a.top));
        }
      }, 180);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      reassert.forEach(clearTimeout);
      clearTimeout(scrollTimer);
      clearTimeout(resizeTimer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      try { sessionStorage.setItem(storeKey, String(window.scrollY)); } catch { /* 忽略 */ }
    };
  }, [key, ready]);
}

// 记录"最近访问的两位人物"：成功后广播 im:recent 事件；失败时写本地镜像
export function recordVisit(figureLite) {
  api.visit(figureLite.id)
    .then((r) => {
      writeLocalRecent(figureLite);
      window.dispatchEvent(new CustomEvent('im:recent', { detail: r.data.recent }));
    })
    .catch(() => {
      writeLocalRecent(figureLite);
      window.dispatchEvent(new CustomEvent('im:recent', { detail: null }));
    });
}
