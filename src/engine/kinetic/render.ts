// 動態字卡：把字卡（item.kinetic）在 t 秒（字卡自己的時間）畫成一張「框」大小的圖。框外面不畫（看不到）。
import { cssFamily, requestFont } from '../../fonts/fontStore';
import type { TextItem } from '../../model/types';
import { canvasFamily } from '../textRender';
import { fadeEdges, inkOn, splitWords, type KineticDef, type Stage } from './core';
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
  const sub = k.sub?.trim() || undefined;
  const fg = run?.color ?? sch.fg;
  const hi = k.accent ?? sch.hi;
  const hifg = k.accent ? inkOn(k.accent) : sch.hifg;
  const bg = resolveBg(k.bg);
  const fade = k.fade ?? def.fade ?? 'none';
  const fr = kineticFrame(item, W, H);
  const key = [
    item.id,
    k.id,
    step,
    fr.w,
    fr.h,
    words.join('|'),
    sub ?? '',
    fg,
    hi,
    bg ?? '',
    fade,
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
    { words, sub, fg, paper: sch.bg, hi, hifg, bg, family: canvasFamily(fontId) },
    step / STEP,
    fade,
  );
  return { canvas, w: fr.w, h: fr.h, key, content: kineticContent(item, W, H) };
}

/** 把某一式在 t 秒畫到 canvas 上（整張清掉重畫；單位＝這張畫布的大小）。卡片縮圖、字卡的框共用 */
export function paintKinetic(
  canvas: HTMLCanvasElement,
  def: KineticDef,
  p: Pick<Stage, 'words' | 'fg' | 'paper' | 'hi' | 'hifg' | 'bg' | 'family'> & { sub?: string },
  t: number,
  fade: 'none' | 'v' | 'h' = 'none',
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
  fadeEdges(g, W, H, fade);
}
