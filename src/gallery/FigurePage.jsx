// 墨与大理石 · 人物页
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from './api.js';
import { useGallery } from './GalleryContext.jsx';
import { recordVisit, useReveal, useScrollMemory } from './hooks.js';
import { ErrorBlock, KeywordRow, LoadingBlock, Portrait, QuoteBlock, RecentWidget, RelationPair } from './components.jsx';

export default function FigurePage() {
  const { id } = useParams();
  const { maps } = useGallery();
  const [state, setState] = useState({ status: 'loading' });
  const rootRef = useRef(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const r = await api.figure(id);
      setState({ status: 'ok', ...r.data, stale: r.stale });
    } catch (error) {
      setState({ status: 'error', error });
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const ready = state.status === 'ok';
  useReveal(rootRef, [ready, id]);
  useScrollMemory(`figure:${id}`, ready || state.status === 'error');

  // 记录"最近访问的两位人物"（后端保存；失败时 hooks 内自动写本地镜像）
  useEffect(() => {
    if (ready && state.figure) {
      const f = state.figure;
      recordVisit({ id: f.id, name: f.name, monogram: f.monogram, era: f.era });
    }
  }, [ready, state.figure]);

  useEffect(() => {
    if (ready) document.title = `${state.figure.name} · 墨与大理石`;
  }, [ready, state.figure]);

  // 上一位 / 下一位（沿长廊顺序）
  let prevNext = null;
  if (ready && maps) {
    const order = [...maps.figures.keys()];
    const idx = order.indexOf(id);
    if (idx >= 0) {
      prevNext = {
        prev: idx > 0 ? maps.figures.get(order[idx - 1]) : null,
        next: idx < order.length - 1 ? maps.figures.get(order[idx + 1]) : null,
      };
    }
  }

  const fig = state.figure;
  const tradition = ready && maps ? maps.traditions.get(fig.traditionId) : null;

  return (
    <div className="gallery-scope" ref={rootRef}>
      <nav className="im-crumb"><Link to="/gallery">← 返回长廊</Link></nav>

      {state.status === 'loading' && <LoadingBlock text="正在取出这一位人物的卷宗……" />}
      {state.status === 'error' && (
        <ErrorBlock
          error={state.error}
          onRetry={load}
          title={state.error?.status === 404 ? '长廊里还没有这一位人物' : '这一段长廊暂时没有走通'}
        />
      )}

      {ready && (
        <>
          {state.stale && <p className="im-stale-note">网络不太稳定 · 当前为缓存内容</p>}
          <header className={`im-figure-hero ${fig.side}`}>
            <Portrait figure={fig} delay={0} />
            <div className="im-figure-head">
              <p className="im-figure-kicker rv" style={{ '--d': '0.1s' }}>
                {fig.side === 'east' ? '墨 · 东方' : '大理石 · 西方'}{tradition ? ` / ${tradition.name}` : ''}
              </p>
              <h1 className="rv" style={{ '--d': '0.18s' }}>{fig.name}</h1>
              <p className="im-latin rv" style={{ '--d': '0.26s' }}>{fig.latin}</p>
              <p className="im-era rv" style={{ '--d': '0.34s' }}>{fig.era}</p>
              <KeywordRow ids={fig.keywords} currentFigureId={fig.id} />
            </div>
          </header>

          <section className="im-section">
            <p className="im-figure-summary rv">{fig.summary}</p>
            {(fig.detail || []).map((para, i) => (
              <p key={i} className="im-figure-detail rv" style={{ '--d': `${0.1 * (i + 1)}s` }}>{para}</p>
            ))}
            {tradition && <p className="im-tradition-note rv">所属传统 · {tradition.name}：{tradition.note}</p>}
          </section>

          <section className="im-section">
            <h2 className="im-section-title rv">原文</h2>
            <div className="im-quotes">
              {(fig.quotes || []).map((q) => (
                <div className="rv" key={q.id}><QuoteBlock quote={q} /></div>
              ))}
              {(!fig.quotes || fig.quotes.length === 0) && <p className="im-empty">引文整理中 · 资料待补</p>}
            </div>
          </section>

          {state.questions && state.questions.length > 0 && (
            <section className="im-section">
              <h2 className="im-section-title rv">共同问题</h2>
              {state.questions.map((q) => {
                const partnerId = q.figures.find((f) => f !== fig.id);
                const partner = maps?.figures.get(partnerId);
                return (
                  <Link key={q.id} className="im-question-link rv" to={`/gallery/question/${q.id}`}>
                    <span className="im-question-link-no">問{['一','二','三','四','五','六'][q.no - 1] || q.no}</span>
                    <span className="im-question-link-title">{q.title}</span>
                    {partner && <span className="im-question-link-partner">对读 · {partner.name}</span>}
                  </Link>
                );
              })}
            </section>
          )}

          <section className="im-section">
            <h2 className="im-section-title rv">对读 · 引用关系</h2>
            {state.relations && state.relations.length > 0
              ? state.relations.map((r) => <RelationPair key={r.id} relation={r} />)
              : <p className="im-empty">这一位人物的引用关系尚未连上 · 资料待补</p>}
          </section>

          {prevNext && (
            <nav className="im-prevnext">
              {prevNext.prev
                ? <Link to={`/gallery/figure/${prevNext.prev.id}`}>← {prevNext.prev.name}</Link>
                : <span />}
              <Link to="/gallery">长廊</Link>
              {prevNext.next
                ? <Link to={`/gallery/figure/${prevNext.next.id}`}>{prevNext.next.name} →</Link>
                : <span />}
            </nav>
          )}
        </>
      )}
      <RecentWidget />
    </div>
  );
}
