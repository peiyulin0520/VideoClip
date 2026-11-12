import type { Draft } from 'immer';
import {
  assignAspect,
  createAudioClip,
  createOverlayClip,
  createShapeItem,
  createTextItem,
  createTrack,
  newId,
  pickAspect,
} from '../model/defaults';
import type { Aspect, Asset, Item, Project, TextItem, Track, Transform, VideoItem } from '../model/types';
import {
  duplicateFree,
  duplicateItem,
  findItem,
  findFreeStart,
  firstFreeTrack,
  isVideoItem,
  mainItems,
  mainTrack,
  moveTrack,
  relayout,
  removeItem,
  reorderTrack,
  splitFree,
  splitItem,
  totalDuration,
} from '../engine/timeline';
import { cellItem, type Rect } from '../engine/layouts';
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
/** scale：預設大小（貼圖用比較小的 0.3）；整個加入是一步復原 */
export function addOverlayClips(assets: Asset[], t: number, opts: { scale?: number } = {}): string | null {
  if (assets.length === 0) return null;
  let firstId: string | null = null;
  store().apply((d) => {
    // 素材和片段在同一步加入（一次復原就整個拿掉）；已經在專案裡的素材不重複加
    for (const asset of assets) if (!d.assets.some((a) => a.id === asset.id)) d.assets.push(asset);
    for (const asset of assets) {
      const clip = createOverlayClip(asset, t);
      if (opts.scale) clip.transform.scale = opts.scale;
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

/** 背景音樂：放在播放頭這一秒（最長到專案結束），放在音樂軌；同一時間有別的音樂就開新的音樂軌 */
export function addMusic(assets: Asset[], t: number): string | null {
  if (assets.length === 0) return null;
  const total = totalDuration(store().project!);
  let firstId: string | null = null;
  store().apply((d) => {
    for (const asset of assets) if (!d.assets.some((a) => a.id === asset.id)) d.assets.push(asset);
    for (const asset of assets) {
      const start = Math.min(Math.max(t, 0), Math.max(total - 0.5, 0));
      const dur = Math.max(Math.min(asset.duration, total - start), 0.5);
      const clip = createAudioClip(asset, start, dur);
      let ti = firstFreeTrack(d as never, 'audio', clip.start, clip.duration);
      if (ti < 0) {
        d.tracks.push(createTrack('audio', d.tracks as Track[]));
        ti = d.tracks.length - 1;
      }
      d.tracks[ti]!.items.push(clip);
      firstId ??= clip.id;
    }
  });
  if (firstId) store().select(firstId);
  return firstId;
}

/** 影片的軌道（主軌、疊加）是不是全部靜音了 */
export function videoTracksMuted(p: Project): boolean {
  const tracks = p.tracks.filter((t) => (t.kind === 'main' || t.kind === 'overlay') && t.items.length > 0);
  return tracks.length > 0 && tracks.every((t) => !!t.muted);
}

/** 一鍵把所有影片（主軌、疊加）的聲音關掉／恢復；背景音樂不受影響。一步復原。 */
export function setAllVideoMuted(muted: boolean) {
  store().apply((d) => {
    for (const t of d.tracks) if (t.kind === 'main' || t.kind === 'overlay') t.muted = muted;
  });
}

/**
 * 加一個多格版型：每一格一個疊加物件（各自一條軌道，放在下面）＋最上面一條鎖住的外框軌道（外框是有洞的 PNG）。
 * 外框鎖住是為了點預覽時點得到下面的格子（要動外框，到軌道選單解鎖）。一步復原整個拿掉。
 */
export function addLayout(o: {
  cells: { asset: Asset; win: Rect }[];
  frame: Asset;
  start: number;
  duration: number;
  frameName: string;
}): string | null {
  const proj = store().project;
  if (!proj || o.cells.length === 0) return null;
  const { width: W, height: H } = proj;
  const group = newId('g_');
  let firstId: string | null = null;
  store().apply((d) => {
    for (const a of [...o.cells.map((c) => c.asset), o.frame])
      if (!d.assets.some((x) => x.id === a.id)) d.assets.push(a);
    for (const c of o.cells) {
      const dur = c.asset.kind === 'image' ? o.duration : Math.min(c.asset.duration, o.duration);
      const item = cellItem(c.asset, c.win, W, H, o.start, dur, group);
      const tr = createTrack('overlay', d.tracks as Track[]);
      tr.items.push(item);
      d.tracks.push(tr);
      firstId ??= item.id;
    }
    const frame = createOverlayClip(o.frame, o.start);
    frame.duration = o.duration;
    frame.fit = 'contain';
    frame.transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 };
    frame.group = group;
    const ft = createTrack('overlay', d.tracks as Track[]);
    ft.name = o.frameName;
    ft.locked = true;
    ft.items.push(frame);
    d.tracks.push(ft);
  });
  if (firstId) store().select(firstId);
  return firstId;
}

/** 刪掉整個版型（同一個 group 的外框與所有格子），空掉的軌道一起拿掉；一步復原 */
export function removeGroup(group: string) {
  store().apply(
    (d) => {
      for (const t of d.tracks) t.items = t.items.filter((x) => (x as VideoItem).group !== group) as never;
      d.tracks = d.tracks.filter((t, i) => i === 0 || t.items.length > 0) as never;
    },
    { select: null },
  );
}

export function addText(t: number, shape = false): string {
  const item = shape ? createShapeItem(t) : createTextItem(t);
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

/** 直接把軌道搬到新的圖層位置（拖時間軸左邊的軌道圖示）；一步復原 */
export function moveTrackTo(trackId: string, toIndex: number) {
  store().apply((d) => {
    d.tracks = reorderTrack(d.tracks as Track[], trackId, toIndex) as never;
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

/**
 * 改專案比例。choice='auto'＝照主軌第一個片段的形狀決定，並維持「自動」（沒有片段就維持現在的比例）。
 * 手動選比例後 aspectAuto 會關掉。可以復原。
 */
export function setProjectAspect(choice: Aspect | 'auto'): Aspect | null {
  const p = store().project;
  if (!p) return null;
  let aspect: Aspect;
  if (choice === 'auto') {
    const first = mainItems(p)[0];
    const asset = first && p.assets.find((a) => a.id === first.assetId);
    aspect = asset ? pickAspect(asset.width, asset.height) : p.aspect;
  } else aspect = choice;
  store().apply((d) => {
    assignAspect(d, aspect, choice === 'auto');
  });
  return aspect;
}
