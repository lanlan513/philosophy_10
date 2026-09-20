// 墨与大理石 · 共享组件
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, readLocalRecent } from './api.js';
import { useGallery } from './GalleryContext.jsx';

// 肖像：懒加载 + 失败降级（文字优先：单字印章 + 姓名，永不出现破图）
export function Portrait({ figure, reveal = true, delay = 0 }) {
  const [failed, setFailed] = useState(false);
  const cls = `im-portrait ${figure.side === 'east' ? 'is-ink' : 'is-marble'}${reveal ? ' rv' : ''}`;
  const style = reveal ? { '--d': `${delay}s` } : undefined;
  if (failed || !figure.portrait) {
    return (
      <div className={`${cls} is-fallback`} style={style} data-rv="portrait">
        <span className="im-portrait-mono">{figure.monogram || figure.name?.slice(0, 1) || '？'}</span>
        <span className="im-portrait-noname">{figure.name}</span>
      </div>
    );
  }
  return (
    <div className={cls} style={style} data-rv="portrait">
      <img
        src={figure.portrait}
        alt={`${figure.name}（${figure.latin}）的生成式肖像`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        onLoad={(e) => { if (e.currentTarget.naturalWidth === 0) setFailed(true); }}
      />
    </div>
  );
}

// 关键词印：点击跳转共同问题或另一位人物；无下一跳时标记死端
export function KeywordChip({ keywordId, currentFigureId }) {
  const { maps, openKeyword } = useGallery();
  const [dead, setDead] = useState(false);
  const kw = maps?.keywords.get(keywordId);
  if (!kw) return <span className="im-kw is-unknown">{keywordId}</span>;
  const onClick = () => {
    const moved = openKeyword(keywordId, currentFigureId);
    if (moved === false) setDead(true);
  };
  return (
    <button
      type="button"
      className={`im-kw${dead ? ' is-dead' : ''}`}
      onClick={onClick}
      title={dead ? '暂无下一跳 · 资料待补' : `跳转到与「${kw.label}」相关的问题或人物`}
    >
      {kw.label}
    </button>
  );
}

export function KeywordRow({ ids, currentFigureId, reveal = true }) {
  if (!ids || ids.length === 0) return null;
  return (
    <div className={`im-kws${reveal ? ' rv' : ''}`} data-rv="keywords" style={reveal ? { '--d': '0.3s' } : undefined}>
      {ids.map((id, i) => (
        <span key={id} style={{ '--d': `${0.3 + i * 0.08}s` }} className="im-kw-cell rv">
          <KeywordChip keywordId={id} currentFigureId={currentFigureId} />
        </span>
      ))}
    </div>
  );
}

// 引文块：原文 + 出处；出处缺失时明确标注
export function QuoteBlock({ quote, missing }) {
  if (missing || !quote || !quote.text) {
    return (
      <div className="im-quote is-missing">
        <p>引文散佚 · 资料待补</p>
        <span>这一段关系暂时缺了一角，长廊为它留着位置。</span>
      </div>
    );
  }
  return (
    <blockquote className="im-quote">
      <p>「{quote.text}」</p>
      <cite>{quote.source || '出处待考'}</cite>
    </blockquote>
  );
}

// 引用关系卡：两端引文对读；任何一端缺失都优雅占位
export function RelationPair({ relation }) {
  const sides = [relation.a, relation.b];
  return (
    <div className="im-relation rv">
      {sides.map((s, i) => (
        <React.Fragment key={`${relation.id}:${i}`}>
          {i === 1 && <div className="im-relation-joint" aria-hidden="true"><span /></div>}
          <div className="im-relation-side">
            {s.figureName
              ? <Link className="im-relation-who" to={`/gallery/figure/${s.figure}`}>{s.figureName}</Link>
              : <span className="im-relation-who is-missing">人物资料缺失</span>}
            <QuoteBlock quote={s.quote} missing={!s.quote} />
          </div>
        </React.Fragment>
      ))}
      {relation.note && <p className="im-relation-note">{relation.note}</p>}
    </div>
  );
}

// 加载与错误：文本优先，绝不白屏
export function LoadingBlock({ text = '长廊正在展开……' }) {
  return (
    <div className="im-state">
      <span className="im-state-seal">墨</span>
      <p>{text}</p>
      <span className="im-state-hint">若网络较慢，文字会先于图像到达。</span>
    </div>
  );
}

export function ErrorBlock({ error, onRetry, title = '这一段长廊暂时没有走通' }) {
  return (
    <div className="im-state is-error">
      <span className="im-state-seal">断</span>
      <p>{title}</p>
      <span className="im-state-hint">{error?.message || '网络连接失败'}</span>
      <div className="im-state-actions">
        {onRetry && <button type="button" className="im-btn" onClick={onRetry}>重试</button>
        }
        <Link className="im-btn is-ghost" to="/gallery">返回长廊</Link>
      </div>
    </div>
  );
}

// 最近驻足：后端保存的最近两位人物；后端不可用时读本地镜像
export function RecentWidget() {
  const [recent, setRecent] = useState(null);
  useEffect(() => {
    let alive = true;
    const apply = (list) => { if (alive) setRecent(list && list.length ? list : null); };
    api.recent()
      .then((r) => apply(r.data.recent))
      .catch(() => apply(readLocalRecent()));
    const onUpdate = (e) => apply(e.detail || readLocalRecent());
    window.addEventListener('im:recent', onUpdate);
    return () => { alive = false; window.removeEventListener('im:recent', onUpdate); };
  }, []);
  if (!recent) return null;
  return (
    <aside className="im-recent" aria-label="最近访问的人物">
      <span className="im-recent-label">最近驻足</span>
      {recent.slice(0, 2).map((r) => (
        <Link key={r.figure.id} className="im-recent-chip" to={`/gallery/figure/${r.figure.id}`}>
          <span className="im-recent-mono">{r.figure.monogram}</span>
          <span className="im-recent-name">{r.figure.name}</span>
        </Link>
      ))}
    </aside>
  );
}
