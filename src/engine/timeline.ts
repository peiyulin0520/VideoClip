import { MAX_SPEED, MIN_CLIP_DURATION, MIN_SPEED, newId } from '../model/defaults';
import type { Asset, Item, Project, Track, VideoItem } from '../model/types';

/** 主軌片段依序排好：每個片段前面可以有空白（gap，預設 0＝首尾相接），重算 start。回傳新陣列（不改原物件）。 */
export function relayout(items: VideoItem[]): VideoItem[] {
  let t = 0;
  return items.map((it) => {
    t += Math.max(it.gap ?? 0, 0);
    const out = it.start === t ? it : { ...it, start: t };
    t += it.duration;
    return out;
  });
}

/** 主軌某一片段前面的空白（秒） */
export const gapOf = (it: VideoItem): number => Math.max(it.gap ?? 0, 0);

/** 刪掉主軌片段前面的空白，後面的片段往前接上 */
export function removeGap(items: VideoItem[], id: string): VideoItem[] {
  return relayout(
    items.map((it) => {
      if (it.id !== id) return it;
      const { gap: _gap, ...rest } = it;
      void _gap;
      return rest as VideoItem;
    }),
  );
}

export function mainTrack(p: Project): Track {
  const t = p.tracks.find((x) => x.kind === 'main');
  if (!t) throw new Error('專案沒有主軌');
  return t;
}

