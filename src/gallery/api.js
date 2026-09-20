// 墨与大理石 · API 层
// 设计目标：网络中断、超时、服务器错误都有明确的降级路径。
// 1) 请求带超时（AbortController）与一次自动重试
// 2) GET 成功结果写入内存 + localStorage 缓存；失败时回退缓存并标记 stale
// 3) 写操作（最近访问）失败时镜像到 localStorage，界面不因此中断

const LS_PREFIX = 'im:cache:';
const memoryCache = new Map();

export class ApiError extends Error {
  constructor(message, { status = 0, url = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
  }
}

function readLsCache(path) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + path);
    if (!raw) return null;
    return JSON.parse(raw).data ?? null;
  } catch {
    return null;
  }
}

function writeLsCache(path, data) {
  try {
    localStorage.setItem(LS_PREFIX + path, JSON.stringify({ t: Date.now(), data }));
  } catch { /* 存储不可用（隐私模式等）时静默跳过 */ }
}

async function request(path, { method = 'GET', body, timeout = 9000, retries = 1 } = {}) {
  const cacheKey = `${method} ${path}`;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(path, {
        method,
        credentials: 'same-origin',
        signal: ctrl.signal,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      clearTimeout(timer);
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j && j.error && j.error.message) message = j.error.message;
        } catch { /* 非 JSON 错误体 */ }
        throw new ApiError(message, { status: res.status, url: path });
      }
      const data = await res.json();
      if (method === 'GET') {
        memoryCache.set(cacheKey, data);
        writeLsCache(path, data);
      }
      return { data, stale: false };
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      const retryable = err.name === 'AbortError' || err instanceof TypeError || (err.status ?? 0) >= 500;
      if (attempt < retries && retryable) continue;
      break;
    }
  }

  // 网络失败 → 回退缓存（仅 GET）
  if (method === 'GET') {
    const cached = memoryCache.get(cacheKey) ?? readLsCache(path);
    if (cached) return { data: cached, stale: true };
  }
  if (lastError instanceof ApiError) throw lastError;
  throw new ApiError(
    lastError && lastError.name === 'AbortError' ? '请求超时：网络可能已断开' : '网络连接失败',
    { url: path }
  );
}

export const api = {
  figures: () => request('/api/gallery/figures'),
  figure: (id) => request(`/api/gallery/figures/${encodeURIComponent(id)}`),
  questions: () => request('/api/gallery/questions'),
  question: (id) => request(`/api/gallery/questions/${encodeURIComponent(id)}`),
  keywords: () => request('/api/gallery/keywords'),
  traditions: () => request('/api/gallery/traditions'),
  relations: () => request('/api/gallery/relations'),
  recent: () => request('/api/gallery/me/recent', { timeout: 5000, retries: 0 }),
  visit: (id) => request('/api/gallery/me/recent', { method: 'POST', body: { id }, timeout: 5000, retries: 0 }),
};

// ---- 最近访问的本地镜像（后端不可用时兜底） ----
const LOCAL_RECENT_KEY = 'im:recent:local';
export function readLocalRecent() {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.slice(0, 2) : [];
  } catch {
    return [];
  }
}
export function writeLocalRecent(figureLite) {
  try {
    const rest = readLocalRecent().filter((r) => r.figure && r.figure.id !== figureLite.id);
    localStorage.setItem(LOCAL_RECENT_KEY, JSON.stringify([{ id: figureLite.id, at: Date.now(), figure: figureLite }, ...rest].slice(0, 2)));
  } catch { /* 忽略 */ }
}
