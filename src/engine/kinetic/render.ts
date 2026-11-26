// 動態字卡：把字卡（item.kinetic）在 t 秒（字卡自己的時間）畫成一張「框」大小的圖。框外面不畫（看不到）。
import { cssFamily, requestFont } from '../../fonts/fontStore';
import type { TextItem } from '../../model/types';
import { canvasFamily } from '../textRender';
import { drawWord, fadeEdges, fit, inkOn, seg, splitWords, wlen, type KineticDef, type Stage } from './core';
import { kineticContent, kineticFrame } from './hit';
import { holdTime } from './hold';
import { kineticById, resolveBg, schemeOf } from './index';

export type KineticRender = {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  /** 內容有變就不一樣（compositor 用它判斷要不要重傳貼圖）；框圖固定在同一張畫布上重畫 */
  key: string;
  /** 點選、選取框用的範圍（像素，相對畫布左上角） */
  content: { x: number; y: number; w: number; h: number };
};

/** 每秒幾步：同一步畫面一樣（不重畫、不上傳）。拖時間軸、暫停、匯出用 60；預覽播放用 30（畫面更新最多每秒 30 次，播放時負擔減半） */
let STEP = 60;
export function setKineticPlaying(on: boolean) {
  STEP = on ? 30 : 60;
}

const canvases = new Map<string, HTMLCanvasElement>();
const MAX_CANVASES = 8;

/** 字卡裡的詞：照字卡文字拆；還沒輸入（或拆不出詞）就用那一式的範例字 */
export function kineticWords(item: TextItem, example: string[]): string[] {
  if (item.placeholder) return example;
  const text = item.card.runs.map((r) => r.text).join(' ');
  const w = splitWords(text);
  return w.length ? w : example;
}

/** 字卡文字按 Enter 分成的行（每行去掉空白、逗號、頓號；空行不算）；還沒輸入＝沒有 */
export function textLines(item: TextItem): string[] {
  if (item.placeholder) return [];
  const text = item.card.runs.map((r) => r.text).join('');
  return text
    .split('\n')
    .map((l) => l.replace(/[\s,，、]+/g, ''))
    .filter(Boolean);
}

/** t＝字卡自己的時間（開始後幾秒）；W、H＝合成畫布（畫面）大小。回傳 null＝這個 id 還沒改寫好（不畫） */
export function renderKinetic(item: TextItem, t: number, W: number, H: number): KineticRender | null {
  const k = item.kinetic;
  const def = k ? kineticById(k.id) : undefined;
  if (!k || !def) return null;
  const run = item.card.runs[0];
  const fontId = run?.fontId ?? '';
  requestFont(fontId);
  const sch = schemeOf(def);
  const words = kineticWords(item, def.words);
  let tt = Math.max(t, 0) * (k.speed ?? 1);
  // 播到字完整呈現就停在那一格（字卡比一輪長、而且選了「停在最後畫面」；一直在跑的那幾式跑到代表畫面就停）
  if (k.end === 'hold') {
    tt = Math.min(tt, holdTime(def, words));
  }
  const step = Math.floor(tt * STEP + 1e-6);
  // 快到停點：一直在動的式子慢慢靜下來（停點前 0.5 秒起）
  const settle =
    k.end === 'hold' ? seg(tt, holdTime(def, words) - (def.settleLen ?? 0.5), holdTime(def, words)) : 0;
  const sub = k.sub?.trim() || undefined;
  const lines = textLines(item);
  const wrap = k.wrap;
  const fg = run?.color ?? sch.fg;
  const hi = k.accent ?? sch.hi;
  const hifg = k.accent ? inkOn(k.accent) : sch.hifg;
  const bg = resolveBg(k.bg);
  const fade = k.fade ?? def.fade ?? 'none';
  const fadeW = k.fadeW ?? DEFAULT_FADE_W;
  const fr = kineticFrame(item, W, H);
  const key = [
    item.id,
    k.id,
    step,
    fr.w,
    fr.h,
    words.join('|'),
    lines.join('/'),
    wrap ?? '',
    sub ?? '',
    fg,
    hi,
    bg ?? '',
    fade,
    fadeW,
    cssFamily(fontId) ? 1 : 0,
  ].join('~');

  const ck = `${item.id}|${fr.w}x${fr.h}`;
  let canvas = canvases.get(ck);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = fr.w;
    canvas.height = fr.h;
    canvases.set(ck, canvas);
    if (canvases.size > MAX_CANVASES) canvases.delete(canvases.keys().next().value!);
  }
  paintKinetic(
    canvas,
    def,
    { words, sub, fg, paper: sch.bg, hi, hifg, bg, family: canvasFamily(fontId), settle, lines, wrap },
    step / STEP,
    fade,
    fadeW,
  );
  return { canvas, w: fr.w, h: fr.h, key, content: kineticContent(item, W, H) };
}

