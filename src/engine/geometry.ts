import type { Asset, BlendMode, Crop, Item, TextItem } from '../model/types';
import type { Layer } from './timeline';

/** 畫面（canvas）像素座標下的物件方框；rotation 單位是度，順時針，繞中心 */
export type Box = { cx: number; cy: number; w: number; h: number; rotation: number };
export type TextSize = (
  item: TextItem,
  canvasW: number,
  canvasH: number,
) => { w: number; h: number; content?: { x: number; y: number; w: number; h: number } };
export type GeoCtx = { canvasW: number; canvasH: number; assets: Asset[]; textSize: TextSize };

// 平台按鈕安全區：直式畫面底部約 250/1920、右側約 150/1080（見 docs 的字卡規則）
export const SAFE_BOTTOM = 250 / 1920;
export const SAFE_RIGHT = 150 / 1080;

export function fittedSize(
  srcW: number,
  srcH: number,
  cw: number,
  ch: number,
  fit: 'cover' | 'contain',
): { w: number; h: number } {
  if (srcW <= 0 || srcH <= 0) return { w: cw, h: ch };
  const k = fit === 'cover' ? Math.max(cw / srcW, ch / srcH) : Math.min(cw / srcW, ch / srcH);
  return { w: srcW * k, h: srcH * k };
}

export function croppedSource(asset: Asset, crop?: Crop): { w: number; h: number } {
  const c = crop ?? { l: 0, t: 0, r: 0, b: 0 };
  return {
    w: Math.max(asset.width * (1 - c.l - c.r), 1),
    h: Math.max(asset.height * (1 - c.t - c.b), 1),
  };
}

/**
 * 選取框／點選範圍／吸附用的方框：文字用「看得到的內容」（字塊∪文字∪裝飾），不是含透明邊的整張畫布。
 * 畫面渲染用 itemBox（整張畫布）；兩者中心可能不同（裝飾偏一邊時），這裡已換算。
 */
export function selectionBox(item: Item, ctx: GeoCtx): Box | null {
  const base = itemBox(item, ctx);
  if (!base) return base;
  if (item.type === 'video' || item.type === 'image') {
    // 版型外框：只有「看得到的範圍」算選取範圍（整張外框圖是畫面大小，中間挖洞）
    const v = item.visible;
    if (!v) return base;
    const dx = (v.x + v.w / 2 - 0.5) * base.w;
    const dy = (v.y + v.h / 2 - 0.5) * base.h;
    const a = (base.rotation * Math.PI) / 180;
    return {
      cx: base.cx + dx * Math.cos(a) - dy * Math.sin(a),
      cy: base.cy + dx * Math.sin(a) + dy * Math.cos(a),
      w: v.w * base.w,
      h: v.h * base.h,
      rotation: base.rotation,
    };
  }
  if (item.type !== 'text') return base;
  const s = ctx.textSize(item, ctx.canvasW, ctx.canvasH);
  const c = s.content;
  if (!c) return base;
  const k = item.transform.scale;
  const dx = (c.x + c.w / 2 - s.w / 2) * k;
  const dy = (c.y + c.h / 2 - s.h / 2) * k;
  const a = (base.rotation * Math.PI) / 180;
  return {
    cx: base.cx + dx * Math.cos(a) - dy * Math.sin(a),
    cy: base.cy + dx * Math.sin(a) + dy * Math.cos(a),
    w: c.w * k,
    h: c.h * k,
    rotation: base.rotation,
  };
}

export function itemBox(item: Item, ctx: GeoCtx): Box | null {
  if (item.type === 'audio') return null; // 背景音樂沒有畫面
  const { canvasW: cw, canvasH: ch } = ctx;
  const { x, y, scale, rotation } = item.transform;
  let w: number;
  let h: number;
  if (item.type === 'text') {
    const s = ctx.textSize(item, cw, ch);
    w = s.w;
    h = s.h;
  } else {
    const asset = ctx.assets.find((a) => a.id === item.assetId);
    if (!asset) return null;
    const src = croppedSource(asset, item.crop);
    ({ w, h } = fittedSize(src.w, src.h, cw, ch, item.fit));
  }
  return { cx: x * cw, cy: y * ch, w: w * scale, h: h * scale, rotation };
}

