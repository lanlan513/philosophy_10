// 墨与大理石 · 共同问题页
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from './api.js';
import { useGallery } from './GalleryContext.jsx';
import { useReveal, useScrollMemory } from './hooks.js';
import { ErrorBlock, KeywordRow, LoadingBlock, QuoteBlock, RecentWidget, RelationPair } from './components.jsx';

const NUMERALS = ['一', '二', '三', '四', '五', '六'];

export default function QuestionPage() {
  const { id } = useParams();
  const { maps } = useGallery();
  const [state, setState] = useState({ status: 'loading' });
  const rootRef = useRef(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const r = await api.question(id);
      setState({ status: 'ok', ...r.data, stale: r.stale });
    } catch (error) {
      setState({ status: 'error', error });
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const ready = state.status === 'ok';
  useReveal(rootRef, [ready, id]);
  useScrollMemory(`question:${id}`, ready || state.status === 'error');

  useEffect(() => {
    if (ready) document.title = `${state.question.title} · 墨与大理石`;
  }, [ready, state.question]);

  const q = state.question;
  // 对读两栏：按人物分组（保持 question.figures 的东西顺序）
  const columns = ready
    ? q.figures.map((fid) => ({
        figure: (state.figures || []).find((f) => f.id === fid) || maps?.figures.get(fid) || null,
        entries: (q.entries || []).filter((e) => e.figure === fid),
      }))
    : [];

  return (
    <div className="gallery-scope" ref={rootRef}>
      <nav className="im-crumb"><Link to="/gallery">← 返回长廊</Link></nav>

      {state.status === 'loading' && <LoadingBlock text="正在铺开这一问的卷轴……" />}
      {state.status === 'error' && (
        <ErrorBlock
          error={state.error}
          onRetry={load}
          title={state.error?.status === 404 ? '长廊里还没有这一问' : '这一段长廊暂时没有走通'}
        />
      )}

      {ready && (
        <>
          {state.stale && <p className="im-stale-note">网络不太稳定 · 当前为缓存内容</p>}
          <header className="im-question-hero">
            <span className="im-qnode-seal is-large rv">問<span>{NUMERALS[q.no - 1] || q.no}</span></span>
            <h1 className="rv" style={{ '--d': '0.12s' }}>{q.title}</h1>
            {q.subtitle && <p className="im-question-sub rv" style={{ '--d': '0.22s' }}>{q.subtitle}</p>}
            <KeywordRow ids={q.keywords} />
          </header>

          <section className="im-section">
            <p className="im-question-prompt rv">{q.prompt}</p>
          </section>

          <section className="im-section">
            <h2 className="im-section-title rv">对读</h2>
            <div className="im-duet">
              {columns.map(({ figure, entries }, i) => (
                <React.Fragment key={figure ? figure.id : `missing-${i}`}>
                  {i === 1 && <div className="im-duet-divider" aria-hidden="true" />}
                  <div className={`im-duet-col ${figure ? figure.side : ''}`}>
                    {figure ? (
                      <Link className="im-duet-who rv" to={`/gallery/figure/${figure.id}`}>
                        <span className="im-duet-mono">{figure.monogram}</span>
                        <span>
                          <b>{figure.name}</b>
                          <small>{figure.era}</small>
                        </span>
                      </Link>
                    ) : (
                      <span className="im-duet-who is-missing rv">人物资料待补</span>
                    )}
                    {entries.length === 0 && <p className="im-empty">这一侧的原文尚未补上 · 资料待补</p>}
                    {entries.map((e, j) => (
                      <div className="im-duet-entry rv" style={{ '--d': `${0.12 * (j + 1)}s` }} key={`${e.figure}-${e.quoteId || j}`}>
                        <QuoteBlock quote={e.quote} missing={!e.quote} />
                        {e.note && <p className="im-entry-note">{e.note}</p>}
                      </div>
                    ))}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </section>

          {q.divergence && (
            <section className="im-section">
              <div className="im-divergence rv">
                <h2>分歧，同样重要</h2>
                <p>{q.divergence}</p>
              </div>
            </section>
          )}

          <section className="im-section">
            <h2 className="im-section-title rv">引用关系</h2>
            {state.relations && state.relations.length > 0
              ? state.relations.map((r) => <RelationPair key={r.id} relation={r} />)
              : <p className="im-empty">这一问的引用关系尚未连上 · 资料待补</p>}
          </section>

          <nav className="im-prevnext">
            {columns[0]?.figure && <Link to={`/gallery/figure/${columns[0].figure.id}`}>← {columns[0].figure.name}</Link>}
            <Link to="/gallery">长廊</Link>
            {columns[1]?.figure && <Link to={`/gallery/figure/${columns[1].figure.id}`}>{columns[1].figure.name} →</Link>}
          </nav>
        </>
      )}
      <RecentWidget />
    </div>
  );
}
