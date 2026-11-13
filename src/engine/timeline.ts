import { MAX_SPEED, MIN_CLIP_DURATION, MIN_SPEED, newId } from '../model/defaults';
import type { Asset, Item, Project, Track, TrackKind, VideoItem } from '../model/types';

/** 軌道種類的分區：影像 → 特效 → 字卡 → 音訊（陣列由前到後＝由下到上的圖層順序）。素材只能放進同種類的軌道。 */
export const ZONE: Record<TrackKind, number> = { media: 0, effect: 1, text: 2, audio: 3 };

/** 依分區排好（同一區維持原本的相對順序） */
export function normalizeZones(tracks: Track[]): Track[] {
  return tracks
    .map((t, i) => ({ t, i }))
    .sort((x, y) => ZONE[x.t.kind] - ZONE[y.t.kind] || x.i - y.i)
    .map((x) => x.t);
}

/** 新軌道要插在陣列的哪個位置：放在同種類（同區）的最上面；那一區還沒有軌道就接在前面各區的後面 */
export function insertIndexFor(tracks: Track[], kind: TrackKind): number {
  let idx = 0;
  tracks.forEach((t, i) => {
    if (ZONE[t.kind] <= ZONE[kind]) idx = i + 1;
  });
  return idx;
}

/** 這個種類的軌道在陣列裡的範圍 [lo, hi]（含）；沒有這種軌道回傳 null */
export function zoneRange(tracks: Track[], kind: TrackKind): [number, number] | null {
  let lo = -1;
  let hi = -1;
  tracks.forEach((t, i) => {
    if (t.kind !== kind) return;
    if (lo < 0) lo = i;
    hi = i;
  });
  return lo < 0 ? null : [lo, hi];
}

/** 最下面那條影像軌（匯入的影片放這裡）；沒有就是 undefined */
export function baseMediaTrack(p: { tracks: Track[] }): Track | undefined {
  return p.tracks.find((t) => t.kind === 'media');
}

/** 所有影像軌上的影片／照片，依開始時間排好（找第一個素材、決定比例、首頁縮圖用） */
export function mediaItems(p: { tracks: Track[] }): VideoItem[] {
  return p.tracks
    .filter((t) => t.kind === 'media')
    .flatMap((t) => t.items as VideoItem[])
    .sort((a, b) => a.start - b.start);
}

/** 一串片段依序接在一起放（匯入多支影片時）：第一個從 from 開始 */
export function placeSequential(clips: VideoItem[], from = 0): VideoItem[] {
  let t = Math.max(from, 0);
  return clips.map((c) => {
    const out = c.start === t ? c : { ...c, start: t };
    t += c.duration;
    return out;
  });
}

/** 軌道上最後一個物件結束的時間（沒有物件＝0） */
export const trackEnd = (items: Item[]): number =>
  items.reduce((m, it) => Math.max(m, it.start + it.duration), 0);

/** 刪除並補齊：拿掉這個物件，同一軌在它後面的物件整個往前移它的長度 */
export function rippleDelete<T extends Item>(items: T[], id: string): T[] {
  const it = items.find((x) => x.id === id);
  if (!it) return items;
  const end = it.start + it.duration;
  return items
    .filter((x) => x.id !== id)
    .map((x) => (x.start >= end - EPS ? { ...x, start: Math.max(x.start - it.duration, 0) } : x));
}

export function isVideoItem(i: Item): i is VideoItem {
  return i.type !== 'text';
}

export const itemEnd = (i: Item) => i.start + i.duration;

export function findItem(
  p: Project,
  id: string | null,
): { item: Item; track: Track; trackIndex: number; index: number } | null {
  if (!id) return null;
  for (let ti = 0; ti < p.tracks.length; ti++) {
    const track = p.tracks[ti]!;
    const index = track.items.findIndex((x) => x.id === id);
    if (index >= 0) return { item: track.items[index]!, track, trackIndex: ti, index };
  }
  return null;
}

export type Layer = { item: Item; track: Track; trackIndex: number };

