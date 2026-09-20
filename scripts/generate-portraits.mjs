/**
 * 为每位人物生成一张“非肖像”的档案图：
 *  - 东方人物（hemisphere=east）→ 墨像：宣纸底、墨环、朱文印章
 *  - 西方人物（hemisphere=west）→ 石像：大理石纹、凿刻碑形
 * 这些图像是抽象的视觉实验，而非人物容貌；图像加载失败时前端退回纯文字。
 *
 * 故意的档案残缺（用于演示降级）：
 *  - 墨翟：data.json 中 portrait 为 null（档案无图，前端不发起请求）
 *  - 霍布斯：data.json 指向 /portraits/hobbes.svg，但该文件不生成（404，前端走图像失败占位）
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'portraits');

// 与 server/data.json 保持同步的人物清单（portrait 字段）
const FIGURES = [
  { id: 'confucius', hemi: 'east', monogram: '孔', label: 'CONFUCIUS' },
  { id: 'socrates', hemi: 'west', monogram: 'Σ', label: 'SOCRATES' },
  { id: 'mill', hemi: 'west', monogram: 'M', label: 'MILL' },
  { id: 'mencius', hemi: 'east', monogram: '孟', label: 'MENGZI' },
  { id: 'rousseau', hemi: 'west', monogram: 'R', label: 'ROUSSEAU' },
  { id: 'zhuangzi', hemi: 'east', monogram: '周', label: 'ZHUANGZI' },
  { id: 'heraclitus', hemi: 'west', monogram: 'H', label: 'HERACLITUS' },
  { id: 'laozi', hemi: 'east', monogram: '老', label: 'LAOZI' },
  { id: 'wittgenstein', hemi: 'west', monogram: 'W', label: 'WITTGENSTEIN' },
  { id: 'hanfei', hemi: 'east', monogram: '韓', label: 'HAN FEI' },
  // hobbes 故意不生成
  { id: 'nagarjuna', hemi: 'east', monogram: '龍', label: 'NĀGĀRJUNA' },
  { id: 'kant', hemi: 'west', monogram: 'K', label: 'KANT' },
  { id: 'huineng', hemi: 'east', monogram: '能', label: 'HUINENG' },
  { id: 'sartre', hemi: 'west', monogram: 'S', label: 'SARTRE' },
  { id: 'zhuxi', hemi: 'east', monogram: '熹', label: 'ZHU XI' },
  { id: 'aquinas', hemi: 'west', monogram: 'T', label: 'AQUINAS' },
  { id: 'wang-yangming', hemi: 'east', monogram: '明', label: 'WANG YANGMING' },
  { id: 'dewey', hemi: 'west', monogram: 'D', label: 'DEWEY' }
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function inkSvg(fig) {
  const rnd = mulberry32(hashSeed(fig.id));
  const W = 600;
  const H = 760;
  // 墨环（不完全闭合的圆，一笔枯笔）
  const cx = W / 2;
  const cy = 330;
  const R = 168;
  const gapStart = -0.32 + rnd() * 0.12;
  const gapEnd = 0.2 + rnd() * 0.1;
  const arcPath = (r, start, end) => {
    const pts = [];
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const a = start + ((end - start) * i) / steps;
      const wobble = Math.sin(a * 7 + rnd() * 0.02 - rnd() * 0.02) * 3;
      pts.push([cx + (r + wobble) * Math.cos(a), cy + (r + wobble) * Math.sin(a)]);
    }
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  };
  const strokes = [];
  for (let i = 0; i < 3; i++) {
    const r = R - i * 7 + (rnd() - 0.5) * 6;
    const width = 16 - i * 4;
    const op = 0.82 - i * 0.18;
    const dash = i === 2 ? '1 14' : 'none';
    strokes.push(`<path d="${arcPath(r, gapStart + i * 0.02, Math.PI * 2 + gapEnd - i * 0.02)}" fill="none" stroke="#1c1d1a" stroke-width="${width}" stroke-linecap="round" opacity="${op}"${dash === 'none' ? '' : ` stroke-dasharray="${dash}"`}/>`);
  }
  // 飞白：随机短墨点散布在环上
  const splashes = [];
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2;
    const r = R + (rnd() - 0.5) * 26;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    const rr = 0.8 + rnd() * 2.6;
    splashes.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}" fill="#1c1d1a" opacity="${(0.05 + rnd() * 0.25).toFixed(2)}"/>`);
  }
  // 纸面颗粒
  const grain = [];
  for (let i = 0; i < 260; i++) {
    grain.push(`<circle cx="${(rnd() * W).toFixed(1)}" cy="${(rnd() * H).toFixed(1)}" r="${(0.4 + rnd() * 0.9).toFixed(2)}" fill="#3a352c" opacity="${(0.02 + rnd() * 0.05).toFixed(2)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${fig.label} 墨像（抽象档案图，非容貌）">
  <defs>
    <linearGradient id="paper-${fig.id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f3ede0"/><stop offset="1" stop-color="#e8e0cf"/>
    </linearGradient>
    <filter id="rough-${fig.id}"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.2"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#paper-${fig.id})"/>
  ${grain.join('\n  ')}
  <g filter="url(#rough-${fig.id})">
    ${strokes.join('\n    ')}
  </g>
  ${splashes.join('\n  ')}
  <text x="${cx}" y="${cy + 62}" text-anchor="middle" font-family="Georgia,'Songti SC','Noto Serif SC',serif" font-size="96" fill="#23241f" opacity="0.92">${fig.monogram}</text>
  <g transform="translate(${cx - 34},${H - 158})">
    <rect x="0" y="0" width="68" height="68" rx="4" fill="#9e2b25"/>
    <text x="34" y="47" text-anchor="middle" font-family="'Songti SC','Noto Serif SC',serif" font-size="38" fill="#f3ede0">${fig.monogram}</text>
  </g>
  <text x="${cx}" y="${H - 52}" text-anchor="middle" font-family="Georgia,serif" font-size="15" letter-spacing="4" fill="#6b6355">墨 像 · INK ARCHIVE</text>
</svg>`;
}

function marbleSvg(fig) {
  const rnd = mulberry32(hashSeed(fig.id));
  const W = 600;
  const H = 760;
  const vein = (x0, slope, amp, steps = 9) => {
    let d = `M ${x0.toFixed(1)} -20`;
    let x = x0;
    for (let i = 1; i <= steps; i++) {
      const y = -20 + ((H + 40) * i) / steps;
      x += slope + (rnd() - 0.5) * amp;
      d += ` L ${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return d;
  };
  const veins = [];
  for (let i = 0; i < 9; i++) {
    const grey = 120 + Math.floor(rnd() * 60);
    veins.push(`<path d="${vein(rnd() * W, (rnd() - 0.5) * 26, 60)}" fill="none" stroke="rgb(${grey},${grey},${grey + 4})" stroke-width="${(0.6 + rnd() * 1.8).toFixed(1)}" opacity="${(0.1 + rnd() * 0.22).toFixed(2)}"/>`);
  }
  // 凿刻的碑形胸像（纯粹几何，不模拟面容）
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${fig.label} 石像（抽象档案图，非容貌）">
  <defs>
    <linearGradient id="stone-${fig.id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e9e7e2"/><stop offset="0.55" stop-color="#d9d6cf"/><stop offset="1" stop-color="#c9c6bf"/>
    </linearGradient>
    <linearGradient id="bust-${fig.id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b8b5ad"/><stop offset="1" stop-color="#8f8c85"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#stone-${fig.id})"/>
  ${veins.join('\n  ')}
  <g opacity="0.9">
    <path d="M300 214 a86 86 0 1 0 0.1 0 Z" fill="url(#bust-${fig.id})"/>
    <path d="M150 620 c0 -118 67 -178 150 -178 c83 0 150 60 150 178 Z" fill="url(#bust-${fig.id})"/>
    <path d="M300 214 a86 86 0 1 0 0.1 0" fill="none" stroke="#6f6d68" stroke-width="2" opacity="0.6"/>
    <path d="M150 620 c0 -118 67 -178 150 -178 c83 0 150 60 150 178" fill="none" stroke="#6f6d68" stroke-width="2" opacity="0.6"/>
  </g>
  <text x="300" y="392" text-anchor="middle" font-family="Georgia,serif" font-size="120" fill="#f4f2ec" opacity="0.55">${fig.monogram}</text>
  <rect x="120" y="668" width="360" height="2" fill="#7d7a74" opacity="0.7"/>
  <text x="300" y="712" text-anchor="middle" font-family="Georgia,serif" font-size="15" letter-spacing="4" fill="#5d5a54">石 像 · MARBLE ARCHIVE</text>
</svg>`;
}

await mkdir(OUT_DIR, { recursive: true });
let count = 0;
for (const fig of FIGURES) {
  const svg = fig.hemi === 'east' ? inkSvg(fig) : marbleSvg(fig);
  await writeFile(path.join(OUT_DIR, `${fig.id}.svg`), svg, 'utf8');
  count++;
}
console.log(`已生成 ${count} 张档案图 → public/portraits/（墨像 / 石像）`);
