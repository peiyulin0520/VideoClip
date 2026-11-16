// 動態字卡（64 式）的共用工具。改寫自 claude-animated-text（MIT，© 2026 pound / POUND0423）：
// 原版是改 DOM／CSS 的動畫，這裡改成畫到 canvas 2D；時間、緩動、數字都照原碼，單位 cqmin／cqw／cqh 換成舞台的像素。
// 同一個 t 永遠畫出同一張圖（亂數用固定種子），所以預覽、單格輸出、匯出一致。

import type { KineticFade, KineticId } from '../../model/types';
import type { KineticArea } from './hit';

/** 舞台：一張 W×H 的畫布，加上原版 container query 單位的像素值 */
export type Stage = {
  g: CanvasRenderingContext2D;
  W: number;
  H: number;
  /** 1cqmin（短邊的 1%）、1cqw（寬的 1%）、1cqh（高的 1%）的像素 */
  cqmin: number;
  cqw: number;
  cqh: number;
  /** 詞（已拆好，至少 1 個） */
  words: string[];
  /** 主文字色（原版的 --fg）、強調色（--hi）、強調色上的字色（--hifg）、舞台底色（--bg，透明時是 null） */
  fg: string;
  hi: string;
  hifg: string;
  bg: string | null;
  /** 字體（canvas font 的 family 部分，含備用字體）與字重（原版用 900 的地方請求 900，沒有的字體會用最接近的） */
  family: string;
};

export type KineticDef = {
  id: KineticId;
  /** 組別 */
  group: KineticGroup;
  zh: string;
  en: string;
  /** 原版預設底色（這一式搭配的配色）：fg／hi／hifg／bg 的預設值 */
  scheme: KineticScheme;
  /** 範例字（字卡還沒輸入時用） */
  words: string[];
  /** 代表畫面的秒數（卡片縮圖用） */
  poster: number;
  /** 一輪多少秒（n＝詞的數量）；連續跑的（跑馬燈）回傳 null */
  len: (n: number) => number | null;
  /** 預設框：wide＝16:9 一條（預設）、full＝整個畫面、lyrics＝歌詞框 */
  area?: KineticArea;
  /** 預設的邊緣淡出（沒給＝不淡） */
  fade?: KineticFade;
  /** 框是整個畫面時，點選、選取框用的範圍（比例 x、y、w、h）；沒給＝中間一條 */
  hit?: [number, number, number, number];
  draw: (s: Stage, t: number) => void;
};

export type KineticGroup = 'in' | 'flow' | 'swap' | 'em' | 'sp' | 'mv' | 'tv' | 'hr';
export type KineticScheme = 'ink' | 'paper' | 'cobalt' | 'verm' | 'key';

