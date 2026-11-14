import type { TextFxKind } from '../model/types';
import type { TextRender } from './textRender';

// 文字樣式特效（IG 那種，整段字卡一直在動）：閃爍（亮光掃過）、發光閃亮、方格字、震動。
// 每一格的樣子只由「這個字卡自己的時間 t」決定（亂數用 id 當種子），所以預覽和匯出同一秒畫面一樣。
// 做法：拿字卡畫好的圖（textRender），再加工成一張新圖；時間先量化成幾個「步」，同一步共用快取。

export type TextFxDef = { id: TextFxKind; name: string; code: string };
export const TEXT_FXS: TextFxDef[] = [
  { id: 'shimmer', name: '閃爍', code: '爍' },
  { id: 'sparkle', name: '發光閃亮', code: '亮' },
  { id: 'pixel', name: '方格字', code: '方' },
  { id: 'shake', name: '震動', code: '震' },
];
export const textFxName = (k: TextFxKind) => TEXT_FXS.find((x) => x.id === k)?.name ?? '文字特效';
export const textFxCode = (k: TextFxKind) => TEXT_FXS.find((x) => x.id === k)?.code ?? '效';

const SHIMMER_CYCLE = 1.6; // 秒：亮光從左掃到右一輪
const SPARKLE_CYCLE = 1.2;
const PIXEL_STEP = 0.12; // 方格每幾秒換一次取樣位置
const SHAKE_RATE = 12; // 次／秒

/** 時間量化成「第幾步」：同一步畫面完全一樣（快取鍵），也讓預覽和匯出一致 */
export function textFxStep(kind: TextFxKind, t: number): number {
  const x = Math.max(t, 0);
  switch (kind) {
    case 'shimmer':
      return Math.floor((x % SHIMMER_CYCLE) * 30);
    case 'sparkle':
      return Math.floor(x * 15);
    case 'pixel':
      return Math.floor(x / PIXEL_STEP);
    case 'shake':
      return Math.floor(x * SHAKE_RATE);
  }
}

/** 小數字雜訊（同一個種子永遠同一個值） */
export const fxRnd = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const hash = (s: string) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003;
  return h;
};

/** 打字：進場從前面往後打（露出前 ceil(p×n) 個字）；出場像 delete，從最後一個字往前刪（剩 ceil((1−p)×n) 個字） */
export function typingCount(role: 'in' | 'out', p: number, n: number): number {
  const q = role === 'in' ? p : 1 - p;
  return Math.min(Math.max(Math.ceil(q * n - 1e-9), 0), n);
}

const cache = new Map<string, TextRender>();
const MAX_CACHE = 40;

const mkCanvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** 把一張圖的有字的地方染成單一顏色 */
function tint(src: HTMLCanvasElement, color: string, alpha = 1): HTMLCanvasElement {
  const c = mkCanvas(src.width, src.height);
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.22;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
}

/**
 * 套上文字樣式特效。unit＝第一段字的大小（px，已乘畫面縮放），color＝字的顏色；t＝字卡自己的時間（開始後幾秒）。
 */
