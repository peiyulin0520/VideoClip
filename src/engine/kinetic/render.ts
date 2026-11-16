// 動態字卡：把字卡（item.kinetic）在 t 秒（字卡自己的時間）畫成一張 W×H 的舞台圖。
import { cssFamily, requestFont } from '../../fonts/fontStore';
import type { TextItem } from '../../model/types';
import { canvasFamily } from '../textRender';
import { splitWords, type KineticDef, type Stage } from './core';
import { kineticContent } from './hit';
import { kineticById, SCHEMES } from './index';

export type KineticRender = {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  /** 內容有變就不一樣（compositor 用它判斷要不要重傳貼圖）；舞台圖固定在同一張畫布上重畫 */
  key: string;
  /** 點選、選取框用的範圍（舞台的像素，相對畫布左上角） */
  content: { x: number; y: number; w: number; h: number };
};

const STEP = 60; // 每秒 60 步：同一步畫面一樣

const canvases = new Map<string, HTMLCanvasElement>();
const MAX_CANVASES = 8;

/** 字卡裡的詞：照字卡文字拆；還沒輸入（或拆不出詞）就用那一式的範例字 */
export function kineticWords(item: TextItem, example: string[]): string[] {
  if (item.placeholder) return example;
  const text = item.card.runs.map((r) => r.text).join(' ');
  const w = splitWords(text);
  return w.length ? w : example;
}

const luma = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1]!, 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

/** t＝字卡自己的時間（開始後幾秒）。回傳 null＝這個 id 還沒改寫好（不畫） */
export function renderKinetic(item: TextItem, t: number, W: number, H: number): KineticRender | null {
  const k = item.kinetic;
  const def = k ? kineticById(k.id) : undefined;
  if (!k || !def) return null;
  const run = item.card.runs[0];
  const fontId = run?.fontId ?? '';
  requestFont(fontId);
  const tt = Math.max(t, 0) * (k.speed ?? 1);
  const step = Math.floor(tt * STEP + 1e-6);
  const sch = SCHEMES[def.scheme];
  const words = kineticWords(item, def.words);
  const fg = run?.color ?? sch.fg;
  const hi = k.accent ?? sch.hi;
  const hifg = k.accent ? (luma(k.accent) > 0.55 ? '#14161b' : '#ffffff') : sch.hifg;
  const bg = k.bg ? SCHEMES[k.bg].bg : null;
  const key = [item.id, k.id, step, W, H, words.join('|'), fg, hi, bg ?? '', cssFamily(fontId) ? 1 : 0].join(
    '~',
  );

  const ck = `${item.id}|${W}x${H}`;
  let canvas = canvases.get(ck);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvases.set(ck, canvas);
    if (canvases.size > MAX_CANVASES) canvases.delete(canvases.keys().next().value!);
  }
  paintKinetic(canvas, def, { words, fg, hi, hifg, bg, family: canvasFamily(fontId) }, step / STEP);
  return { canvas, w: W, h: H, key, content: kineticContent(item, W, H) };
}

/** 把某一式在 t 秒畫到 canvas 上（整張清掉重畫）。卡片縮圖、字卡舞台共用 */
export function paintKinetic(
  canvas: HTMLCanvasElement,
  def: KineticDef,
  p: Pick<Stage, 'words' | 'fg' | 'hi' | 'hifg' | 'bg' | 'family'>,
  t: number,
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
  g.save();
  def.draw({ g, W, H, cqmin: Math.min(W, H) / 100, cqw: W / 100, cqh: H / 100, ...p }, t);
  g.restore();
}