/** 邊緣淡出寬度的預設值（佔框的比例） */
export const DEFAULT_FADE_W = 0.25;

const scratches = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
/** 畫流動內容用的暫存畫布（跟 canvas 一樣大，每張主畫布一張） */
function scratchOf(canvas: HTMLCanvasElement): HTMLCanvasElement {
  let sc = scratches.get(canvas);
  if (!sc) {
    sc = document.createElement('canvas');
    scratches.set(canvas, sc);
  }
  if (sc.width !== canvas.width || sc.height !== canvas.height) {
    sc.width = canvas.width;
    sc.height = canvas.height;
  }
  return sc;
}

/** 停下來時整句完整的字：每個詞一行、置中、一樣大（字太多就縮小） */
function drawRest(s: Stage, alpha: number) {
  const rows = s.words.slice(0, 8);
  const widest = rows.reduce((a, w) => (wlen(w) > wlen(a) ? w : a), rows[0] ?? '');
  const px = Math.min(fit(s, widest, 34, 84), ((78 / rows.length) * s.cqh) / 1.25);
  rows.forEach((w, i) =>
    drawWord(s, w, s.W / 2, s.H / 2 + (i - (rows.length - 1) / 2) * px * 1.25, px, { alpha }),
  );
}

/** 把某一式在 t 秒畫到 canvas 上（整張清掉重畫；單位＝這張畫布的大小）。卡片縮圖、字卡的框共用 */
export function paintKinetic(
  canvas: HTMLCanvasElement,
  def: KineticDef,
  p: Pick<Stage, 'words' | 'fg' | 'paper' | 'hi' | 'hifg' | 'bg' | 'family'> & {
    sub?: string;
    settle?: number;
    lines?: string[];
    wrap?: 'auto';
  },
  t: number,
  fade: 'none' | 'v' | 'h' = 'none',
  fadeW = 0.12,
) {
  const W = canvas.width;
  const H = canvas.height;
  const g = canvas.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.globalAlpha = 1;
  if (p.bg) {
    g.fillStyle = p.bg;
    g.fillRect(0, 0, W, H);
  }
  const stage = (c: CanvasRenderingContext2D): Stage => ({
    g: c,
    W,
    H,
    cqmin: Math.min(W, H) / 100,
    cqw: W / 100,
    cqh: H / 100,
    ...p,
  });
  const rest = p.settle ?? 0;
  if (rest > 0 && def.calm !== false && def.len(p.words) === null) {
    // 一直流動的式子停在最後畫面：流動的內容淡掉、整句完整的字淡入（靜止）
    const sc = scratchOf(canvas);
    const sg = sc.getContext('2d')!;
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.clearRect(0, 0, W, H);
    sg.globalAlpha = 1;
    sg.save();
    def.draw(stage(sg), t);
    sg.restore();
    g.save();
    g.globalAlpha = 1 - rest;
    g.drawImage(sc, 0, 0);
    g.globalAlpha = 1;
    g.restore();
    g.save();
    drawRest(stage(g), rest);
    g.restore();
  } else {
    g.save();
    def.draw(stage(g), t);
    g.restore();
  }
  fadeEdges(g, W, H, fade, fadeW);
}
