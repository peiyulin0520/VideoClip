import type { Item, Project, Track, VideoItem } from '../model/types';
import { frameOfGroup, rowsOfCell } from './layoutTracks';

// 版型的一格可以有多個素材（影片、照片、色塊）。素材之間、頭尾的空檔畫什麼，看外框的 gapMode：
// 停格（hold）＝停在前一段的最後一格（前面沒有就停在後一段的第一格）、色塊（fill）＝格子的 fill 色、透明（none）＝不畫。

/** 格子軌上的影像／照片素材，照開始時間排好 */
export function cellItems(track: Track): VideoItem[] {
  return (track.items.filter((x) => x.type !== 'text' && x.type !== 'audio') as VideoItem[])
    .slice()
    .sort((a, b) => a.start - b.start);
}

/** 停格最後一格要留的小尾巴（秒）：不要剛好落在素材的結尾 */
export const HOLD_TAIL = 1 / 30;

/**
 * 這一格在 t 秒要畫哪個素材：有素材在播就是它；空檔且外框是停格 → 前一段（after）或後一段（before）的停格版本。
 * 版型範圍外、或空檔不是停格 → null。回傳的 item 是新物件（不改原本的），held 的 start 已經調成「讓 t 剛好落在它裡面」，
 * 所以 sourceTimeClamped／keyframes 照舊算就會停在最後一格（after）或第一格（before）。
 */
export function cellAt(project: Pick<Project, 'tracks'>, track: Track, t: number): VideoItem | null {
  const items = cellItems(track);
  const live = items.find((x) => t >= x.start && t < x.start + x.duration);
  if (live) return live;
  if (!track.group || items.length === 0) return null;
  // 同一格有好幾列：這一格任何一列有素材在播，或自己不是「有素材的最上面那列」就不停格（不然會蓋住別列）
  const rows = rowsOfCell(project.tracks, track);
  if (rows.length > 1) {
    if (rows.some((r) => r !== track && cellItems(r).some((x) => t >= x.start && t < x.start + x.duration)))
      return null;
    const top = rows.filter((r) => cellItems(r).length > 0).at(-1);
    if (top !== track) return null;
  }
  const fr = frameOfGroup(project.tracks, track.group);
  if (!fr || fr.item.gapMode !== 'hold') return null;
  if (t < fr.item.start || t >= fr.item.start + fr.item.duration) return null;
  return heldItem(items, t);
}

/** 空檔裡的停格素材（沒有素材回傳 null） */
export function heldItem(items: VideoItem[], t: number): VideoItem | null {
  let prev: VideoItem | null = null;
  for (const it of items) {
    if (it.start + it.duration <= t) prev = it;
  }
  if (prev) {
    // 讓 t 落在它的最後一格：local＝duration − HOLD_TAIL
    return { ...prev, start: t - Math.max(prev.duration - HOLD_TAIL, 0), hold: 'after' };
  }
  const next = items.find((x) => x.start > t);
  return next ? { ...next, start: t, hold: 'before' } : null;
}

/** 這一格這一刻是不是空檔（沒有素材在播） */
export function inGap(track: Track, t: number): boolean {
  return !cellItems(track).some((x) => t >= x.start && t < x.start + x.duration);
}

/** 空檔要畫的色塊顏色：外框是「色塊」→ 格子的 fill（沒有就用外框顏色）；舊版型（沒有 gapMode）有 fill 才畫；停格／透明＝不畫 */
export function gapFillColor(track: Track, frame: Item | undefined): string | null {
  if (!frame || frame.type === 'text' || frame.type === 'audio') return null;
  const mode = frame.gapMode;
  if (mode === 'none') return null;
  // 停格：有素材的格子空檔停在素材上；還沒放素材的空格子照舊畫 fill（空格的底色）
  if (mode === 'hold') return cellItems(track).length === 0 ? (track.fill ?? null) : null;
  if (mode === 'fill') return track.fill ?? frame.frameStyle?.color ?? '#000000';
  return track.fill ?? null;
}

/**
 * 這一列要不要畫空檔色塊：同一格有好幾列時，只有最下面那列畫、而且這一格沒有任何一列有素材在播（t 秒）。
 * 只有一列＝照舊（由 gapFillColor 決定）。
 */
export function ownsGapFill(tracks: Track[], track: Track, t: number): boolean {
  const rows = rowsOfCell(tracks, track);
  if (rows.length <= 1) return true;
  if (rows[0] !== track) return false;
  return !rows.some((r) => cellItems(r).some((x) => t >= x.start && t < x.start + x.duration));
}
