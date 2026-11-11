import type { TextCard, TextItem } from '../model/types';

// Phase 2 的最小文字繪製：多段/多行、系統字體、陰影。Phase 3 會換成完整字卡排版（見 docs/TEXT_CARDS.md）。
export type TextRender = { canvas: HTMLCanvasElement; w: number; h: number; key: string };

const cache = new Map<string, TextRender>();
const MAX_CACHE = 60;
const FONT_STACK = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif';

function fontOf(weight: string, px: number) {
  return `${weight === 'bold' ? '700' : '400'} ${px}px ${FONT_STACK}`;
}

/** scale：畫布寬度 / 1080。字級以 1080 寬為基準，所以預覽（較小）與輸出（1080）看起來一樣。 */
export function renderText(card: TextCard, scale: number): TextRender {
  const key = `${scale.toFixed(4)}|${JSON.stringify(card)}`;
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
    lh: number;
    spacing: number;
    w: number;
  };
  const lines: Line[] = [];
  for (const run of card.runs) {
    const size = run.size * scale;
    probe.font = fontOf(run.weight, size);
    for (const t of run.text.split('\n')) {
      probe.letterSpacing = `${run.letterSpacing * size}px`;
      lines.push({
        text: t,
        size,
        color: run.color,
        weight: run.weight,
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
    ctx.font = fontOf(l.weight, l.size);
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

export function measureTextItem(item: TextItem, canvasW: number): { w: number; h: number } {
  const r = renderText(item.card, canvasW / 1080);
  return { w: r.w, h: r.h };
}
