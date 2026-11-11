import { cssFamily, FALLBACK_STACK, requestFont } from '../fonts/fontStore';
import type { TextCard, TextItem } from '../model/types';

// Phase 2 的最小文字繪製：多段/多行、系統字體、陰影。Phase 3 會換成完整字卡排版（見 docs/TEXT_CARDS.md）。
export type TextRender = { canvas: HTMLCanvasElement; w: number; h: number; key: string };

const cache = new Map<string, TextRender>();
const MAX_CACHE = 60;

/** 這個字體在畫布上用的字型描述：已載入就用它，備用字體排在後面（缺字時補上） */
function fontOf(weight: string, px: number, fontId: string) {
  const fam = cssFamily(fontId);
  return `${weight === 'bold' ? '700' : '400'} ${px}px ${fam ? `"${fam}", ` : ''}${FALLBACK_STACK}`;
}

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

  const probe = document.createElement('canvas').getContext('2d')!;
  type Line = {
    text: string;
    size: number;
    color: string;
    weight: string;
    fontId: string;
    lh: number;
    spacing: number;
    w: number;
  };
  const lines: Line[] = [];
  for (const run of card.runs) {
    const size = run.size * scale;
    probe.font = fontOf(run.weight, size, run.fontId);
    for (const t of run.text.split('\n')) {
      probe.letterSpacing = `${run.letterSpacing * size}px`;
      lines.push({
        text: t,
        size,
        color: run.color,
        weight: run.weight,
        fontId: run.fontId,
        lh: run.lineHeight * size,
        spacing: run.letterSpacing * size,
        w: probe.measureText(t).width,
      });
    }
  }
  const pad = Math.ceil(12 * scale);
  const textW = Math.max(...lines.map((l) => l.w), 1);
  const textH = lines.reduce((s, l) => s + l.lh, 0) || 1;
  const w = Math.ceil(textW + pad * 2);
  const h = Math.ceil(textH + pad * 2);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 6 * scale;
  ctx.shadowOffsetY = 2 * scale;
  let y = pad;
  for (const l of lines) {
    ctx.font = fontOf(l.weight, l.size, l.fontId);
    ctx.letterSpacing = `${l.spacing}px`;
    ctx.fillStyle = l.color;
    const x = card.align === 'left' ? pad : card.align === 'right' ? w - pad - l.w : (w - l.w) / 2;
    ctx.fillText(l.text, x, y + l.lh / 2);
    y += l.lh;
  }

  const out = { canvas, w, h, key };
  cache.set(key, out);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
  return out;
}

/** 字級/外框的縮放：以畫面「短邊 ÷ 1080」為準（橫式畫面的字不會被放大） */
export function uiScale(canvasW: number, canvasH: number): number {
  return Math.min(canvasW, canvasH) / 1080;
}

export function measureTextItem(item: TextItem, canvasW: number, canvasH: number): { w: number; h: number } {
  const r = renderText(item.card, uiScale(canvasW, canvasH));
  return { w: r.w, h: r.h };
}
