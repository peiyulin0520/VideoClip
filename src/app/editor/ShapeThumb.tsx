import { useEffect, useRef } from 'react';
import { drawOps, opsBounds } from '../../engine/decorations';
import { shapeDef, shapePath } from '../../engine/shapes';
import { SHAPE_LINE } from '../../model/defaults';
import type { BoxShape } from '../../model/types';

/** 圖形縮圖：用同一個路徑函式實際畫出來（不是靜態圖片），並依範圍縮放置中 */
export function ShapeThumb({ shape, color = SHAPE_LINE }: { shape: BoxShape; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const def = shapeDef(shape);
    const cmds = shapePath(shape, 100, def.inset[0] > 1.8 ? 100 : 56, { radius: 12 });
    const ops = [{ type: 'stroke' as const, cmds, width: 3 }]; // 線框縮圖（字塊預設是透明底＋細框線）
    const b = opsBounds(ops)!;
    const pad = 6;
    const k = Math.min((cv.width - pad * 2) / (b.r - b.l), (cv.height - pad * 2) / (b.b - b.t));
    ctx.save();
    ctx.translate(cv.width / 2 - ((b.l + b.r) / 2) * k, cv.height / 2 - ((b.t + b.b) / 2) * k);
    ctx.scale(k, k);
    drawOps(ctx, ops, color);
    ctx.restore();
  }, [shape, color]);
  return <canvas ref={ref} width={120} height={72} className="shape-thumb" aria-hidden="true" />;
}
