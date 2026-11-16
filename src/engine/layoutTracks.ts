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

/** 這條格子軌是第幾格（1 起算）：有記就用記的；沒記（舊資料）照格子軌的順序 */
export function cellNoOf(tracks: Track[], track: Track): number {
  if (track.cellNo) return track.cellNo;
  const i = track.group ? cellTracksOf(tracks, track.group).indexOf(track) : -1;
  return i + 1;
}

/** 版型的各格（照格號排好）：每一格有哪幾條格子軌（陣列順序＝這一格裡的上下，後面的蓋前面的）與格子範圍 */
export function cellsOf(
  tracks: Track[],
  group: string,
): { no: number; rect: Track['cell']; tracks: Track[] }[] {
  const by = new Map<number, Track[]>();
  for (const t of cellTracksOf(tracks, group)) {
    const no = cellNoOf(tracks, t);
    by.set(no, [...(by.get(no) ?? []), t]);
  }
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([no, ts]) => ({ no, rect: ts.find((t) => t.cell)?.cell, tracks: ts }));
}

/** 跟這條格子軌同一格的所有格子軌（含自己，陣列順序） */
export function rowsOfCell(tracks: Track[], track: Track): Track[] {
  if (track.groupRole !== 'cell' || !track.group) return [track];
  const no = cellNoOf(tracks, track);
  return cellTracksOf(tracks, track.group).filter((t) => cellNoOf(tracks, t) === no);
}

/** 舊資料的格子軌沒有 cellNo：照順序補上 1、2、3…（已經有的不動）。都有了就原樣回傳同一個陣列 */
export function ensureCellNos(tracks: Track[]): Track[] {
  if (!tracks.some((t) => t.groupRole === 'cell' && !t.cellNo)) return tracks;
  const used = new Map<string, Set<number>>();
  for (const t of tracks)
    if (t.groupRole === 'cell' && t.group && t.cellNo)
      used.set(t.group, (used.get(t.group) ?? new Set()).add(t.cellNo));
  return tracks.map((t) => {
    if (t.groupRole !== 'cell' || !t.group || t.cellNo) return t;
    const u = used.get(t.group) ?? new Set<number>();
    let n = 1;
    while (u.has(n)) n++;
    u.add(n);
    used.set(t.group, u);
    return { ...t, cellNo: n };
  });
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
