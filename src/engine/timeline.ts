import { MAX_SPEED, MIN_CLIP_DURATION, MIN_SPEED, newId } from '../model/defaults';
import type { Asset, Project, Track, VideoItem } from '../model/types';

/** 主軌片段首尾相接：依序重算 start。回傳新陣列（不改原物件）。 */
export function relayout(items: VideoItem[]): VideoItem[] {
  let t = 0;
  return items.map((it) => {
    const out = it.start === t ? it : { ...it, start: t };
    t += it.duration;
    return out;
  });
}

export function mainTrack(p: Project): Track {
  const t = p.tracks.find((x) => x.kind === 'main');
  if (!t) throw new Error('專案沒有主軌');
  return t;
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
  return relayout([...items.slice(0, i), a, b, ...items.slice(i + 1)]);
}

export function duplicateItem(items: VideoItem[], id: string): { items: VideoItem[]; newId: string } | null {
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const copy: VideoItem = { ...items[i]!, id: newId('i_') };
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

/** 修剪頭端：delta 為正代表把起點往後切掉 delta 秒（時間軸秒數）。出點不變。 */
export function trimStart(items: VideoItem[], id: string, delta: number): VideoItem[] {
  return relayout(
    items.map((it) => {
      if (it.id !== id) return it;
      // 往前延伸最多到素材起點；往後最多切到剩 MIN_CLIP_DURATION
      const minDelta = it.type === 'image' ? -600 : -it.trimIn / it.speed;
      const maxDelta = it.duration - MIN_CLIP_DURATION;
      const d = Math.min(Math.max(delta, minDelta), maxDelta);
      return {
        ...it,
        duration: it.duration - d,
        trimIn: it.type === 'image' ? 0 : it.trimIn + d * it.speed,
      };
    }),
  );
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
