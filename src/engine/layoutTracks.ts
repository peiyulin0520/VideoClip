import type { Item, Track, VideoItem } from '../model/types';

// 版型（group）的軌道安排（版型 v2，2026-11-15）：
// ・外框物件（代表整個版型）是一個普通的影像片段，可以放在任何影像列（含主軌），跟前後的片段接在一起做轉場；
// ・各格是版型自己的格子軌（groupRole:'cell'），藏起來、永遠貼在外框那一列的下面。

/** 版型的外框物件：有 group、不是格子裡的素材（沒有 cell）的影像／照片 */
export function isFrameItem(it: Item): it is VideoItem {
  return it.type !== 'text' && it.type !== 'audio' && !!it.group && !it.cell && !it.member;
}

/** 版型裡的文字、貼圖、音效（不是外框、不是格子素材） */
export function isMemberItem(it: Item): boolean {
  if (!it.group) return false;
  if (it.type === 'text' || it.type === 'audio') return true;
  return !!it.member;
}

/** 版型的成員軌（文字、貼圖、音效各自的軌道），照陣列順序 */
export function memberTracksOf(tracks: Track[], group: string, kind?: Track['kind']): Track[] {
  return tracks.filter((t) => t.group === group && t.groupRole === 'member' && (!kind || t.kind === kind));
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
 * 把每個版型的軌道排到外框那一列的前後（X9）：格子軌貼在外框列的正下方（外框的洞才看得到格子），
 * 版型裡的文字、貼圖成員軌貼在外框列的正上方（彼此順序不動，可以任意穿插）。
 * 音效成員軌沒有畫面，維持在最後面跟其他音訊一起。沒有外框的軌道不動。
 * 已經在對的位置就原樣回傳同一個陣列。
 */
export function normalizeGroupTracks(tracks: Track[]): Track[] {
  const groups = new Set<string>();
  for (const t of tracks) if (t.groupRole && t.group) groups.add(t.group);
  if (groups.size === 0) return tracks;
  let out = tracks;
  const visualMember = (t: Track, g: string) =>
    t.group === g && t.groupRole === 'member' && t.kind !== 'audio';
  for (const g of groups) {
    const fr = frameOfGroup(out, g);
    if (!fr) continue;
    const cells = out.filter((t) => t.group === g && t.groupRole === 'cell');
    const members = out.filter((t) => visualMember(t, g));
    if (cells.length) {
      const rest = out.filter((t) => !(t.group === g && t.groupRole === 'cell'));
      const at = rest.findIndex((t) => t.id === fr.track.id);
      const next = [...rest.slice(0, at), ...cells, ...rest.slice(at)];
      if (next.some((t, i) => t !== out[i])) out = next;
    }
    if (members.length) {
      // 成員都已經在外框列上方那一串成員軌裡 → 不動（保持使用者排的順序）
      const fi = out.findIndex((t) => t.id === fr.track.id);
      let end = fi + 1;
      while (end < out.length && out[end]!.groupRole === 'member' && out[end]!.kind !== 'audio') end++;
      const run = new Set(out.slice(fi + 1, end).map((t) => t.id));
      if (!members.every((t) => run.has(t.id))) {
        const rest = out.filter((t) => !visualMember(t, g));
        const at = rest.findIndex((t) => t.id === fr.track.id);
        let j = at + 1;
        while (j < rest.length && rest[j]!.groupRole === 'member' && rest[j]!.kind !== 'audio') j++;
        out = [...rest.slice(0, j), ...members, ...rest.slice(j)];
      }
    }
  }
  return out;
}
