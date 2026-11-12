import { cssFamily, FALLBACK_STACK, requestFont } from '../fonts/fontStore';
import type { TextCard, TextItem, TextRun } from '../model/types';
import type { Op } from './decorations';
import { shapePath } from './shapes';
import { decorationOps, drawOps, opsExtent } from './decorations';
import { layoutCard, type GlyphBox, type GlyphMetric, type Measurer } from './cardLayout';

// 字卡繪製：排版交給 cardLayout（逐字、墨跡邊界），這裡負責畫字塊、描邊、陰影、文字。見 docs/TEXT_CARDS.md。
export type TextRender = {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  key: string;
  /** 看得到的內容範圍（字塊、文字含描邊、裝飾的聯集），相對畫布左上角。選取框、點選範圍用這個，不用含透明邊的整張畫布 */
  content: { x: number; y: number; w: number; h: number };
};

const cache = new Map<string, TextRender>();
const MAX_CACHE = 60;

/** 這個字體在畫布上用的字型描述：已載入就用它，備用字體排在後面（缺字時補上） */
function fontOf(weight: string, px: number, fontId: string) {
  const fam = cssFamily(fontId);
  return `${weight === 'bold' ? '700' : '400'} ${px}px ${fam ? `"${fam}", ` : ''}${FALLBACK_STACK}`;
}

const measureCache = new Map<string, GlyphMetric>();

/** 用 canvas 量一個字：墨跡邊界（actualBoundingBox*）＋ 前進寬度 */
const canvasMeasurer = (() => {
  let ctx: CanvasRenderingContext2D | null = null;
  const measurer: Measurer = (ch, run, px) => {
    const font = fontOf(run.weight, px, run.fontId);
    const key = `${font}|${ch}`;
    const hit = measureCache.get(key);
    if (hit) return hit;
    ctx ??= document.createElement('canvas').getContext('2d')!;
    ctx.font = font;
    const m = ctx.measureText(ch);
    const out: GlyphMetric = {
      adv: m.width,
      asc: m.actualBoundingBoxAscent,
      desc: m.actualBoundingBoxDescent,
      left: m.actualBoundingBoxLeft,
      right: m.actualBoundingBoxRight,
    };
    if (measureCache.size > 4000) measureCache.clear();
    measureCache.set(key, out);
    return out;
  };
  return measurer;
})();

const ITALIC_TAN = Math.tan((12 * Math.PI) / 180);

