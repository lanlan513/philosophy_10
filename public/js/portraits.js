/**
 * 图像懒加载：
 *  - portrait === null（档案无图，如墨翟）：根本不创建 <img>，只渲染文字印章
 *  - 有路径：进入视口前 200px 才设置 src；加载成功淡入
 *  - 404 / 解码失败 / 离线且无缓存（如霍布斯）：替换为纯文字占位，不重试无意义请求
 *  - 文本优先：无论图像处于什么状态，文字层始终在 DOM 中且不依赖图像
 */

const TAG_TEXT = {
  east: '墨 像',
  west: '石 像'
};

/**
 * @param {object} opts
 * @param {string|null} opts.portrait  图像 URL；null 表示档案无图
 * @param {string} opts.monogram       文字印章（无图 / 失败 / 加载中都可见）
 * @param {'east'|'west'} opts.hemisphere
 * @param {string} opts.alt
 */
export function createPortrait({ portrait, monogram, hemisphere, alt = '' }) {
  const frame = document.createElement('div');
  frame.className = `portrait-frame`;

  // 1) 文字印章始终存在（加载中也可见；这就是文本优先）
  const fallback = document.createElement('div');
  fallback.className = 'portrait-fallback';
  fallback.textContent = monogram;
  frame.appendChild(fallback);

  // 2) 档案无图：不发任何网络请求
  if (!portrait) {
    frame.dataset.state = 'missing-archive';
    frame.title = '档案中此像已佚，仅以文字著录';
    appendTag(frame, hemisphere, '档案无图');
    return frame;
  }

  // 3) 有路径才创建 img，但先不给 src
  frame.dataset.state = 'pending';
  const img = new Image();
  img.decoding = 'async';
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';
  img.alt = alt;
  let settled = false;

  const markFailed = () => {
    if (settled) return;
    settled = true;
    frame.dataset.state = 'failed';
    frame.title = '图像档案损坏或无法加载，仅显示文字';
    img.remove();
    appendTag(frame, hemisphere, '图像缺失');
  };

  img.addEventListener('load', () => {
    if (settled) return;
    settled = true;
    frame.dataset.state = 'loaded';
    img.classList.add('is-loaded');
  }, { once: true });
  img.addEventListener('error', markFailed, { once: true });

  frame.appendChild(img);
  appendTag(frame, hemisphere, TAG_TEXT[hemisphere] || '档案图');

  // 4) 进入视口前 200px 才真正加载
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.disconnect();
      if (frame.dataset.state === 'pending') {
        img.src = portrait;
        // 已在缓存中且解码完成的情形
        if (img.complete && img.naturalWidth > 0) {
          frame.dataset.state = 'loaded';
          img.classList.add('is-loaded');
        }
      }
    }
  }, { rootMargin: '200px 0px' });
  io.observe(frame);

  // 便于虚拟列表回收时断开观察
  frame._unobserve = () => io.disconnect();

  return frame;
}

function appendTag(frame, hemisphere, text) {
  let tag = frame.querySelector('.portrait-tag');
  if (!tag) {
    tag = document.createElement('span');
    tag.className = 'portrait-tag';
    frame.appendChild(tag);
  }
  tag.textContent = text;
  tag.dataset.hemisphere = hemisphere;
}
