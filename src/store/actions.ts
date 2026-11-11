import type { Draft } from 'immer';
import { createOverlayClip, createTextItem, createTrack } from '../model/defaults';
import type { Asset, Item, TextItem, Track, Transform, VideoItem } from '../model/types';
import {
  duplicateFree,
  duplicateItem,
  findItem,
  findFreeStart,
  firstFreeTrack,
  isVideoItem,
  mainTrack,
  moveTrack,
  relayout,
  removeItem,
  splitFree,
  splitItem,
} from '../engine/timeline';
import { useProjectStore } from './projectStore';

const store = () => useProjectStore.getState();

type Opts = { coalesce?: string; select?: string | null };

/** 改某個物件（任何軌道）的欄位。recipe 直接改草稿。 */
export function editItem(id: string, recipe: (it: Draft<Item>) => void, opts?: Opts) {
  store().apply((d) => {
    for (const tr of d.tracks) {
      const it = tr.items.find((x) => x.id === id);
      if (it) {
        recipe(it);
        return;
      }
    }
  }, opts);
}

export function setTransform(id: string, patch: Partial<Transform>, coalesce = `tf:${id}`) {
  editItem(
    id,
    (it) => {
      Object.assign(it.transform, patch);
    },
    { coalesce },
  );
}

/** 把一群疊加素材放在 t 秒：各自放進第一條有空位的疊加軌，沒有就新增一條（所以會疊在同一秒） */
export function addOverlayClips(assets: Asset[], t: number): string | null {
  if (assets.length === 0) return null;
  let firstId: string | null = null;
  store().apply((d) => {
    for (const asset of assets) {
      const clip = createOverlayClip(asset, t);
      let ti = firstFreeTrack(d as never, 'overlay', clip.start, clip.duration);
      if (ti < 0) {
        d.tracks.push(createTrack('overlay', d.tracks as Track[]));
        ti = d.tracks.length - 1;
      }
      d.tracks[ti]!.items.push(clip);
      firstId ??= clip.id;
    }
  });
  if (firstId) store().select(firstId);
  return firstId;
}

export function addText(t: number): string {
  const item = createTextItem(t);
  store().apply((d) => {
    let ti = firstFreeTrack(d as never, 'text', item.start, item.duration);
    if (ti < 0) {
      d.tracks.push(createTrack('text', d.tracks as Track[]));
      ti = d.tracks.length - 1;
    }
    d.tracks[ti]!.items.push(item);
  });
  store().select(item.id);
  return item.id;
}

export function editText(id: string, recipe: (card: Draft<TextItem['card']>) => void, opts?: Opts) {
  editItem(
    id,
    (it) => {
      if (it.type === 'text') recipe(it.card);
    },
    opts,
  );
}

export function removeAnyItem(id: string): boolean {
  const p = store().project;
  const f = p && findItem(p, id);
  if (!p || !f) return false;
  store().apply(
    (d) => {
      const tr = d.tracks[f.trackIndex]!;
      tr.items = (
        f.track.kind === 'main'
          ? removeItem(tr.items as VideoItem[], id)
          : tr.items.filter((x) => x.id !== id)
      ) as never;
    },
    { select: null },
  );
  return true;
}

export function splitAny(id: string, t: number): string | null {
  const p = store().project;
  const f = p && findItem(p, id);
  if (!p || !f) return null;
  const out =
    f.track.kind === 'main'
      ? splitItem(f.track.items as VideoItem[], id, t)
      : splitFree(f.track.items, id, t);
  if (!out) return null;
  const right = out[out.findIndex((x) => x.id === id) + 1]!;
  store().apply(
    (d) => {
      d.tracks[f.trackIndex]!.items = out as never;
    },
    { select: right.id },
  );
  return right.id;
}

export function duplicateAny(id: string): boolean {
  const p = store().project;
  const f = p && findItem(p, id);
  if (!p || !f) return false;
  const r =
    f.track.kind === 'main'
      ? duplicateItem(f.track.items as VideoItem[], id)
      : duplicateFree(f.track.items, id);
  if (!r) return false;
  store().apply(
    (d) => {
      d.tracks[f.trackIndex]!.items = r.items as never;
    },
    { select: r.newId },
  );
  return true;
}

export function patchTrack(
  trackId: string,
  patch: Partial<Pick<Track, 'hidden' | 'locked' | 'muted' | 'name'>>,
) {
  store().apply((d) => {
    const tr = d.tracks.find((t) => t.id === trackId);
    if (tr) Object.assign(tr, patch);
  });
}

export function shiftTrackLayer(trackId: string, dir: -1 | 1) {
  store().apply((d) => {
    d.tracks = moveTrack(d.tracks as Track[], trackId, dir) as never;
  });
}

export function removeTrack(trackId: string) {
  store().apply(
    (d) => {
      const i = d.tracks.findIndex((t) => t.id === trackId);
      if (i > 0) d.tracks.splice(i, 1); // 主軌（0）不能刪
    },
    { select: null },
  );
}

/** 疊加影片/照片、文字物件放到新位置（自由放置，避開同軌其他物件） */
export function placeItem(id: string, start: number, opts?: Opts) {
  const p = store().project;
  const f = p && findItem(p, id);
  if (!p || !f || f.track.kind === 'main') return;
  const s = findFreeStart(f.track.items, start, f.item.duration, id);
  editItem(id, (it) => void (it.start = s), opts);
}

export { isVideoItem, mainTrack, relayout };
