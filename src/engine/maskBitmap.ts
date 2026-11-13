import type { Project } from '../model/types';

// 點陣圖遮罩（裁切模式的筆刷／橡皮擦畫出來的）：一張以「整張原始素材畫面」為座標的 PNG，
// 不透明＝留下、透明＝去掉。存在物件的 maskBitmap（data URL）。這裡負責把 data URL 解成 canvas（解一次、重複用）。

const cache = new Map<string, HTMLCanvasElement>();
const pending = new Map<string, Promise<HTMLCanvasElement | undefined>>();
const listeners = new Set<() => void>();

/** 解好的 canvas（還沒解好回傳 undefined，並開始解；解好後通知監聽的人重畫） */
export function maskCanvasFor(url: string): HTMLCanvasElement | undefined {
  const hit = cache.get(url);
  if (hit) return hit;
  void loadMask(url).then((c) => {
    if (c) for (const l of listeners) l();
  });
  return undefined;
}

/** 解碼（匯出前要先等它解好）；失敗回傳 undefined */
export function loadMask(url: string): Promise<HTMLCanvasElement | undefined> {
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(url);
  if (!p) {
    p = new Promise<HTMLCanvasElement | undefined>((ok) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d')?.drawImage(img, 0, 0);
        if (cache.size > 24) cache.clear();
        cache.set(url, c);
        pending.delete(url);
        ok(c);
      };
      img.onerror = () => {
        pending.delete(url);
        ok(undefined);
      };
      img.src = url;
    });
    pending.set(url, p);
  }
  return p;
}

/** 專案裡所有點陣圖遮罩都解好（匯出前呼叫） */
export async function preloadMasks(p: Project): Promise<void> {
  const urls = new Set<string>();
  for (const t of p.tracks)
    for (const it of t.items)
      if (it.type !== 'text' && it.type !== 'audio' && it.maskBitmap) urls.add(it.maskBitmap);
  await Promise.all([...urls].map((u) => loadMask(u)));
}

export function onMaskReady(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 遮罩裡有東西（不透明）的範圍，佔整張畫面的比例；整張都是透明回傳 null。alpha 低於 8 當作沒有 */
export function maskBounds(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): { l: number; t: number; r: number; b: number } | null {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3]! >= 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (maxX < 0) return null;
  return { l: minX / w, t: minY / h, r: 1 - (maxX + 1) / w, b: 1 - (maxY + 1) / h };
}
