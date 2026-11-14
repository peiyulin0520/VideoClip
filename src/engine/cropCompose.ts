import type { Crop, CropStroke } from '../model/types';
import { isNoCrop } from './crop';

// 裁切：四個工具（一般裁切、自由裁切、筆刷、橡皮擦）互相獨立、可以一起用。
// 留下的範圍＝底（一般裁切的框 ∩ 自由裁切的多邊形；都沒用但有筆刷＝空的；什麼都沒用＝整張），
// 再照順序套筆畫：筆刷把刷到的加回來、橡皮擦把刷到的去掉，後畫的蓋過先畫的。座標一律是整張原始畫面的 0–1。

export type Pt = [number, number];

/** 這組編輯的底是不是「整張」「空的」或「某個形狀」 */
export function baseKind(
  crop: Crop,
  mask: Pt[] | null,
  strokes: CropStroke[],
  hasBase = false,
): 'full' | 'empty' | 'shape' {
  if (hasBase || !isNoCrop(crop) || (mask && mask.length >= 3)) return 'shape';
  return strokes.some((s) => s.mode === 'keep') ? 'empty' : 'full';
}

/** 畫一筆（長線＋圓頭）到 ctx（mode 決定是加回來還是去掉）；w、h 是 canvas 的像素大小 */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  st: CropStroke,
  w: number,
  h: number,
  paint: string | CanvasPattern = '#fff',
) {
  const r = (st.w * w) / 2;
  ctx.save();
  ctx.globalCompositeOperation = st.mode === 'keep' ? 'source-over' : 'destination-out';
  ctx.fillStyle = paint;
  ctx.strokeStyle = paint;
  ctx.lineWidth = r * 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (st.pts.length === 1) {
    ctx.beginPath();
    ctx.arc(st.pts[0]![0] * w, st.pts[0]![1] * h, r, 0, Math.PI * 2);
    ctx.fill();
  } else if (st.pts.length > 1) {
    ctx.beginPath();
    st.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
    ctx.stroke();
  }
  ctx.restore();
}

/** 把一組編輯畫成「留下的範圍」（不透明＝留下）。base：舊版存的點陣圖遮罩，當成底 */
export function composeKeep(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  crop: Crop,
  mask: Pt[] | null,
  strokes: CropStroke[],
  base?: CanvasImageSource | null,
) {
  ctx.clearRect(0, 0, w, h);
  const kind = baseKind(crop, mask, strokes, !!base);
  ctx.save();
  ctx.fillStyle = '#fff';
  if (kind === 'full') ctx.fillRect(0, 0, w, h);
  else if (kind === 'shape') {
    ctx.beginPath();
    ctx.rect(crop.l * w, crop.t * h, (1 - crop.l - crop.r) * w, (1 - crop.t - crop.b) * h);
    ctx.clip();
    if (base) ctx.drawImage(base, 0, 0, w, h);
    else if (mask && mask.length >= 3) {
      ctx.beginPath();
      mask.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
      ctx.closePath();
      ctx.fill();
    } else ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
  for (const st of strokes) drawStroke(ctx, st, w, h);
}