// ---------- 原版的數學工具（照抄） ----------
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const E = {
  out: (p: number) => 1 - Math.pow(1 - p, 3),
  in: (p: number) => p * p * p,
  io: (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  back: (p: number) => {
    const c = 2.2;
    return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
  },
  expo: (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
  el: (p: number) =>
    p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};
export const cs = (s: string): string[] => Array.from(s);
/** 字的「寬度」估計（原版用它決定字大小與跑馬燈一輪的長度）：拉丁字 0.58、中文 1 */
export const wlen = (s: string) => cs(s).reduce((n, c) => n + (c.codePointAt(0)! < 0x2e80 ? 0.58 : 1), 0);
/** 固定亂數：同樣的三個數永遠同一個值（0～1） */
export const rnd = (a: number, b: number, c: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
export const pick = <T>(W: T[], i: number): T => W[((i % W.length) + W.length) % W.length]!;
/** 原版 fit()：字大小（px）＝ min(max cqmin, w÷詞寬 cqw) */
export const fit = (s: Stage, word: string, max: number, w: number) =>
  Math.min(max * s.cqmin, (w / Math.max(wlen(word), 1)) * s.cqw);

/** 把字卡的文字拆成詞：空白、逗號、頓號、換行分開，最多 8 個詞、每個詞最多 14 個字（跟原版一樣） */
export function splitWords(text: string): string[] {
  return text
    .split(/[\s,，、]+/)
    .map((w) => cs(w).slice(0, 14).join(''))
    .filter(Boolean)
    .slice(0, 8);
}

// ---------- 畫字 ----------
const font = (s: Stage, px: number, weight = 900) => `${weight} ${Math.max(px, 1)}px ${s.family}`;

/** 在 (x, y) 置中畫一個詞（y＝這一行的垂直中心）；scaleX／scaleY／rotate（度）以詞的中心為基準 */
export function drawWord(
  s: Stage,
  word: string,
  x: number,
  y: number,
  px: number,
  o: { color?: string; alpha?: number; sx?: number; sy?: number; rot?: number; weight?: number } = {},
) {
  const { g } = s;
  g.save();
  g.globalAlpha *= o.alpha ?? 1;
  g.translate(x, y);
  if (o.rot) g.rotate((o.rot * Math.PI) / 180);
  g.scale(o.sx ?? 1, o.sy ?? 1);
  g.font = font(s, px, o.weight);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = o.color ?? s.fg;
  g.fillText(word, 0, 0);
  g.restore();
}

/**
 * 原版 mq() 的 canvas 版：把一段字（重複到至少 min 個字寬）水平（或垂直）接成兩份，依 dist 平移。
 * 平移量＝ ((dist÷字寬估計) 取小數) × 一份的實際寬度；box＝跑馬燈的範圍（x、y、w、h，px），超出範圍的被裁掉。
 * baseY＝文字垂直中心；vertical＝直排（由上往下寫）。
 */
export function marquee(
  s: Stage,
  unit: string,
  dist: number,
  px: number,
  box: { x: number; y: number; w: number; h: number },
  o: { min?: number; color?: string; weight?: number; vertical?: boolean } = {},
) {
  const { g } = s;
  let str = unit;
  while (wlen(str) < (o.min ?? 12)) str += unit;
  const n = wlen(str);
  const f = (((dist / n) % 1) + 1) % 1;
  g.save();
  g.beginPath();
  g.rect(box.x, box.y, box.w, box.h);
  g.clip();
  g.font = font(s, px, o.weight);
  g.fillStyle = o.color ?? s.fg;
  if (!o.vertical) {
    const w = g.measureText(str).width;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const cy = box.y + box.h / 2;
    for (let k = 0; k < 2 + Math.ceil(box.w / Math.max(w, 1)); k++)
      g.fillText(str, box.x - f * w + k * w, cy);
  } else {
    // 直排：一個字一個字由上往下疊（字高＝px）
    const chars = cs(str);
    const h = chars.length * px;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const cx = box.x + box.w / 2;
    for (let k = 0; k < 2 + Math.ceil(box.h / Math.max(h, 1)); k++)
      chars.forEach((ch, i) => g.fillText(ch, cx, box.y - f * h + k * h + (i + 0.5) * px));
  }
  g.restore();
}

// ---------- 換行與邊緣淡出 ----------

/**
 * 把一段字照 maxW（px）換行（用目前 g.font 量寬度）：中文逐字可以斷，英文在空白斷（太長的英文字才硬斷），
 * 原本的換行字元 \n 一律換行。句子型的特效用它，字太長就換行、不縮小。
 */
export function wrapLines(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    // 斷成「可以接在一起的小塊」：連續的拉丁字母數字標點一塊（含後面的空白），其他字（中日韓）一個字一塊
    const toks = para.match(/[^\s\u2e80-\uffff]+\s*|[\u2e80-\uffff]\s*|\s+/g) ?? [];
    let line = '';
    const flush = () => {
      if (line.trim()) out.push(line.replace(/\s+$/, ''));
      line = '';
    };
    for (const tok of toks) {
      if (g.measureText(line + tok).width <= maxW || !line) {
        line += tok;
        // 單一個小塊就比整行還寬（超長的英文字）：硬斷
        while (g.measureText(line.replace(/\s+$/, '')).width > maxW && cs(line).length > 1) {
          const chars = cs(line);
          let n = chars.length - 1;
          while (n > 1 && g.measureText(chars.slice(0, n).join('')).width > maxW) n--;
          out.push(chars.slice(0, n).join(''));
          line = chars.slice(n).join('');
        }
      } else {
        flush();
        line = tok.replace(/^\s+/, '');
      }
    }
    flush();
    if (!toks.length) out.push('');
  }
  return out.length ? out : [''];
}

/** 框的邊緣淡出：上下（v）或左右（h）各 12% 慢慢變透明（Spotify 歌詞框那種），畫完整個舞台之後呼叫 */
export function fadeEdges(g: CanvasRenderingContext2D, W: number, H: number, fade: KineticFade) {
  if (fade === 'none') return;
  const v = fade === 'v';
  const len = (v ? H : W) * 0.12;
  g.save();
  g.globalCompositeOperation = 'destination-out';
  for (const end of [0, 1]) {
    const a = end === 0 ? 0 : (v ? H : W) - len;
    const gr = v ? g.createLinearGradient(0, a, 0, a + len) : g.createLinearGradient(a, 0, a + len, 0);
    gr.addColorStop(0, end === 0 ? 'rgba(0,0,0,1)' : 'rgba(0,0,0,0)');
    gr.addColorStop(1, end === 0 ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)');
    g.fillStyle = gr;
    if (v) g.fillRect(0, a, W, len);
    else g.fillRect(a, 0, len, H);
  }
  g.restore();
}
