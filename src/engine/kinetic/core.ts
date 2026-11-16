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
  /** 原版的 var(--bg)：這一式配色的「紙色」（舞台底色透明、或使用者換了底色時，方牌上的字、反白帶子上的字還是用它，跟原版一樣） */
  paper: string;
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
  /** 一輪多少秒（words＝字卡拆出來的詞）；連續跑的（跑馬燈）回傳 null */
  len: (words: string[]) => number | null;
  /** 原版的固定標籤（標題輪替的「速報」）、預設數字（跳錶）：字卡文字裡沒有時用它 */
  label?: string;
  num?: string;
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

/** 原版 fitN()：字大小（px）＝ min(max cqmin, w÷n cqw)；n 是「有幾個字寬」 */
export const fitN = (s: Stage, n: number, max: number, w: number) =>
  Math.min(max * s.cqmin, (w / Math.max(n, 1)) * s.cqw);

/** 把字卡的文字拆成詞：空白、逗號、頓號、換行分開，最多 8 個詞、每個詞最多 14 個字（跟原版一樣） */
export function splitWords(text: string): string[] {
  return text
    .split(/[\s,，、]+/)
    .map((w) => cs(w).slice(0, 14).join(''))
    .filter(Boolean)
    .slice(0, 8);
}

// ---------- 畫字 ----------
export const fontOf = (s: Stage, px: number, weight = 900) => `${weight} ${Math.max(px, 1)}px ${s.family}`;

/** 在 (x, y) 置中畫一個詞（y＝這一行的垂直中心）；scaleX／scaleY／rotate（度）以詞的中心為基準 */
export function drawWord(
  s: Stage,
  word: string,
  x: number,
  y: number,
  px: number,
  o: {
    color?: string;
    alpha?: number;
    sx?: number;
    sy?: number;
    rot?: number;
    /** 水平歪斜（度，CSS skewX） */
    skew?: number;
    weight?: number;
    /** 變形的基準點在字框（行高 1.1）上緣往下幾成處（預設 0.5＝中心；原版 transform-origin） */
    originY?: number;
    /** 只畫字框的這一段高度（上緣往下的百分比，例 [0, 50]＝上半；原版 clip-path inset，在變形之前裁） */
    clip?: [number, number];
    /** 空心字：描邊寬度（px），不填色（原版 -webkit-text-stroke） */
    stroke?: number;
    /** 發光：一串模糊半徑（px，原版 drop-shadow 的半徑），每個半徑疊一層同色的光暈 */
    glow?: number[];
  } = {},
) {
  const { g } = s;
  const oy = ((o.originY ?? 0.5) - 0.5) * px * 1.1;
  g.save();
  g.globalAlpha *= o.alpha ?? 1;
  g.translate(x, y + oy);
  if (o.rot) g.rotate((o.rot * Math.PI) / 180);
  if (o.skew) g.transform(1, 0, Math.tan((o.skew * Math.PI) / 180), 1, 0, 0);
  g.scale(o.sx ?? 1, o.sy ?? 1);
  if (o.clip) {
    const bh = px * 1.1;
    const top = -oy - bh / 2;
    g.beginPath();
    g.rect(-s.W * 3, top + (o.clip[0] / 100) * bh, s.W * 6, ((o.clip[1] - o.clip[0]) / 100) * bh);
    g.clip();
  }
  paintText(s, word, -oy, px, o.color ?? s.fg, o.weight, o.stroke, o.glow);
  g.restore();
}

/** 在目前座標的 (0, y) 置中畫一段字：填色，或空心描邊（可疊發光）；共用給 drawWord、drawChars */
function paintText(
  s: Stage,
  str: string,
  y: number,
  px: number,
  color: string,
  weight?: number,
  stroke?: number,
  glow?: number[],
) {
  const { g } = s;
  g.font = fontOf(s, px, weight);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (stroke) {
    g.strokeStyle = color;
    g.lineWidth = stroke;
    g.lineJoin = 'round';
    for (const r of glow ?? [0]) {
      g.shadowColor = r ? color : 'transparent';
      g.shadowBlur = r; // CSS drop-shadow 的模糊半徑與 canvas shadowBlur 一樣（高斯標準差都是它的一半）
      g.strokeText(str, 0, y);
    }
    g.shadowColor = 'transparent';
    g.shadowBlur = 0;
    return;
  }
  g.fillStyle = color;
  g.fillText(str, 0, y);
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
  g.font = fontOf(s, px, o.weight);
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

// ---------- 更多共用工具（K1） ----------

/** 原版 keys()：依關鍵格 [時間, 值, 緩動?] 內插；緩動套在「到這一格」的那一段 */
export type KeyPt = [number, number, ((p: number) => number)?];
export function keys(t: number, pts: KeyPt[]): number {
  if (t <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i]![0]) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const p = (t - a[0]) / (b[0] - a[0]);
      return lerp(a[1], b[1], b[2] ? b[2](p) : p);
    }
  }
  return pts[pts.length - 1]![1];
}

const lumaOf = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1]!, 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};
/** 放在某個顏色上的字用深色還是白色（原版的 var(--bg)、--hifg 那種對比色） */
export const inkOn = (hex: string) => (lumaOf(hex) > 0.55 ? '#14161b' : '#ffffff');
export const lightness = lumaOf;

