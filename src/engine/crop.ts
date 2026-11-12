import type { Asset, Crop, Transform, VideoItem } from '../model/types';
import { croppedSource, fittedSize } from './geometry';

// 裁切的純計算（預覽上的裁切模式用）。座標一律是「原始素材畫面」的比例 0–1。

export const NO_CROP: Crop = { l: 0, t: 0, r: 0, b: 0 };
/** 保留的區域最小是整個畫面的 5%（寬、高各自） */
export const MIN_KEEP = 0.05;

export type Pt = [number, number];
export type Handle = 'l' | 'r' | 't' | 'b' | 'tl' | 'tr' | 'bl' | 'br';

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export const isNoCrop = (c: Crop | undefined): boolean =>
  !c || (c.l < 1e-4 && c.t < 1e-4 && c.r < 1e-4 && c.b < 1e-4);

/** 保留區域的寬、高（佔整個畫面的比例） */
export const keepSize = (c: Crop) => ({ w: 1 - c.l - c.r, h: 1 - c.t - c.b });

/**
 * 換成新的裁切後，讓「留下來的那一塊」在畫面上的位置和大小完全不變（像 PPT 裁切）：
 * 回傳新的 crop 與調整後的 x、y、scale。
 */
export function cropKeepingPlace(
  item: Pick<VideoItem, 'crop' | 'fit' | 'transform'>,
  asset: Asset,
  newCrop: Crop,
  canvasW: number,
  canvasH: number,
): { crop: Crop; transform: Transform } {
  const cur = item.crop ?? NO_CROP;
  const { x, y, scale, rotation } = item.transform;
  const oldSrc = croppedSource(asset, cur);
  const oldBase = fittedSize(oldSrc.w, oldSrc.h, canvasW, canvasH, item.fit);
  const k = (oldBase.w * scale) / oldSrc.w; // 畫面像素 ÷ 素材像素
  const newSrc = croppedSource(asset, newCrop);
  const newBase = fittedSize(newSrc.w, newSrc.h, canvasW, canvasH, item.fit);
  const newScale = (newSrc.w * k) / newBase.w;
  // 新舊保留區域中心在素材裡的差 → 畫面上的位移（再依物件旋轉轉過去）
  const dxSrc = ((newCrop.l + (1 - newCrop.r)) / 2 - (cur.l + (1 - cur.r)) / 2) * asset.width * k;
  const dySrc = ((newCrop.t + (1 - newCrop.b)) / 2 - (cur.t + (1 - cur.b)) / 2) * asset.height * k;
  const a = (rotation * Math.PI) / 180;
  const sx = dxSrc * Math.cos(a) - dySrc * Math.sin(a);
  const sy = dxSrc * Math.sin(a) + dySrc * Math.cos(a);
  return {
    crop: { ...newCrop },
    transform: {
      ...item.transform,
      x: (x * canvasW + sx) / canvasW,
      y: (y * canvasH + sy) / canvasH,
      scale: newScale,
    },
  };
}

/**
 * 拖某個把手（四邊、四角）。fx、fy：手指移動的距離，佔「整個原始畫面」寬、高的比例（已換成素材自己的方向）。
 * lock：鎖定保留區域的像素寬高比（寬 ÷ 高），null＝自由；srcAspect：素材寬 ÷ 高。
 */