export function applyTextFx(
  base: TextRender,
  kind: TextFxKind,
  t: number,
  seed: string,
  unit: number,
  color: string,
): TextRender {
  const step = textFxStep(kind, t);
  const key = `${base.key}|${kind}|${step}|${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { w, h, content } = base;
  const out = mkCanvas(w, h);
  const g = out.getContext('2d')!;
  const sd = hash(seed);
  if (kind === 'shimmer') {
    // 亮光（斜的一道）從左掃到右：掃到的字全亮，其他字半透明
    const phase = step / 30 / SHIMMER_CYCLE;
    const band = content.w * 0.45 + unit;
    const cx = content.x - band + phase * (content.w + band * 2);
    g.globalAlpha = 0.42;
    g.drawImage(base.canvas, 0, 0);
    g.globalAlpha = 1;
    const lit = mkCanvas(w, h);
    const lg = lit.getContext('2d')!;
    lg.drawImage(base.canvas, 0, 0);
    lg.globalCompositeOperation = 'destination-in';
    const grad = lg.createLinearGradient(cx - band / 2, 0, cx + band / 2, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    lg.fillStyle = grad;
    lg.fillRect(0, 0, w, h);
    g.drawImage(lit, 0, 0);
  } else if (kind === 'sparkle') {
    const ph = ((step / 15) % SPARKLE_CYCLE) / SPARKLE_CYCLE;
    const glow = 0.5 + 0.5 * Math.sin(ph * Math.PI * 2);
    g.shadowColor = color;
    g.shadowBlur = unit * (0.12 + 0.32 * glow);
    g.drawImage(base.canvas, 0, 0);
    g.drawImage(base.canvas, 0, 0);
    g.shadowBlur = 0;
    g.shadowColor = 'transparent';
    // 小四芒星輪流閃
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      const x = content.x + fxRnd(sd + i * 3.1) * content.w;
      const y = content.y + fxRnd(sd + i * 5.7 + 1) * content.h;
      const r = unit * (0.1 + 0.18 * fxRnd(sd + i * 2.3));
      const b = Math.max(0, Math.sin((ph + fxRnd(sd + i * 9.1)) * Math.PI * 2));
      if (b < 0.05) continue;
      g.globalAlpha = b;
      star(g, x, y, r * (0.5 + 0.5 * b));
    }
    g.globalAlpha = 1;
  } else if (kind === 'pixel') {
    // 字縮小再用最近點放大成粗方格；每 0.12 秒方格的取樣位置錯開一點（方格一直在動）＋一圈黑邊
    const bs = Math.max(3, Math.round(unit * 0.12));
    const jx = fxRnd(sd + step * 1.3) * bs;
    const jy = fxRnd(sd + step * 2.9 + 4) * bs;
    const sw = Math.ceil(w / bs) + 2;
    const sh = Math.ceil(h / bs) + 2;
    const small = mkCanvas(sw, sh);
    const sg = small.getContext('2d')!;
    sg.imageSmoothingEnabled = true;
    sg.drawImage(base.canvas, jx / bs, jy / bs, w / bs, h / bs);
    // 半透明的邊緣收成「有或沒有」，方格才硬
    const id = sg.getImageData(0, 0, sw, sh);
    for (let i = 3; i < id.data.length; i += 4) id.data[i] = id.data[i]! > 110 ? 255 : 0;
    sg.putImageData(id, 0, 0);
    const blocks = mkCanvas(w, h);
    const bg = blocks.getContext('2d')!;
    bg.imageSmoothingEnabled = false;
    bg.drawImage(small, 0, 0, sw, sh, -jx, -jy, sw * bs, sh * bs);
    const dark = tint(blocks, '#000000');
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
    ] as const)
      g.drawImage(dark, dx * bs, dy * bs);
    g.drawImage(blocks, 0, 0);
  } else {
    // 震動：整段字左右快速抖，偶爾一下紅藍錯位
    const amp = unit * 0.07;
    const dx = (fxRnd(sd + step * 2.1) - 0.5) * 2 * amp;
    const dy = (fxRnd(sd + step * 4.7 + 2) - 0.5) * amp * 0.3;
    if (fxRnd(sd + step * 7.3 + 9) > 0.68) {
      const d = unit * 0.07;
      g.globalAlpha = 0.75;
      g.drawImage(tint(base.canvas, '#ff2a4a'), dx - d, dy);
      g.drawImage(tint(base.canvas, '#22d3ee'), dx + d, dy);
      g.globalAlpha = 1;
    }
    g.drawImage(base.canvas, dx, dy);
  }
  const res: TextRender = { canvas: out, w, h, key, content };
  cache.set(key, res);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
  return res;
}
