// 墨与大理石 · 长廊主页
// 一条缓慢展开的人物长廊：东方在左（墨），西方在右（大理石），中间是共同的问题。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGallery } from './GalleryContext.jsx';
import { useReveal, useScrollMemory } from './hooks.js';
import { ErrorBlock, KeywordRow, LoadingBlock, Portrait, RecentWidget } from './components.jsx';

// 虚拟行：只渲染视口附近的行，离屏行退化为等高位占位，保证长列表不卡、滚动条稳定
function VirtualRow({ anchorId, estimate = 980, onMount, children }) {
  const ref = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [instant, setInstant] = useState(false); // 曾经揭示过 → 重新挂载时跳过动画，直接终态
  const heightRef = useRef(estimate);
  const [holderHeight, setHolderHeight] = useState(estimate);

  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setMounted(true); return undefined; }
    const io = new IntersectionObserver(
      ([entry]) => setMounted(entry.isIntersecting),
      { rootMargin: '160% 0px' } // 提前一个半屏挂载，滚动时不突兀
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!mounted) return undefined;
    onMount?.(anchorId);
    const el = ref.current && ref.current.firstElementChild;
    if (!el || !('ResizeObserver' in window)) return undefined;
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height;
      if (h > 0 && Math.abs(h - heightRef.current) > 4) {
        heightRef.current = h;
        setHolderHeight(h);
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      // 卸载前若已揭示过，下次挂载直接终态，不重复播放动画
      if (ref.current && ref.current.querySelector('.rv.in')) setInstant(true);
    };
  }, [mounted, anchorId, onMount]);

  return (
    <div
      ref={ref}
      className={`im-vrow${instant ? ' is-instant' : ''}`}
      data-anchor={anchorId}
      style={mounted ? undefined : { height: holderHeight }}
    >
      {mounted ? children : <span className="im-vrow-ghost" aria-hidden="true">…</span>}
    </div>
  );
}

function FigureCard({ figure, tradition }) {
  return (
    <article className={`im-card ${figure.side}`}>
      <Link className="im-card-main" to={`/gallery/figure/${figure.id}`} aria-label={`进入${figure.name}的人物页`}>
        <Portrait figure={figure} />
        <div className="im-card-head rv" style={{ '--d': '0.15s' }}>
          <h3>{figure.name}</h3>
          <span className="im-latin">{figure.latin}</span>
        </div>
        <div className="im-card-era rv" style={{ '--d': '0.25s' }}>
          <span className="im-era">{figure.era}</span>
          {tradition && <span className="im-tradition">{tradition.name}</span>}
        </div>
      </Link>
      <KeywordRow ids={figure.keywords} currentFigureId={figure.id} />
      <p className="im-card-summary rv" style={{ '--d': '0.45s' }}>{figure.summary}</p>
      <Link className="im-card-more rv" style={{ '--d': '0.55s' }} to={`/gallery/figure/${figure.id}`}>入 廊 →</Link>
    </article>
  );
}

function PairRow({ question, maps }) {
  const [eastId, westId] = question.figures;
  const east = maps.figures.get(eastId);
  const west = maps.figures.get(westId);
  return (
    <div className="im-pair" id={`row-${question.id}`}>
      {east
        ? <FigureCard figure={east} tradition={maps.traditions.get(east.traditionId)} />
        : <div className="im-card east is-missing">东方人物资料待补</div>}
      <Link className="im-qnode rv" style={{ '--d': '0.2s' }} to={`/gallery/question/${question.id}`} aria-label={`共同问题：${question.title}`}>
        <span className="im-qnode-seal">問<span>{['一','二','三','四','五','六'][question.no - 1] || question.no}</span></span>
        <span className="im-qnode-title">{question.title}</span>
        <span className="im-qnode-hint">共同问题</span>
      </Link>
      {west
        ? <FigureCard figure={west} tradition={maps.traditions.get(west.traditionId)} />
        : <div className="im-card west is-missing">西方人物资料待补</div>}
    </div>
  );
}

function Corridor({ questions, maps }) {
  const corridorRef = useRef(null);
  const progressRef = useRef(null);
  const [mountedCount, setMountedCount] = useState(0);

  // 中轴进度印 + 已经过的问题节点
  useEffect(() => {
    const el = corridorRef.current;
    if (!el) return undefined;
    let ticking = false;
    const update = () => {
      ticking = false;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = rect.height - vh;
      const passed = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
      const ratio = total > 0 ? passed / total : 0;
      if (progressRef.current) progressRef.current.style.transform = `translateY(${ratio * 100}%)`;
      el.querySelectorAll('.im-qnode').forEach((node) => {
        const r = node.getBoundingClientRect();
        node.classList.toggle('is-passed', r.top < vh * 0.55);
      });
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, [questions]);

  useReveal(corridorRef, [mountedCount]);

  const onMount = useMemo(() => () => setMountedCount((n) => n + 1), []);

  return (
    <div className="im-corridor" ref={corridorRef}>
      <div className="im-spine" aria-hidden="true">
        <span className="im-spine-line" />
        <span className="im-spine-progress" ref={progressRef} />
      </div>
      {questions.map((q) => (
        <VirtualRow key={q.id} anchorId={`row-${q.id}`} onMount={onMount}>
          <PairRow question={q} maps={maps} />
        </VirtualRow>
      ))}
    </div>
  );
}

export default function Gallery() {
  const { status, error, stale, questions, maps, retry } = useGallery();
  const rootRef = useRef(null);
  useScrollMemory('gallery', status === 'ok');
  useReveal(rootRef, [status]); // 卷首与页脚的分层显现（长廊行由 Corridor 自己观察）

  useEffect(() => { document.title = '墨与大理石 · 东西人物长廊'; }, []);

  return (
    <div className="gallery-scope" ref={rootRef}>
      <header className="im-hero">
        <p className="im-hero-kicker rv">INK &amp; MARBLE · 东西对读长廊</p>
        <h1 className="rv" style={{ '--d': '0.1s' }}>墨与大理石</h1>
        <p className="im-hero-sub rv" style={{ '--d': '0.25s' }}>
          六位东方思想者，六位西方哲学家。<br />他们不因相貌或名言相似而并列，只因回答过同一个问题。
        </p>
        <div className="im-hero-legend rv" style={{ '--d': '0.4s' }}>
          <span><i className="im-glyph im-glyph-ink" />墨 · 东方</span>
          <span><i className="im-glyph im-glyph-marble" />大理石 · 西方</span>
          <span><i className="im-glyph im-glyph-seal" />問 · 共同问题</span>
        </div>
        <span className="im-hero-hint" aria-hidden="true">缓缓下行 ↓</span>
      </header>

      {status === 'loading' && <LoadingBlock />}
      {status === 'error' && <ErrorBlock error={error} onRetry={retry} />}
      {status === 'ok' && (
        <>
          {stale && <p className="im-stale-note">网络不太稳定 · 当前为缓存内容</p>}
          <Corridor questions={questions} maps={maps} />
          <footer className="im-colophon">
            <p>引文均标注出处；关系数据若有残缺，页面会明示「资料待补」，而不是悄悄略去。</p>
            <p className="im-colophon-dim">墨与大理石 · 一条仍在生长的长廊 / <Link to="/">返回思想档案馆</Link></p>
          </footer>
        </>
      )}
      <RecentWidget />
    </div>
  );
}
