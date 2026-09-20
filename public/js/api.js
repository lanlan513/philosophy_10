/**
 * API 客户端：
 *  - 所有 GET 都带内存缓存 + localStorage 兜底，网络中断时仍可阅读已缓存数据
 *  - 超时与 5xx 重试一次（指数退避）
 *  - POST /visits 失败时进入离线队列，恢复在线后重放
 * 注意：缓存的只是内容数据；图像失败由 portraits.js 单独处理。
 */

const CACHE_PREFIX = 'im:cache:';
const QUEUE_KEY = 'im:visit-queue';
const TIMEOUT_MS = 9000;

function memoryStorage() {
  const map = new Map();
  return {
    get(k) { return map.has(k) ? map.get(k) : null; },
    set(k, v) { map.set(k, v); },
  };
}
const mem = memoryStorage();

function lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* 隐私模式 / 配额满：静默降级 */ }
}
function lsRemove(key) {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

class ApiError extends Error {
  constructor(message, { status = 0, offline = false } = {}) {
    super(message);
    this.status = status;
    this.offline = offline;
  }
}

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function fetchWithTimeout(url, options = {}, timeout = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  return fetch(url, { ...options, signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

async function getJSON(path, { retry = 1, allowStale = true } = {}) {
  const cacheKey = CACHE_PREFIX + path;

  if (isOffline()) {
    const cached = mem.get(cacheKey) || lsGet(cacheKey);
    if (cached) {
      const { data } = JSON.parse(cached);
      return { data, stale: true, offline: true };
    }
    throw new ApiError('网络已中断，且本地没有这条档案的缓存。', { offline: true });
  }

  let lastError = null;
  for (let attempt = 0; attempt <= retry; attempt++) {
    try {
      const res = await fetchWithTimeout(path);
      if (res.status === 404) throw new ApiError(`档案中找不到该条目（404）：${path}`, { status: 404 });
      if (!res.ok) throw new ApiError(`接口暂时不可用（${res.status}），${path}`, { status: res.status });
      const data = await res.json();
      const packed = JSON.stringify({ at: Date.now(), data });
      mem.set(cacheKey, packed);
      lsSet(cacheKey, packed);
      return { data, stale: false, offline: false };
    } catch (err) {
      lastError = err;
      // 404 不重试（资源确实不存在，重试无意义）
      if (err instanceof ApiError && err.status === 404) throw err;
      if (attempt < retry) {
        await new Promise((r) => setTimeout(r, 280 * (attempt + 1)));
      }
    }
  }

  if (allowStale) {
    const cached = mem.get(cacheKey) || lsGet(cacheKey);
    if (cached) {
      const { data } = JSON.parse(cached);
      return { data, stale: true, offline: false };
    }
  }
  if (isOffline() || lastError?.name === 'AbortError') {
    throw new ApiError(lastError?.name === 'AbortError' ? '请求超时，请检查网络。' : '网络已中断。', { offline: true });
  }
  throw lastError instanceof ApiError ? lastError : new ApiError('网络请求失败，请稍后重试。');
}

/** 读取最近访问（带缓存标记，便于 UI 提示陈旧） */
export async function getRecent() {
  return getJSON('/api/visits');
}

/**
 * 记录一次人物访问，后端只保留最近两位。
 * 离线 / 失败时写入本地队列并立即以本地数据乐观返回，恢复后重放。
 */
export async function recordVisit(figureId, fallbackFigure = null) {
  const enqueue = () => {
    let queue = [];
    try { queue = JSON.parse(lsGet(QUEUE_KEY) || '[]'); } catch { queue = []; }
    queue.unshift({ figureId, at: Date.now() });
    lsSet(QUEUE_KEY, JSON.stringify(queue.slice(0, 10)));
  };

  if (isOffline()) {
    enqueue();
    return { recent: optimisticRecent(figureId, fallbackFigure), queued: true };
  }
  try {
    const res = await fetchWithTimeout('/api/visits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ figureId })
    }, 6000);
    if (!res.ok) throw new ApiError('visit post failed', { status: res.status });
    return { ...(await res.json()), queued: false };
  } catch {
    enqueue();
    return { recent: optimisticRecent(figureId, fallbackFigure), queued: true };
  }
}

function optimisticRecent(figureId, fallbackFigure) {
  // 离线时不假装知道服务端状态：只返回当前这一位（若有摘要），避免编造第二位
  return fallbackFigure ? [fallbackFigure] : [];
}

/** 网络恢复时重放离线期间的访问记录（去重，最多 2 条有效） */
export async function flushVisitQueue() {
  let queue = [];
  try { queue = JSON.parse(lsGet(QUEUE_KEY) || '[]'); } catch { queue = []; }
  if (!queue.length) return { flushed: 0 };
  const ids = [...new Set(queue.map((x) => x.figureId))].slice(0, 2);
  let flushed = 0;
  for (const id of ids) {
    try {
      const res = await fetchWithTimeout('/api/visits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ figureId: id })
      }, 6000);
      if (res.ok) flushed++;
    } catch { /* 仍离线：保留队列，等下次 online 事件 */ }
  }
  if (flushed) lsRemove(QUEUE_KEY);
  return { flushed };
}

/* ----------------------------- 业务读取接口 ----------------------------- */

export const api = {
  figures: () => getJSON('/api/figures').then((r) => r.data),
  figure: (id) => getJSON(`/api/figures/${encodeURIComponent(id)}`).then((r) => r.data),
  questions: () => getJSON('/api/questions').then((r) => r.data),
  question: (id) => getJSON(`/api/questions/${encodeURIComponent(id)}`).then((r) => r.data),
  traditions: () => getJSON('/api/traditions').then((r) => r.data),
  hop: (keywordId) => getJSON(`/api/keywords/${encodeURIComponent(keywordId)}/hop`, { retry: 0 }).then((r) => r.data),
};

export { ApiError };
