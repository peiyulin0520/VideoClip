import type { Asset, Item, Track, VideoItem } from '../model/types';
import { cellItems } from './cellGap';
import { cellRect, cellItem } from './layouts';
import { cellNoOf, cellsOf, cellTracksOf, frameOfGroup } from './layoutTracks';
import { findFreeStart } from './timeline';

// 版型的一格可以有多個素材（影片、照片、色塊）。這裡是「排時間」的純函式（不碰 store），store 的動作包起來用。
// 全部回傳新的軌道陣列（沒變就回傳同一個）。

/** 加素材預設秒數：照片、色塊 2 秒；影片＝素材長度，最多 10 秒 */
export const CELL_IMAGE_SECONDS = 2;
export const CELL_VIDEO_MAX_SECONDS = 10;
export const cellDefaultSeconds = (asset: Pick<Asset, 'kind' | 'duration'>): number =>
  asset.kind === 'image'
    ? CELL_IMAGE_SECONDS
    : Math.min(Math.max(asset.duration, 0.2), CELL_VIDEO_MAX_SECONDS);

/** 一格的素材結束在哪（沒有素材回傳 null） */
export function cellEnd(track: Track): number | null {
  const items = cellItems(track);
  return items.length ? Math.max(...items.map((x) => x.start + x.duration)) : null;
}

/** 掛在色塊素材上的文字（TextItem.onItem）：跟著那段色塊一起動 */
export function textsOnItem(tracks: Track[], itemId: string): Item[] {
  return tracks.flatMap((t) => t.items).filter((x) => x.type === 'text' && x.onItem === itemId);
}

/** 把 start 之後（含）的素材整個平移 delta 秒（只動指定的格子軌；色塊上的文字跟著）。0 秒以下夾到 0 */
function shiftFrom(tracks: Track[], cellIds: Set<string>, from: number, delta: number): Track[] {
  const moved = new Set<string>();
  let next = tracks.map((t) => {
    if (!cellIds.has(t.id)) return t;
    if (!t.items.some((x) => x.start >= from - 1e-6)) return t;
    return {
      ...t,
      items: t.items.map((x) => {
        if (x.start < from - 1e-6 || x.type === 'text' || x.type === 'audio') return x;
        moved.add(x.id);
        return { ...x, start: Math.max(x.start + delta, 0) };
      }),
    } as Track;
  });
  if (moved.size)
    next = next.map((t) =>
      t.items.some((x) => x.type === 'text' && x.onItem && moved.has(x.onItem))
        ? ({
            ...t,
            items: t.items.map((x) =>
              x.type === 'text' && x.onItem && moved.has(x.onItem)
                ? { ...x, start: Math.max(x.start + delta, 0) }
                : x,
            ),
          } as Track)
        : t,
    );
  return next;
}

/**
 * 依序時的漣漪：第 index 格（0 起算，照格子軌順序）的素材在 at 秒之後多了（delta>0）或少了（delta<0）一段，
 * 這一格 at 之後的素材、後面各格的所有素材都跟著平移 delta 秒。外框長度＝全部素材最後結束的時間。
 */
export function rippleAfter(
  tracks: Track[],
  group: string,
  index: number,
  at: number,
  delta: number,
): Track[] {
  if (Math.abs(delta) < 1e-9) return tracks;
  const cells = cellTracksOf(tracks, group);
  const mine = cells[index];
  if (!mine) return tracks;
  const myNo = cellNoOf(tracks, mine);
  let next = shiftFrom(tracks, new Set([mine.id]), at, delta);
  const later = new Set(cells.filter((c) => cellNoOf(tracks, c) > myNo).map((c) => c.id));
  next = shiftFrom(next, later, -Infinity, delta);
  return fitFrameToCells(next, group);
}

/** 外框長度＝各格素材最後結束的時間（至少 0.5 秒）；沒有任何素材就不動 */
export function fitFrameToCells(tracks: Track[], group: string): Track[] {
  const fr = frameOfGroup(tracks, group);
  if (!fr) return tracks;
  const ends = cellTracksOf(tracks, group)
    .map(cellEnd)
    .filter((x): x is number => x !== null);
  if (ends.length === 0) return tracks;
  const dur = Math.max(Math.max(...ends) - fr.item.start, 0.5);
  if (Math.abs(dur - fr.item.duration) < 1e-9) return tracks;
  return tracks.map((t) =>
    t.id !== fr.track.id
      ? t
      : ({
          ...t,
          items: t.items.map((x) => (x.id === fr.item.id ? { ...x, duration: dur } : x)),
        } as Track),
  );
}

/** 把一格的素材從 from 秒開始一個接一個排好（保持順序和各自的長度，中間的空檔拿掉）；色塊上的文字跟著 */
function packCell(tracks: Track[], trackId: string, from: number): Track[] {
  const track = tracks.find((t) => t.id === trackId);
  if (!track) return tracks;
  const items = cellItems(track);
  let cursor = from;
  const newStart = new Map<string, number>();
  for (const it of items) {
    newStart.set(it.id, cursor);
    cursor += it.duration;
  }
  const delta = new Map<string, number>(items.map((it) => [it.id, newStart.get(it.id)! - it.start]));
  return tracks.map((t) => {
    if (t.id === trackId)
      return {
        ...t,
        items: t.items.map((x) => (newStart.has(x.id) ? { ...x, start: newStart.get(x.id)! } : x)),
      } as Track;
    if (t.items.some((x) => x.type === 'text' && x.onItem && delta.has(x.onItem)))
      return {
        ...t,
        items: t.items.map((x) =>
          x.type === 'text' && x.onItem && delta.has(x.onItem)
            ? { ...x, start: Math.max(x.start + delta.get(x.onItem)!, 0) }
            : x,
        ),
      } as Track;
    return t;
  });
}