/** 把畫面座標的點轉到方框自己的座標（原點在中心、沒有旋轉） */
export function toLocal(box: Box, px: number, py: number): { x: number; y: number } {
  const a = (-box.rotation * Math.PI) / 180;
  const dx = px - box.cx;
  const dy = py - box.cy;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}

export function pointInBox(box: Box, px: number, py: number): boolean {
  const p = toLocal(box, px, py);
  return Math.abs(p.x) <= box.w / 2 && Math.abs(p.y) <= box.h / 2;
}

export function boxCorners(box: Box): [number, number][] {
  const a = (box.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return (
    [
      [-box.w / 2, -box.h / 2],
      [box.w / 2, -box.h / 2],
      [box.w / 2, box.h / 2],
      [-box.w / 2, box.h / 2],
    ] as [number, number][]
  ).map(([x, y]) => [box.cx + x * c - y * s, box.cy + x * s + y * c]);
}

export function aabb(box: Box): { l: number; t: number; r: number; b: number } {
  const pts = boxCorners(box);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
}

/**
 * 點在哪些圖層上，由上到下排好（最上面的在最前面）。
 * 鎖定的軌道不會被選到（隱藏的軌道 visibleLayers 已經濾掉）。
 * minSize：點選範圍至少這麼大（畫面座標），讓很小的物件手指也點得到
 */
export function hitTestAll(layers: Layer[], ctx: GeoCtx, px: number, py: number, minSize = 0): Layer[] {
  const out: Layer[] = [];
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]!;
    if (l.track.locked) continue;
    const box = selectionBox(l.item, ctx);
    if (box && pointInBox({ ...box, w: Math.max(box.w, minSize), h: Math.max(box.h, minSize) }, px, py))
      out.push(l);
  }
  return out;
}

/** 點在哪個圖層上（最上面的優先）。鎖定的軌道、隱藏的軌道不會被選到。 */
export function topHit(layers: Layer[], ctx: GeoCtx, px: number, py: number, minSize = 0): Layer | null {
  return hitTestAll(layers, ctx, px, py, minSize)[0] ?? null;
}

/**
 * 輕點時要選哪一個：點在已選物件上又點一次＝換下面那一層（到底再回最上面）；
 * 沒有選取或點在別的地方＝最上面那個。hits 由上到下。
 */
export function nextHit<T extends { item: { id: string } }>(hits: T[], selectedId: string | null): T | null {
  if (hits.length === 0) return null;
  const i = hits.findIndex((h) => h.item.id === selectedId);
  return i < 0 ? hits[0]! : hits[(i + 1) % hits.length]!;
}

export const BLEND_LABELS: Record<BlendMode, string> = {
  normal: '正常',
  multiply: '色彩加深',
  screen: '濾色',
  overlay: '覆蓋',
  add: '加亮',
};

// ---------- 吸附 ----------

export type Snap = { dx: number; dy: number; guideX: number | null; guideY: number | null };

/**
 * 移動時吸附：方框的中心線、左右/上下邊緣，靠近畫面中心線、畫面邊緣、平台安全區邊界時吸過去。
 * threshold 單位是畫面像素。
 */
export function snapMove(box: Box, cw: number, ch: number, threshold: number, safeZone = true): Snap {
  const r = aabb(box);
  const xTargets = [0, cw / 2, cw, ...(safeZone ? [cw * (1 - SAFE_RIGHT)] : [])];
  const yTargets = [0, ch / 2, ch, ...(safeZone ? [ch * (1 - SAFE_BOTTOM)] : [])];
  const pick = (own: number[], targets: number[]) => {
    let best: { d: number; guide: number } | null = null;
    for (const o of own)
      for (const t of targets) {
        const d = t - o;
        if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, guide: t };
      }
    return best;
  };
  const sx = pick([r.l, box.cx, r.r], xTargets);
  const sy = pick([r.t, box.cy, r.b], yTargets);
  return { dx: sx?.d ?? 0, dy: sy?.d ?? 0, guideX: sx?.guide ?? null, guideY: sy?.guide ?? null };
}

/** 旋轉時靠近 45 度的倍數就吸過去 */
export function snapRotation(deg: number, threshold = 4): number {
  const n = Math.round(deg / 45) * 45;
  return Math.abs(deg - n) <= threshold ? n : deg;
}
