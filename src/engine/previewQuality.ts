import type { Project } from '../model/types';

// 預覽畫質：清楚（長邊 960）／流暢（長邊 480，手機畫面小，肉眼差不多）／自動。
// 只影響預覽用的合成畫布；匯出走自己的合成器與輸出解析度，完全不受影響。

export type PreviewQuality = 'auto' | 'clear' | 'smooth';
export const QUALITY_KEY = 'vc-preview-quality';
export const QUALITY_LABELS: Record<PreviewQuality, string> = { auto: '自動', clear: '清楚', smooth: '流暢' };

export function readQuality(): PreviewQuality {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    // 預設順暢（手機畫面小，肉眼差不多，播放順很多）；使用者可以在頂列或設定頁改成高清、自動
    return v === 'clear' || v === 'auto' ? v : 'smooth';
  } catch {
    return 'smooth';
  }
}

export function writeQuality(q: PreviewQuality) {
  try {
    localStorage.setItem(QUALITY_KEY, q);
  } catch {
    /* 存不了就只換這一次 */
  }
}

/** 同一個時間點最多有幾個影片物件同時要播（音樂、照片、字卡不算；隱藏的軌道不算） */
export function maxVideoOverlap(p: Project): number {
  const ev: [number, number][] = [];
  for (const t of p.tracks) {
    if (t.hidden || t.kind !== 'media') continue;
    for (const it of t.items) if (it.type === 'video') ev.push([it.start, 1], [it.start + it.duration, -1]);
  }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]); // 同一時間點先收尾再開始
  let cur = 0;
  let max = 0;
  for (const [, d] of ev) {
    cur += d;
    max = Math.max(max, cur);
  }
  return max;
}

/** 要不要用流暢預覽。自動＝同時播的影片 ≥ 3 支，或之前已經偵測到播放太慢（slow） */
export function useSmooth(q: PreviewQuality, p: Project, slow: boolean): boolean {
  if (q === 'smooth') return true;
  if (q === 'clear') return false;
  return slow || maxVideoOverlap(p) >= 3;
}

/** 預覽合成畫布的大小（長邊 960，流暢＝480） */
export function previewSizeFor(
  p: Pick<Project, 'width' | 'height'>,
  smooth: boolean,
): { width: number; height: number } {
  const k = (smooth ? 480 : 960) / Math.max(p.width, p.height);
  return { width: Math.round(p.width * k), height: Math.round(p.height * k) };
}