/**
 * t 秒時要畫出來的圖層，由下到上（= 軌道順序）。隱藏的軌道跳過。
 * 每一軌只在 [start, end) 內顯示；專案的最後一格（t ≥ 總長度）仍顯示最後結束的物件。
 */
export function visibleLayers(p: Project, t: number): Layer[] {
  return layersAt(p, t, false);
}

/** 同上，但可以選擇連隱藏軌道的物件也列出來（圖層面板要能把隱藏的軌道再打開） */
export function layersAt(p: Project, t: number, includeHidden: boolean): Layer[] {
  const total = totalDuration(p);
  const tt = total > 0 && t >= total ? total - 1e-6 : t;
  const out: Layer[] = [];
  p.tracks.forEach((track, trackIndex) => {
    if (track.kind === 'audio') return; // 音樂沒有畫面
    if (track.hidden && !includeHidden) return;
    const item = track.items.find((x) => tt >= x.start && tt < x.start + x.duration);
    if (item) out.push({ item, track, trackIndex });
  });
  return out;
}

/** 專案長度＝影片、照片、文字、貼圖最後結束的時間；背景音樂不算（音樂比影片長就在影片結束時切掉） */
export function totalDuration(p: Project): number {
  return p.tracks.reduce(
    (max, tr) =>
      tr.kind === 'audio' ? max : tr.items.reduce((m, it) => Math.max(m, it.start + it.duration), max),
    0,
  );
}

/** t 秒落在哪個片段（t 超過結尾時回傳最後一個，t < 0 回傳第一個）。 */
export function itemAt(items: VideoItem[], t: number): { item: VideoItem; index: number } | null {
  if (items.length === 0) return null;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (t < it.start + it.duration) return { item: it, index: i };
  }
  return { item: items[items.length - 1]!, index: items.length - 1 };
}

/** 時間軸時間 → 素材內時間 */
export function sourceTimeAt(item: VideoItem, t: number): number {
  const local = Math.min(Math.max(t - item.start, 0), item.duration);
  return item.trimIn + local * item.speed;
}

/**
 * 同上，但不會超過素材的結尾（轉場延長片段時會超過；影片元件停在最後一格，不要一直重複 seek 一個不存在的時間）
 */
export function sourceTimeClamped(item: VideoItem, t: number, asset?: Pick<Asset, 'duration'>): number {
  const s = sourceTimeAt(item, t);
  return asset && asset.duration > 0.1 ? Math.min(s, asset.duration - 0.05) : s;
}

/** 這個片段在目前 trimIn/speed 下，最長能有多長（秒） */
export function maxDuration(item: VideoItem, asset: Asset | undefined): number {
  if (item.type === 'image' || !asset) return 600;
  return Math.max((asset.duration - item.trimIn) / item.speed, MIN_CLIP_DURATION);
}

/**
 * 修剪面板：直接指定素材要留的區段 [srcStart, srcEnd]（素材秒數）。片段的開始時間不變，
 * 長度不能壓到後面的物件。照片沒有素材區段，不適用。
 */
export function setTrimWindowFree(
  items: Item[],
  id: string,
  srcStart: number,
  srcEnd: number,
  asset: Asset | undefined,
): Item[] {
  return items.map((it) => {
    if (it.id !== id || !isVideoItem(it) || it.type === 'image' || !asset) return it;
    const { nextStart } = neighbors(items, it);
    const minSrc = MIN_CLIP_DURATION * it.speed;
    const s0 = Math.min(Math.max(srcStart, 0), Math.max(asset.duration - minSrc, 0));
    let e0 = Math.min(Math.max(srcEnd, s0 + minSrc), asset.duration);
    const room = nextStart - it.start; // 後面有物件就不能再長
    if (Number.isFinite(room) && (e0 - s0) / it.speed > room)
      e0 = s0 + Math.max(room, MIN_CLIP_DURATION) * it.speed;
    return { ...it, trimIn: s0, duration: (e0 - s0) / it.speed };
  });
}