/** 一個字一個字畫（每個字各自變形；原版 .chars span）：字置中排成一行，字的變形以「字框的 (50%, oyk)」為基準（預設 88%，字的底部附近） */
export type CharFx = {
  sx?: number;
  sy?: number;
  rot?: number;
  dx?: number;
  dy?: number;
  alpha?: number;
  color?: string;
  skew?: number;
  /** 空心字描邊寬度（px）／發光半徑（px，可多層），同 drawWord */
  stroke?: number;
  glow?: number[];
};
export function drawChars(
  s: Stage,
  str: string,
  cx: number,
  cy: number,
  px: number,
  f: (i: number, ch: string, n: number) => CharFx,
  o: { originY?: number; weight?: number } = {},
) {
  const { g } = s;
  const chars = cs(str);
  g.save();
  g.font = fontOf(s, px, o.weight);
  const ws = chars.map((c) => g.measureText(c).width);
  const total = ws.reduce((a, b) => a + b, 0);
  // 字框高＝行高 1.1；原點在字框上緣往下 originY（0～1）處，換算成離字框中心的距離
  const oy = ((o.originY ?? 0.88) - 0.5) * px * 1.1;
  let x = cx - total / 2;
  chars.forEach((ch, i) => {
    const c = f(i, ch, chars.length);
    const mx = x + ws[i]! / 2 + (c.dx ?? 0);
    const my = cy + (c.dy ?? 0);
    g.save();
    g.globalAlpha *= c.alpha ?? 1;
    g.translate(mx, my + oy);
    if (c.rot) g.rotate((c.rot * Math.PI) / 180);
    if (c.skew) g.transform(1, 0, Math.tan((c.skew * Math.PI) / 180), 1, 0, 0);
    g.scale(c.sx ?? 1, c.sy ?? 1);
    paintText(s, ch, -oy, px, c.color ?? s.fg, o.weight, c.stroke, c.glow);
    g.restore();
    x += ws[i]!;
  });
  g.restore();
}

/**
 * 一條帶子（原版的 .sband／.tape／.r-s 那種：一個有底色的長方形，裡面一條跑馬燈）：
 * 中心在 (cx, cy)、寬 w、高 h，轉 rot 度。bg 沒給＝沒有底色（只有字）。
 */
export function band(
  s: Stage,
  o: {
    cx: number;
    cy: number;
    w: number;
    h: number;
    rot?: number;
    bg?: string;
    color: string;
    unit: string;
    dist: number;
    px: number;
    min: number;
    weight?: number;
  },
) {
  const { g } = s;
  g.save();
  g.translate(o.cx, o.cy);
  if (o.rot) g.rotate((o.rot * Math.PI) / 180);
  if (o.bg) {
    g.fillStyle = o.bg;
    g.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
  }
  marquee(
    s,
    o.unit,
    o.dist,
    o.px,
    { x: -o.w / 2, y: -o.h / 2, w: o.w, h: o.h },
    { min: o.min, color: o.color, weight: o.weight },
  );
  g.restore();
}

// ---------- 更多共用工具（K2） ----------

let scratchCv: HTMLCanvasElement | null = null;
/** 共用的暫存畫布（清乾淨、大小 w×h）：一個一個用，用完立刻畫回主畫布；不可以同時拿兩張 */
export function scratch(w: number, h: number): HTMLCanvasElement {
  scratchCv ??= document.createElement('canvas');
  if (scratchCv.width !== w || scratchCv.height !== h) {
    scratchCv.width = w;
    scratchCv.height = h;
  }
  // 上一個人用完的畫法狀態（合成方式、透明度、變形、陰影）全部還原，再清乾淨
  const c = scratchCv.getContext('2d')!;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.shadowBlur = 0;
  c.shadowColor = 'transparent';
  c.clearRect(0, 0, w, h);
  return scratchCv;
}

const canFilter = () =>
  typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

/** 模糊（原版 filter: blur）：支援 ctx.filter 就直接用；不支援（舊版 Safari）就把同一張圖疊好幾次、各偏一點、降低透明度，看起來也是糊的 */
export function blurred(g: CanvasRenderingContext2D, blur: number, draw: () => void) {
  if (blur < 0.3) return draw();
  if (canFilter()) {
    g.save();
    g.filter = `blur(${blur.toFixed(2)}px)`;
    draw();
    g.restore();
    return;
  }
  const n = 12;
  g.save();
  const a = g.globalAlpha;
  g.globalAlpha = a / 4;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    g.save();
    g.translate(Math.cos(ang) * blur * 0.8, Math.sin(ang) * blur * 0.8);
    draw();
    g.restore();
  }
  g.restore();
}

/**
 * 把一張圖繞垂直軸轉 deg 度（原版 perspective(P) rotateY）：切成細條，每條依距離放大縮小，做出透視。
 * src 以 (cx, cy) 為中心畫出來，大小 w×h。
 */
export function drawRotY(
  g: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  cx: number,
  cy: number,
  w: number,
  h: number,
  deg: number,
  persp: number,
) {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  if (Math.abs(cos) < 0.02) return;
  const N = 20;
  for (let i = 0; i < N; i++) {
    const x0 = -w / 2 + (w * i) / N;
    const x1 = -w / 2 + (w * (i + 1)) / N;
    const proj = (x: number) => {
      const z = x * sin; // 轉過去之後離鏡頭的距離（朝鏡頭為正）
      const k = persp / (persp - z);
      return { x: x * cos * k, k };
    };
    const p0 = proj(x0);
    const p1 = proj(x1);
    const kk = (p0.k + p1.k) / 2;
    const dw = Math.abs(p1.x - p0.x);
    g.drawImage(
      src,
      (src.width * i) / N,
      0,
      src.width / N,
      src.height,
      cx + Math.min(p0.x, p1.x),
      cy - (h * kk) / 2,
      dw + 0.6,
      h * kk,
    );
  }
}