/**
 * 同步／依序排好：
 * 同步＝每一格的素材都從版型開頭一個接一個排，外框長度＝最長那一格；
 * 依序＝第 1 格先、第 2 格接在後面……（格子順序＝格子軌順序），外框長度＝全部加起來。
 * 還沒有任何素材就只記下選擇、不改長度。
 */
export function arrangeCells(tracks: Track[], group: string, mode: 'sync' | 'seq'): Track[] {
  const fr = frameOfGroup(tracks, group);
  if (!fr) return tracks;
  let next = tracks;
  let cursor = fr.item.start;
  // 一格可以有好幾列（同時疊在一起播）：每一列都從這一格的起點排，這一格結束＝最晚結束的那一列
  for (const cell of cellsOf(tracks, group)) {
    const from = mode === 'seq' ? cursor : fr.item.start;
    let end: number | null = null;
    for (const c of cell.tracks) {
      if (cellItems(c).length === 0) continue;
      next = packCell(next, c.id, from);
      const e = cellEnd(next.find((t) => t.id === c.id)!);
      if (e !== null) end = Math.max(end ?? e, e);
    }
    if (mode === 'seq' && end !== null) cursor = end;
  }
  next = fitFrameToCells(next, group);
  const f2 = frameOfGroup(next, group)!;
  return next.map((t) =>
    t.id !== f2.track.id
      ? t
      : ({
          ...t,
          items: t.items.map((x) => (x.id === f2.item.id ? { ...x, layoutPlay: mode } : x)),
        } as Track),
  );
}

/**
 * 把一個格子素材搬到同一個版型的另一格：時間不變（那個時間已經有東西就找最近的空位），畫面照新格子的大小重新填滿；
 * 色塊上的文字一起搬到新格子中間。回傳新的軌道陣列；不能搬（找不到、不是格子素材、同一格）回傳 null。
 */
export function moveToCellTracks(
  tracks: Track[],
  assets: Pick<Asset, 'id'>[],
  W: number,
  H: number,
  itemId: string,
  toTrackId: string,
  at?: number,
): Track[] | null {
  const from = tracks.find((t) => t.items.some((x) => x.id === itemId));
  const to = tracks.find((t) => t.id === toTrackId);
  const it = from?.items.find((x) => x.id === itemId);
  if (!from || !to || !it || from.id === to.id) return null;
  if (it.type === 'text' || it.type === 'audio' || !it.cell || !it.group) return null;
  if (from.groupRole !== 'cell' || to.groupRole !== 'cell' || from.group !== to.group || !to.cell)
    return null;
  const asset = assets.find((a) => a.id === it.assetId) as Asset | undefined;
  if (!asset) return null;
  const rect = cellRect(to.cell, W, H);
  const fresh = cellItem(asset, rect, W, H, it.start, it.duration, it.group);
  const start = findFreeStart(to.items, at ?? it.start, it.duration);
  const moved: VideoItem = {
    ...it,
    cell: fresh.cell,
    crop: fresh.crop,
    transform: { ...fresh.transform, opacity: it.transform.opacity },
    start,
  };
  if (!fresh.crop) delete moved.crop;
  delete moved.cellEdit;
  const dx = start - it.start;
  return tracks.map((t) => {
    if (t.id === from.id) return { ...t, items: t.items.filter((x) => x.id !== itemId) } as Track;
    if (t.id === to.id) return { ...t, items: [...t.items, moved] } as Track;
    if (t.items.some((x) => x.type === 'text' && x.onItem === itemId))
      return {
        ...t,
        items: t.items.map((x) =>
          x.type === 'text' && x.onItem === itemId
            ? {
                ...x,
                start: Math.max(x.start + dx, 0),
                transform: { ...x.transform, x: to.cell!.x + to.cell!.w / 2, y: to.cell!.y + to.cell!.h / 2 },
              }
            : x,
        ),
      } as Track;
    return t;
  });
}

/**
 * 色塊（格子素材）上的文字（TextItem.onItem）永遠跟著那一段：開始時間、長度跟它一樣；那一段不在了（刪掉、整條軌道拿掉）文字也拿掉。
 * 在「文字」分頁自己加的文字（沒有 onItem）不受影響。每次改專案（`projectStore.apply`）都會跑；已經一致就回傳同一個陣列。
 */
export function syncCaptions(tracks: Track[]): Track[] {
  if (!tracks.some((t) => t.items.some((x) => x.type === 'text' && x.onItem))) return tracks;
  const at = new Map<string, { start: number; duration: number }>();
  for (const t of tracks)
    for (const x of t.items)
      if (x.type !== 'text' && x.type !== 'audio') at.set(x.id, { start: x.start, duration: x.duration });
  let changed = false;
  const next = tracks.map((t) => {
    if (!t.items.some((x) => x.type === 'text' && x.onItem)) return t;
    const items: Item[] = [];
    for (const x of t.items) {
      if (x.type !== 'text' || !x.onItem) {
        items.push(x);
        continue;
      }
      const host = at.get(x.onItem);
      if (!host) {
        changed = true;
        continue;
      }
      if (Math.abs(x.start - host.start) < 1e-9 && Math.abs(x.duration - host.duration) < 1e-9) items.push(x);
      else {
        changed = true;
        items.push({ ...x, start: host.start, duration: host.duration });
      }
    }
    return { ...t, items } as Track;
  });
  return changed ? next : tracks;
}
