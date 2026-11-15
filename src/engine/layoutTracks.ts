import type { Item, Track, VideoItem } from '../model/types';

// 版型（group）的軌道安排（版型 v2，2026-11-15）：
// ・外框物件（代表整個版型）是一個普通的影像片段，可以放在任何影像列（含主軌），跟前後的片段接在一起做轉場；
// ・各格是版型自己的格子軌（groupRole:'cell'），藏起來、永遠貼在外框那一列的下面。

/** 版型的外框物件：有 group、不是格子裡的素材（沒有 cell）的影像／照片 */
export function isFrameItem(it: Item): it is VideoItem {
  return it.type !== 'text' && it.type !== 'audio' && !!it.group && !it.cell;
}

/** 這個版型的外框與它所在的軌道 */
export function frameOfGroup(tracks: Track[], group: string): { item: VideoItem; track: Track } | null {
  for (const track of tracks)
    for (const item of track.items) if (isFrameItem(item) && item.group === group) return { item, track };
  return null;
}

/** 版型的格子軌（照圖層順序，下面的在前） */
export function cellTracksOf(tracks: Track[], group: string): Track[] {
  return tracks.filter((t) => t.group === group && t.groupRole === 'cell');
}

/**
 * 把每個版型的格子軌搬到外框所在那一列的正下方（格子在外框下面，外框的洞才看得到格子）；
 * 沒有外框的格子軌不動。已經在對的位置就原樣回傳同一個陣列。
 */
export function normalizeGroupTracks(tracks: Track[]): Track[] {
  const groups = new Set<string>();
  for (const t of tracks) if (t.groupRole === 'cell' && t.group) groups.add(t.group);
  if (groups.size === 0) return tracks;
  let out = tracks;
  for (const g of groups) {
    const fr = frameOfGroup(out, g);
    if (!fr) continue;
    const cells = out.filter((t) => t.group === g && t.groupRole === 'cell');
    const rest = out.filter((t) => !(t.group === g && t.groupRole === 'cell'));
    const at = rest.findIndex((t) => t.id === fr.track.id);
    const next = [...rest.slice(0, at), ...cells, ...rest.slice(at)];
    if (next.some((t, i) => t !== out[i])) out = next;
  }
  return out;
}