export function mainItems(p: Project): VideoItem[] {
  return mainTrack(p).items as VideoItem[];
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
 * 主軌用 itemAt（t 超過結尾時仍顯示最後一個片段）；其他軌道只在 [start, end) 內顯示。
 */
export function visibleLayers(p: Project, t: number): Layer[] {
  return layersAt(p, t, false);
}

/** 同上，但可以選擇連隱藏軌道的物件也列出來（圖層面板要能把隱藏的軌道再打開） */
export function layersAt(p: Project, t: number, includeHidden: boolean): Layer[] {
  const out: Layer[] = [];
  p.tracks.forEach((track, trackIndex) => {
    if (track.hidden && !includeHidden) return;
    if (track.kind === 'main') {
      const hit = itemAt(track.items as VideoItem[], t);
      // 主軌的空白（片段前面的 gap）是黑畫面：這個片段還沒開始就不畫
      if (hit && t >= hit.item.start - 1e-9) out.push({ item: hit.item, track, trackIndex });
      return;
    }
    const item = track.items.find((x) => t >= x.start && t < x.start + x.duration);
    if (item) out.push({ item, track, trackIndex });
  });
  return out;
}

export function totalDuration(p: Project): number {
  return p.tracks.reduce(
    (max, tr) => tr.items.reduce((m, it) => Math.max(m, it.start + it.duration), max),
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

/** 這個片段在目前 trimIn/speed 下，最長能有多長（秒） */
export function maxDuration(item: VideoItem, asset: Asset | undefined): number {
  if (item.type === 'image' || !asset) return 600;
  return Math.max((asset.duration - item.trimIn) / item.speed, MIN_CLIP_DURATION);
}

export function splitItem(items: VideoItem[], id: string, t: number): VideoItem[] | null {
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const it = items[i]!;
  const local = t - it.start;
  if (local < MIN_CLIP_DURATION || it.duration - local < MIN_CLIP_DURATION) return null;
  const a: VideoItem = { ...it, duration: local };
  const b: VideoItem = {
    ...it,
    id: newId('i_'),
    duration: it.duration - local,
    trimIn: it.trimIn + local * it.speed,
  };
  delete b.gap; // 空白只留在前半段
  return relayout([...items.slice(0, i), a, b, ...items.slice(i + 1)]);
}

export function duplicateItem(items: VideoItem[], id: string): { items: VideoItem[]; newId: string } | null {
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const copy: VideoItem = { ...items[i]!, id: newId('i_') };
  delete copy.gap; // 複製品緊接在原片段後面
  return { items: relayout([...items.slice(0, i + 1), copy, ...items.slice(i + 1)]), newId: copy.id };
}

export function removeItem(items: VideoItem[], id: string): VideoItem[] {
  return relayout(items.filter((x) => x.id !== id));
}

export function moveItem(items: VideoItem[], id: string, toIndex: number): VideoItem[] {
  const from = items.findIndex((x) => x.id === id);
  if (from < 0) return items;
  const to = Math.min(Math.max(toIndex, 0), items.length - 1);
  if (from === to) return items;
  const next = items.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it!);
  return relayout(next);
}

/** 修剪尾端：把片段長度改成 newDuration（受素材長度與最短長度限制） */
export function trimEnd(
  items: VideoItem[],
  id: string,
  newDuration: number,
  asset: Asset | undefined,
): VideoItem[] {
  return relayout(
    items.map((it) => {
      if (it.id !== id) return it;
      const d = Math.min(Math.max(newDuration, MIN_CLIP_DURATION), maxDuration(it, asset));
      return { ...it, duration: d };
    }),
  );
}

/**
 * 修剪頭端（主軌）：delta 為正代表把起點往後切掉 delta 秒（時間軸秒數）。出點（尾巴）不動：
 * 切掉的部分變成前面的空白（gap），後面的片段不動。delta 為負＝往前拉回來：先吃掉前面的空白，
 * 用完空白還想往前，就把片段往前延伸（後面的片段被推開），最多到素材起點。
 */
export function trimStart(items: VideoItem[], id: string, delta: number): VideoItem[] {
  return relayout(
    items.map((it) => {
      if (it.id !== id) return it;
      const isImage = it.type === 'image';
      const maxCut = it.duration - MIN_CLIP_DURATION;
      const maxBack = isImage ? 600 : it.trimIn / it.speed; // 往前最多拉回素材起點
      const d = Math.min(Math.max(delta, -maxBack), maxCut);
      const gap = gapOf(it);
      const out: VideoItem = {
        ...it,
        duration: it.duration - d,
        trimIn: isImage ? 0 : it.trimIn + d * it.speed,
      };
      if (d >= 0)
        out.gap = gap + d; // 切掉的變空白
      else out.gap = Math.max(gap + d, 0); // 先吃掉空白；超過的部分是往前延伸（後面被推開）
      if (!out.gap) delete out.gap;
      return out;
    }),
  );
}

/**
 * 修剪面板：直接指定素材要留的區段 [srcStart, srcEnd]（素材秒數）。片段的位置（含前面的空白）不變，
 * 長度跟著變，後面的片段順延（主軌）。照片沒有素材區段，不適用。
 */
export function setTrimWindow(
  items: VideoItem[],
  id: string,
  srcStart: number,
  srcEnd: number,
  asset: Asset | undefined,
): VideoItem[] {
  return relayout(
    items.map((it) => {
      if (it.id !== id || it.type === 'image' || !asset) return it;
      const minSrc = MIN_CLIP_DURATION * it.speed;
      const s0 = Math.min(Math.max(srcStart, 0), Math.max(asset.duration - minSrc, 0));
      const e0 = Math.min(Math.max(srcEnd, s0 + minSrc), asset.duration);
      return { ...it, trimIn: s0, duration: (e0 - s0) / it.speed };
    }),
  );
}

/** 同上，給疊加軌：片段的開始時間不變，長度不能壓到後面的物件 */
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

/** 改速度：保持素材區段不變，時間軸長度跟著變 */
export function setSpeed(items: VideoItem[], id: string, speed: number): VideoItem[] {
  const s = Math.min(Math.max(speed, MIN_SPEED), MAX_SPEED);
  return relayout(
    items.map((it) => {
      if (it.id !== id || it.type === 'image') return it;
      const span = it.duration * it.speed;
      return { ...it, speed: s, duration: Math.max(span / s, MIN_CLIP_DURATION) };
    }),
  );
}

export function formatTime(t: number): string {
  const s = Math.max(t, 0);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}

// ---------- 疊加 / 文字軌：自由放置（不 ripple），同一軌的物件不能重疊 ----------

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
    if (isVideoItem(it) && it.type === 'video') lo = Math.max(lo, -it.trimIn / it.speed);
    const hi = it.duration - MIN_CLIP_DURATION;
    const d = Math.min(Math.max(delta, lo), hi);
    const next = { ...it, start: it.start + d, duration: it.duration - d };
    if (isVideoItem(it) && it.type === 'video') (next as VideoItem).trimIn = it.trimIn + d * it.speed;
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

/** 交換圖層順序（dir = +1 往上層）。主軌固定在最底層。 */
export function moveTrack(tracks: Track[], id: string, dir: -1 | 1): Track[] {
  const i = tracks.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 1 || j < 1 || j >= tracks.length) return tracks;
  const next = tracks.slice();
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** 在哪一條同類型軌道的 [start, start+duration) 是空的；找不到回傳 -1（呼叫端要新增軌道） */
export function firstFreeTrack(p: Project, kind: Track['kind'], start: number, duration: number): number {
  return p.tracks.findIndex((t) => t.kind === kind && !t.locked && canPlace(t.items, start, duration));
}