/** 改速度：保持素材區段不變，時間軸長度跟著變；後面有物件擋住（會重疊）就回傳 null */
export function setSpeedFree(items: Item[], id: string, speed: number): Item[] | null {
  const s = Math.min(Math.max(speed, MIN_SPEED), MAX_SPEED);
  const it = items.find((x) => x.id === id);
  if (!it || !isVideoItem(it) || it.type === 'image') return items;
  const span = it.duration * it.speed;
  const want = Math.max(span / s, MIN_CLIP_DURATION);
  if (!canPlace(items, it.start, want, id)) return null;
  return items.map((x) => (x.id === id ? { ...x, speed: s, duration: want } : x));
}

export function formatTime(t: number): string {
  const s = Math.max(t, 0);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}

// ---------- 所有軌道：自由放置（不 ripple），同一軌的物件不能重疊 ----------

const EPS = 1e-6;

export function canPlace(items: Item[], start: number, duration: number, excludeId?: string): boolean {
  if (start < -EPS) return false;
  return items.every(
    (o) => o.id === excludeId || start + duration <= o.start + EPS || start >= o.start + o.duration - EPS,
  );
}

/** 離 desired 最近、不和同軌其他物件重疊的起點 */
export function findFreeStart(items: Item[], desired: number, duration: number, excludeId?: string): number {
  const want = Math.max(desired, 0);
  if (canPlace(items, want, duration, excludeId)) return want;
  const cands = new Set<number>([0]);
  for (const o of items) {
    if (o.id === excludeId) continue;
    cands.add(o.start + o.duration);
    cands.add(o.start - duration);
  }
  let best = Infinity;
  let bestD = Infinity;
  for (const c of cands) {
    if (c < 0 || !canPlace(items, c, duration, excludeId)) continue;
    const d = Math.abs(c - want);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best === Infinity ? Math.max(...items.map(itemEnd), 0) : best;
}

export function moveFree(items: Item[], id: string, newStart: number): Item[] {
  const it = items.find((x) => x.id === id);
  if (!it) return items;
  const start = findFreeStart(items, newStart, it.duration, id);
  return items.map((x) => (x.id === id ? { ...x, start } : x));
}

export function splitFree(items: Item[], id: string, t: number): Item[] | null {
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const it = items[i]!;
  const local = t - it.start;
  if (local < MIN_CLIP_DURATION || it.duration - local < MIN_CLIP_DURATION) return null;
  const a: Item = { ...it, duration: local };
  const b: Item = isVideoItem(it)
    ? {
        ...it,
        id: newId('i_'),
        start: t,
        duration: it.duration - local,
        trimIn: it.trimIn + local * it.speed,
      }
    : { ...it, id: newId('i_'), start: t, duration: it.duration - local };
  if (b.type !== 'text' && b.type !== 'audio') delete b.transitionIn; // 轉場在片段的開頭，後半段沒有
  return [...items.slice(0, i), a, b, ...items.slice(i + 1)];
}

export function duplicateFree(items: Item[], id: string): { items: Item[]; newId: string } | null {
  const it = items.find((x) => x.id === id);
  if (!it) return null;
  const copy: Item = { ...it, id: newId('i_') };
  copy.start = findFreeStart(items, itemEnd(it), it.duration);
  return { items: [...items, copy], newId: copy.id };
}

function neighbors(items: Item[], it: Item): { prevEnd: number; nextStart: number } {
  let prevEnd = 0;
  let nextStart = Infinity;
  for (const o of items) {
    if (o.id === it.id) continue;
    if (o.start + o.duration <= it.start + EPS) prevEnd = Math.max(prevEnd, o.start + o.duration);
    else if (o.start >= it.start + it.duration - EPS) nextStart = Math.min(nextStart, o.start);
  }
  return { prevEnd, nextStart };
}

/** 頭端：delta > 0 代表起點往後切。不能侵入前一個物件，也不能超過素材起點。 */
export function trimStartFree(items: Item[], id: string, delta: number): Item[] {
  return items.map((it) => {
    if (it.id !== id) return it;
    const { prevEnd } = neighbors(items, it);
    let lo = prevEnd - it.start; // 最多往前延伸到這裡（負值）
    if (isVideoItem(it) && it.type !== 'image') lo = Math.max(lo, -it.trimIn / it.speed);
    const hi = it.duration - MIN_CLIP_DURATION;
    const d = Math.min(Math.max(delta, lo), hi);
    const next = { ...it, start: it.start + d, duration: it.duration - d };
    if (isVideoItem(it) && it.type !== 'image') (next as VideoItem).trimIn = it.trimIn + d * it.speed;
    return next;
  });
}

export function trimEndFree(
  items: Item[],
  id: string,
  newDuration: number,
  asset: Asset | undefined,
): Item[] {
  return items.map((it) => {
    if (it.id !== id) return it;
    const { nextStart } = neighbors(items, it);
    let hi = nextStart - it.start;
    if (isVideoItem(it)) hi = Math.min(hi, maxDuration(it, asset));
    const d = Math.min(Math.max(newDuration, MIN_CLIP_DURATION), Math.max(hi, MIN_CLIP_DURATION));
    return { ...it, duration: d };
  });
}

/** 交換圖層順序（dir = +1 往上層）。只能在同種類（同一區）的軌道之間換，不能跨區。 */
export function moveTrack(tracks: Track[], id: string, dir: -1 | 1): Track[] {
  const i = tracks.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= tracks.length || tracks[j]!.kind !== tracks[i]!.kind) return tracks;
  const next = tracks.slice();
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/**
 * 把軌道搬到新的圖層位置 toIndex（tracks 的 index）；會夾在同種類（同一區）的範圍內，不能跨區。
 * 沒有變動回傳原陣列。
 */
export function reorderTrack(tracks: Track[], id: string, toIndex: number): Track[] {
  const from = tracks.findIndex((t) => t.id === id);
  if (from < 0) return tracks;
  const [lo, hi] = zoneRange(tracks, tracks[from]!.kind)!;
  const to = Math.min(Math.max(toIndex, lo), hi);
  if (to === from) return tracks;
  const next = tracks.slice();
  const [t] = next.splice(from, 1);
  next.splice(to, 0, t!);
  return next;
}

/** 在哪一條同類型軌道的 [start, start+duration) 是空的；找不到回傳 -1（呼叫端要新增軌道） */
export function firstFreeTrack(p: Project, kind: Track['kind'], start: number, duration: number): number {
  return p.tracks.findIndex((t) => t.kind === kind && !t.locked && canPlace(t.items, start, duration));
}

// ---------- 長按拖移素材：拖到別的軌道、別的時間 ----------

/** 物件屬於哪一種軌道（影片、照片、貼圖＝影像；字卡＝字卡；音樂＝音訊） */
export function trackKindOf(item: Item): TrackKind {
  return item.type === 'text' ? 'text' : item.type === 'audio' ? 'audio' : 'media';
}

/** 軌道種類的中文名（提示用） */
export const KIND_LABEL: Record<TrackKind, string> = {
  media: '影像（影片、照片、貼圖）',
  effect: '特效',
  text: '字卡',
  audio: '音樂和音效',
};

/** 放到哪裡：既有的某條軌道，或是同一區最上面／最下面新增一條 */
export type DropTarget =
  | { type: 'track'; trackId: string }
  | { type: 'new'; edge: 'top' | 'bottom' }
  | { type: 'invalid'; kind: TrackKind };

/**
 * 算放開手指時要放到哪：targetId＝手指所在的軌道（null＝不在任何軌道上）、newEdge＝手指在「＋新增一軌」的放置區。
 * 素材只能放進同種類的軌道，種類不同＝invalid（要彈回原位並提示）。
 */
export function dropTarget(
  tracks: Track[],
  item: Item,
  hover: { trackId: string | null; newEdge: 'top' | 'bottom' | null },
): DropTarget | null {
  const kind = trackKindOf(item);
  if (hover.newEdge) return { type: 'new', edge: hover.newEdge };
  if (!hover.trackId) return null;
  const tr = tracks.find((t) => t.id === hover.trackId);
  if (!tr) return null;
  if (tr.kind !== kind) return { type: 'invalid', kind };
  if (tr.locked) return { type: 'invalid', kind };
  return { type: 'track', trackId: tr.id };
}

/**
 * 把物件搬到目標軌道（或新增的軌道）的 start 秒。回傳新的軌道陣列；不能搬（種類不符、找不到）回傳 null。
 * 目標軌道在那個時間已經有東西：移到最近的空位。來源軌道空了也不會自動刪掉。
 */
export function moveItemToTrack(
  tracks: Track[],
  itemId: string,
  target: DropTarget,
  start: number,
  makeTrack: (kind: TrackKind, existing: Track[]) => Track,
): Track[] | null {
  const srcIdx = tracks.findIndex((t) => t.items.some((x) => x.id === itemId));
  if (srcIdx < 0 || target.type === 'invalid') return null;
  const item = tracks[srcIdx]!.items.find((x) => x.id === itemId)!;
  const kind = trackKindOf(item);
  const at = Math.max(start, 0);
  if (target.type === 'track') {
    const dstIdx = tracks.findIndex((t) => t.id === target.trackId);
    if (dstIdx < 0 || tracks[dstIdx]!.kind !== kind) return null;
    const dst = tracks[dstIdx]!;
    const s = findFreeStart(dst.items, at, item.duration, itemId); // 同一軌時 itemId 自己不算擋路
    return tracks.map((t, i) => {
      if (i === srcIdx && i === dstIdx)
        return { ...t, items: t.items.map((x) => (x.id === itemId ? { ...x, start: s } : x)) };
      if (i === srcIdx) return { ...t, items: t.items.filter((x) => x.id !== itemId) };
      if (i === dstIdx) return { ...t, items: [...t.items, { ...item, start: s }] };
      return t;
    });
  }
  // 新增一條軌道：最上面＝同一區的最上面，最下面＝同一區的最下面
  const without = tracks.map((t, i) =>
    i === srcIdx ? { ...t, items: t.items.filter((x) => x.id !== itemId) } : t,
  );
  const fresh = makeTrack(kind, without);
  fresh.items = [{ ...item, start: at }];
  const range = zoneRange(without, kind);
  const index =
    target.edge === 'top' ? insertIndexFor(without, kind) : range ? range[0] : insertIndexFor(without, kind);
  return [...without.slice(0, index), fresh, ...without.slice(index)];
}

// ---------- 修剪：保留多段（上方小旗標，每一對旗標是一段） ----------

export type Range = [number, number];

/**
 * 整理使用者標的幾段：夾在 [0, total]、起點終點排好、重疊或相接的合併、短於 minLen 的丟掉。
 * 單位是素材秒數。
 */
export function mergeRanges(ranges: Range[], total: number, minLen: number): Range[] {
  const sorted = ranges
    .map(([a, b]): Range => [Math.max(Math.min(a, b), 0), Math.min(Math.max(a, b), total)])
    .filter(([a, b]) => b - a >= minLen - 1e-9)
    .sort((x, y) => x[0] - y[0]);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

/**
 * 把一個影片／音樂片段依「素材要留的幾段」拆成幾個片段：每一段留在它原本在時間軸上的位置
 * （start = 原本的 start + (段起點 − 原本的 trimIn) ÷ 速度），中間不要的地方變成空位。
 * 第一段沿用原本的 id（選取、命名不變），其他段是新的 id。回傳依時間排好的陣列；沒有可用的段回傳空陣列。
 */
export function splitByRanges(item: VideoItem, ranges: Range[], assetDuration: number): VideoItem[] {
  const minSrc = MIN_CLIP_DURATION * item.speed;
  return mergeRanges(ranges, assetDuration, minSrc).map(([a, b], i) => {
    let start = item.start + (a - item.trimIn) / item.speed;
    let trimIn = a;
    let duration = (b - a) / item.speed;
    if (start < 0) {
      // 往前延伸超過專案開頭：把超出的部分切掉
      trimIn += -start * item.speed;
      duration += start;
      start = 0;
    }
    const piece: VideoItem = { ...item, start, trimIn, duration };
    if (i > 0) {
      piece.id = newId('i_');
      delete piece.label; // 命名只留在第一段
      delete piece.transitionIn; // 轉場只留在第一段
    }
    return piece;
  });
}

// ---------- 軌道多選（H5）：一起換順序、整併、一起刪 ----------

/** 選到版型的任何一條軌道＝整個版型的軌道都算（外框＋各格一起動） */
export function expandGroupTracks(tracks: Track[], ids: string[]): Set<string> {
  const out = new Set(ids);
  const groups = new Set(tracks.filter((t) => out.has(t.id) && t.group).map((t) => t.group));
  for (const t of tracks) if (t.group && groups.has(t.group)) out.add(t.id);
  return out;
}

/**
 * 選到的軌道一起往上（dir=+1，圖層更上面）或往下（dir=-1）移一格：只在自己的分區內移，
 * 碰到分區邊緣或另一條選到的軌道就不動；選到的軌道彼此的相對順序不變。回傳新的軌道陣列（沒變就是同一個）。
 */
export function moveTracksBy(tracks: Track[], ids: string[], dir: 1 | -1): Track[] {
  const sel = expandGroupTracks(tracks, ids);
  const a = [...tracks];
  let changed = false;
  const swap = (i: number, j: number) => {
    [a[i], a[j]] = [a[j]!, a[i]!];
    changed = true;
  };
  if (dir === 1) {
    for (let i = a.length - 2; i >= 0; i--)
      if (sel.has(a[i]!.id) && !sel.has(a[i + 1]!.id) && ZONE[a[i]!.kind] === ZONE[a[i + 1]!.kind])
        swap(i, i + 1);
  } else {
    for (let i = 1; i < a.length; i++)
      if (sel.has(a[i]!.id) && !sel.has(a[i - 1]!.id) && ZONE[a[i]!.kind] === ZONE[a[i - 1]!.kind])
        swap(i, i - 1);
  }
  return changed ? a : tracks;
}

/** 刪掉選到的軌道（版型整個一起）；至少留一條影像軌 */
export function removeTracksByIds(tracks: Track[], ids: string[]): Track[] {
  const sel = expandGroupTracks(tracks, ids);
  const keepMedia = tracks.find((t) => t.kind === 'media' && !sel.has(t.id)) ?? null;
  if (!keepMedia) {
    // 影像軌全被選到：留下最下面那一條
    const base = tracks.find((t) => t.kind === 'media');
    if (base) sel.delete(base.id);
  }
  return tracks.filter((t) => !sel.has(t.id));
}

const overlaps = (a: Item, b: Item) =>
  a.start < b.start + b.duration - 1e-6 && b.start < a.start + a.duration - 1e-6;

/**
 * 整併：選到的同一種類軌道，物件全部搬到最上面那一條（時間位置不變）。時間重疊放不進去的留在原本的軌道，
 * 搬空的軌道拿掉。版型的軌道、不同種類混選都不能整併（回傳 null）。
 */
export function mergeTracksByIds(
  tracks: Track[],
  ids: string[],
): { tracks: Track[]; kept: number; merged: number } | null {
  const sel = tracks.filter((t) => ids.includes(t.id));
  if (sel.length < 2 || sel.some((t) => t.group) || new Set(sel.map((t) => t.kind)).size !== 1) return null;
  const target = sel[sel.length - 1]!; // 陣列越後面＝圖層越上面
  const targetItems = [...target.items] as Item[];
  let kept = 0;
  let merged = 0;
  const rest = new Map<string, Item[]>();
  for (const t of sel.slice(0, -1)) {
    const left: Item[] = [];
    for (const it of [...t.items].sort((x, y) => x.start - y.start) as Item[]) {
      if (targetItems.some((o) => overlaps(o, it))) {
        left.push(it);
        kept++;
      } else {
        targetItems.push(it);
        merged++;
      }
    }
    rest.set(t.id, left);
  }
  const out: Track[] = [];
  for (const t of tracks) {
    if (t.id === target.id) out.push({ ...t, items: targetItems.sort((x, y) => x.start - y.start) } as Track);
    else if (rest.has(t.id)) {
      const left = rest.get(t.id)!;
      if (left.length > 0) out.push({ ...t, items: left } as Track);
    } else out.push(t);
  }
  return { tracks: out, kept, merged };
}