export function dragCrop(
  start: Crop,
  h: Handle,
  fx: number,
  fy: number,
  srcAspect: number,
  lock: number | null,
): Crop {
  const hasL = h.includes('l');
  const hasR = h.includes('r');
  const hasT = h.includes('t');
  const hasB = h.includes('b');
  if (lock === null) {
    const out = { ...start };
    if (hasL) out.l = clamp(start.l + fx, 0, 1 - start.r - MIN_KEEP);
    if (hasR) out.r = clamp(start.r - fx, 0, 1 - start.l - MIN_KEEP);
    if (hasT) out.t = clamp(start.t + fy, 0, 1 - start.b - MIN_KEEP);
    if (hasB) out.b = clamp(start.b - fy, 0, 1 - start.t - MIN_KEEP);
    return out;
  }
  // 鎖定比例：保留區域的 寬 × srcAspect ÷ 高 ＝ lock，固定對邊（角）或對邊中心（邊）不動
  const R = lock;
  const A = srcAspect;
  const fw0 = 1 - start.l - start.r;
  const fh0 = 1 - start.t - start.b;
  const horiz = hasL || hasR;
  const vert = hasT || hasB;
  const gx = hasR ? fx : hasL ? -fx : 0; // 寬度增加多少
  const gy = hasB ? fy : hasT ? -fy : 0; // 高度增加多少
  let fw: number;
  if (horiz && vert) fw = fw0 + (gx + (gy * R) / A) / 2;
  else if (horiz) fw = fw0 + gx;
  else fw = ((fh0 + gy) * R) / A;
  const cx = (start.l + (1 - start.r)) / 2;
  const cy = (start.t + (1 - start.b)) / 2;
  const ax = hasL ? 'r' : hasR ? 'l' : 'c'; // 不動的那一邊
  const ay = hasT ? 'b' : hasB ? 't' : 'c';
  const maxW = ax === 'l' ? 1 - start.l : ax === 'r' ? 1 - start.r : 2 * Math.min(cx, 1 - cx);
  const maxH = ay === 't' ? 1 - start.t : ay === 'b' ? 1 - start.b : 2 * Math.min(cy, 1 - cy);
  const hi = Math.min(maxW, (maxH * R) / A);
  const lo = Math.max(MIN_KEEP, (MIN_KEEP * R) / A);
  fw = clamp(fw, Math.min(lo, hi), hi);
  const fh = (fw * A) / R;
  const x0 = ax === 'l' ? start.l : ax === 'r' ? 1 - start.r - fw : cx - fw / 2;
  const y0 = ay === 't' ? start.t : ay === 'b' ? 1 - start.b - fh : cy - fh / 2;
  return { l: x0, t: y0, r: 1 - x0 - fw, b: 1 - y0 - fh };
}

/** 套用某個比例（寬 ÷ 高，像素）：在目前的保留區域裡取最大的、置中的那一塊 */
export function applyRatio(c: Crop, R: number, srcAspect: number): Crop {
  const { w, h } = keepSize(c);
  const fw = Math.min(w, (h * R) / srcAspect);
  const fh = (fw * srcAspect) / R;
  const cx = (c.l + (1 - c.r)) / 2;
  const cy = (c.t + (1 - c.b)) / 2;
  const l = cx - fw / 2;
  const t = cy - fh / 2;
  return { l, t, r: 1 - l - fw, b: 1 - t - fh };
}

/** 多邊形的外框，轉成 crop（保留區域剛好框住多邊形） */
export function polygonCrop(pts: Pt[]): Crop {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const l = clamp(Math.min(...xs), 0, 1 - MIN_KEEP);
  const t = clamp(Math.min(...ys), 0, 1 - MIN_KEEP);
  const r = clamp(1 - Math.max(...xs), 0, 1 - l - MIN_KEEP);
  const b = clamp(1 - Math.max(...ys), 0, 1 - t - MIN_KEEP);
  return { l, t, r, b };
}

/**
 * 手指畫的一圈：先把太近的點丟掉（minDist，佔畫面的比例），再用 Chaikin 切角法磨圓一次；頭尾自動接起來。
 * 點太少（畫不出面積）回傳 null。
 */
export function smoothPolygon(raw: Pt[], minDist = 0.012): Pt[] | null {
  const pts: Pt[] = [];
  for (const p of raw) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= minDist)
      pts.push([clamp(p[0], 0, 1), clamp(p[1], 0, 1)]);
  }
  if (pts.length < 3) return null;
  // 面積太小（幾乎一條線）不算
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    area += x1 * y2 - x2 * y1;
  }
  if (Math.abs(area) / 2 < 0.002) return null;
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
    out.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
  }
  return out;
}
