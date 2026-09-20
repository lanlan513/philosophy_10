// 墨与大理石 · 共享上下文：基础数据、toast、关键词跳转选择器、在线状态
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api.js';

const GalleryCtx = createContext(null);
export const useGallery = () => useContext(GalleryCtx);

// 跨页面保留基础数据：在长廊各页之间跳转时不闪加载态，后台静默刷新
let baseCache = null;

export function GalleryProvider({ children }) {
  const [state, setState] = useState(() => baseCache
    ? { status: 'ok', stale: false, ...baseCache }
    : { status: 'loading', stale: false });
  const [toasts, setToasts] = useState([]);
  const [chooser, setChooser] = useState(null); // { title, targets: [{kind,id,label,sub}] }
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const navigate = useNavigate();
  const toastSeq = useRef(0);

  const load = useCallback(async () => {
    if (!baseCache) setState((s) => ({ status: 'loading', stale: s.stale }));
    try {
      const [figs, kws, qs, trs] = await Promise.all([
        api.figures(), api.keywords(), api.questions(), api.traditions(),
      ]);
      const stale = figs.stale || kws.stale || qs.stale || trs.stale;
      baseCache = {
        figures: figs.data.figures || [],
        keywords: kws.data.keywords || [],
        questions: qs.data.questions || [],
        traditions: trs.data.traditions || [],
      };
      setState({ status: 'ok', stale, ...baseCache });
    } catch (error) {
      if (baseCache) { setState({ status: 'ok', stale: true, ...baseCache }); return; }
      setState({ status: 'error', error });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const toast = useCallback((message, tone = 'ink') => {
    const id = ++toastSeq.current;
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 2600);
  }, []);

  const maps = useMemo(() => {
    if (state.status !== 'ok') return null;
    return {
      figures: new Map(state.figures.map((f) => [f.id, f])),
      keywords: new Map(state.keywords.map((k) => [k.id, k])),
      questions: new Map(state.questions.map((q) => [q.id, q])),
      traditions: new Map(state.traditions.map((t) => [t.id, t])),
    };
  }, [state]);

  // 关键词点击：解析下一跳（共同问题优先，其次其他人物；多目标弹出选择器；无目标给出死端反馈）
  const openKeyword = useCallback((keywordId, currentFigureId) => {
    if (!maps) return;
    const kw = maps.keywords.get(keywordId);
    if (!kw) { toast('这个关键词的资料尚未收录', 'warn'); return; }
    const targets = [];
    for (const qid of kw.questions || []) {
      const q = maps.questions.get(qid);
      if (q) targets.push({ kind: 'question', id: qid, label: `问${q.no} · ${q.title}`, sub: '共同问题', href: `/gallery/question/${qid}` });
    }
    for (const fid of kw.figures || []) {
      if (fid === currentFigureId) continue;
      const f = maps.figures.get(fid);
      if (f) targets.push({ kind: 'figure', id: fid, label: f.name, sub: `${f.era} · 人物`, href: `/gallery/figure/${fid}` });
    }
    if (targets.length === 0) {
      toast(`「${kw.label}」暂无下一跳 · 资料待补`, 'warn');
      return false; // 调用方据此把关键词标记为死端
    }
    if (targets.length === 1) { navigate(targets[0].href); return true; }
    setChooser({ title: `「${kw.label}」通向`, targets });
    return true;
  }, [maps, navigate, toast]);

  const value = useMemo(() => ({
    ...state, maps, toast, openKeyword, online,
    retry: load,
  }), [state, maps, toast, openKeyword, online, load]);

  return (
    <GalleryCtx.Provider value={value}>
      {children}
      <div className="im-toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`im-toast im-toast-${t.tone}`}>{t.message}</div>)}
      </div>
      {chooser && (
        <div className="im-chooser-mask" onClick={() => setChooser(null)}>
          <div className="im-chooser" role="dialog" aria-label={chooser.title} onClick={(e) => e.stopPropagation()}>
            <p className="im-chooser-title">{chooser.title}</p>
            <div className="im-chooser-list">
              {chooser.targets.map((t) => (
                <button key={`${t.kind}:${t.id}`} className="im-chooser-item" onClick={() => { setChooser(null); navigate(t.href); }}>
                  <span className={`im-chooser-kind ${t.kind}`}>{t.kind === 'question' ? '问' : '人'}</span>
                  <span className="im-chooser-label">{t.label}</span>
                  <span className="im-chooser-sub">{t.sub}</span>
                </button>
              ))}
            </div>
            <button className="im-chooser-close" onClick={() => setChooser(null)}>留在此页</button>
          </div>
        </div>
      )}
      {!online && <div className="im-offline">网络已断开 · 正在展示已缓存的内容，部分跳转可能不可用</div>}
    </GalleryCtx.Provider>
  );
}