/** scale：畫布短邊 / 1080（uiScale）。字級以 1080 為基準，所以預覽（較小）與輸出（1080）看起來一樣。 */
export function renderText(card: TextCard, scale: number): TextRender {
  // 字體還沒載入完成時畫的是備用字體，所以「各字體載入了沒」也要算進快取鍵，載入後才會重畫
  for (const run of card.runs) requestFont(run.fontId);
  const loaded = card.runs.map((r) => (cssFamily(r.fontId) ? 1 : 0)).join('');
  const key = `${scale.toFixed(4)}|${loaded}|${JSON.stringify(card)}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const lay = layoutCard(card, scale, canvasMeasurer);
  // 描邊、陰影會畫到字塊外面，畫布四周多留一圈
  let reach = 4;
  for (const r of card.runs) {
    for (const s of r.strokes ?? []) reach = Math.max(reach, s.width);
    if (r.shadow)
      reach = Math.max(reach, r.shadow.blur + Math.max(Math.abs(r.shadow.x), Math.abs(r.shadow.y)));
  }
  // 裝飾（尾端圈圈等）會畫到字塊外面：以墨跡矩形算出每個裝飾的範圍，畫布四周留夠
  const boxPath = card.box
    ? shapePath(card.box.shape, lay.w, lay.h, {
        radius: (card.box.radius ?? 28) * scale,
        tail: card.box.tailDir,
        adj: card.box.adj,
      })
    : [];
  // 填滿與框線分開：各自的顏色、透明度（框線沒有自己的透明度＝跟填滿一樣，舊專案長相不變）
  const boxStroke = (card.box?.stroke?.width ?? 0) * scale;
  const fillOps: Op[] =
    card.box && card.box.fillOn !== false ? [{ type: 'fill', alpha: card.box.opacity, cmds: boxPath }] : [];
  const strokeOps: Op[] =
    card.box?.stroke && boxStroke > 0
      ? [
          {
            type: 'stroke',
            alpha: card.box.stroke.opacity ?? card.box.opacity,
            cmds: boxPath,
            width: boxStroke,
          },
        ]
      : [];
  const boxOps: Op[] = [...fillOps, ...strokeOps];
  const decoOps = (card.decorations ?? []).map((d) => ({ d, ops: decorationOps(d, lay.ink) }));
  let decoReach = 0;
  for (const { ops } of [...decoOps, { ops: boxOps }]) {
    const bb = opsExtent(ops);
    if (!bb) continue;
    decoReach = Math.max(decoReach, -bb.l, -bb.t, bb.r - lay.w, bb.b - lay.h);
  }
  const bleed = Math.ceil(Math.max(reach * scale, decoReach + 2));
  const w = Math.ceil(lay.w + bleed * 2);
  const h = Math.ceil(lay.h + bleed * 2);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const ox = bleed + (w - bleed * 2 - lay.w) / 2;
  const oy = bleed + (h - bleed * 2 - lay.h) / 2;

  if (card.box) {
    ctx.save();
    ctx.translate(ox, oy);
    drawOps(ctx, fillOps, card.box.fill);
    if (card.box.stroke) drawOps(ctx, strokeOps, card.box.stroke.color);
    ctx.restore();
  }

  // 裝飾畫在字後面（底線、螢光筆、圈圈都在字外面或字底下）
  for (const { d, ops } of decoOps) {
    ctx.save();
    ctx.translate(ox, oy);
    drawOps(ctx, ops, d.color);
    ctx.restore();
  }

  const drawGlyphLayer = (ctx: CanvasRenderingContext2D) => {
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    const withSkew = (run: TextRun, y: number, draw: () => void) => {
      if (!run.italic) return draw();
      ctx.save();
      ctx.transform(1, 0, -ITALIC_TAN, 1, ITALIC_TAN * y, 0);
      draw();
      ctx.restore();
    };
    const runOf = (g: GlyphBox) => card.runs[g.run]!;
    const setFont = (run: TextRun) => {
      ctx.font = fontOf(run.weight, run.size * scale, run.fontId);
    };
    const glyphs = lay.glyphs.filter((g) => g.ch.trim() !== '');
    const strokesOf = (g: GlyphBox) =>
      (runOf(g).strokes ?? []).filter((s) => s.width > 0).sort((a, b) => b.width - a.width);
    const maxStrokes = Math.max(0, ...glyphs.map((g) => strokesOf(g).length));
    // 陰影只畫一次：有描邊就跟著最外層，沒有就跟著填色
    const shadowFor = (g: GlyphBox, layer: 'outer' | 'fill') => {
      const sh = runOf(g).shadow;
      const hasStroke = strokesOf(g).length > 0;
      if (!sh || (layer === 'outer') !== hasStroke) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        return;
      }
      ctx.shadowColor = sh.color;
      ctx.shadowBlur = sh.blur * scale;
      ctx.shadowOffsetX = sh.x * scale;
      ctx.shadowOffsetY = sh.y * scale;
    };
    for (let p = 0; p < maxStrokes; p++) {
      for (const g of glyphs) {
        const st = strokesOf(g)[p];
        if (!st) continue;
        const run = runOf(g);
        setFont(run);
        shadowFor(g, p === 0 ? 'outer' : 'fill'); // p>0 時 layer='fill' 且有描邊 → 會關掉陰影
        ctx.strokeStyle = st.color;
        ctx.lineWidth = st.width * 2 * scale;
        withSkew(run, oy + g.y, () => ctx.strokeText(g.ch, ox + g.x, oy + g.y));
      }
    }
    for (const g of glyphs) {
      const run = runOf(g);
      setFont(run);
      shadowFor(g, 'fill');
      ctx.fillStyle = run.color;
      withSkew(run, oy + g.y, () => ctx.fillText(g.ch, ox + g.x, oy + g.y));
    }
  };
  // 文字透明度：描邊、陰影、填色先畫在另一張畫布上，再整張乘透明度（不然描邊會從半透明的字裡透出來）
  const textOp = Math.min(Math.max(card.runs[0]?.opacity ?? 1, 0), 1);
  if (textOp >= 1) drawGlyphLayer(ctx);
  else {
    const layer = document.createElement('canvas');
    layer.width = w;
    layer.height = h;
    drawGlyphLayer(layer.getContext('2d')!);
    ctx.save();
    ctx.globalAlpha = textOp;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }

  // 看得到的內容範圍：文字墨跡（含描邊）∪ 字塊（含外框、尾巴）∪ 裝飾
  const strokeW = Math.max(0, ...card.runs.flatMap((r) => (r.strokes ?? []).map((s) => s.width))) * scale;
  let cl = ox + lay.ink.x - strokeW;
  let ct = oy + lay.ink.y - strokeW;
  let cr = ox + lay.ink.x + lay.ink.w + strokeW;
  let cb = oy + lay.ink.y + lay.ink.h + strokeW;
  const addBounds = (ops: Op[]) => {
    const bb = opsExtent(ops);
    if (!bb) return;
    cl = Math.min(cl, ox + bb.l);
    ct = Math.min(ct, oy + bb.t);
    cr = Math.max(cr, ox + bb.r);
    cb = Math.max(cb, oy + bb.b);
  };
  addBounds(boxOps.map((o) => ({ ...o, width: boxStroke })));
  for (const { ops } of decoOps) addBounds(ops);
  const content = {
    x: Math.max(cl, 0),
    y: Math.max(ct, 0),
    w: Math.min(cr, w) - Math.max(cl, 0),
    h: Math.min(cb, h) - Math.max(ct, 0),
  };
  const out = { canvas, w, h, key, content };
  cache.set(key, out);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
  return out;
}

/** 字級/外框的縮放：以畫面「短邊 ÷ 1080」為準（橫式畫面的字不會被放大） */
export function uiScale(canvasW: number, canvasH: number): number {
  return Math.min(canvasW, canvasH) / 1080;
}

export function measureTextItem(
  item: TextItem,
  canvasW: number,
  canvasH: number,
): { w: number; h: number; content: TextRender['content'] } {
  const r = renderText(item.card, uiScale(canvasW, canvasH));
  return { w: r.w, h: r.h, content: r.content };
}
