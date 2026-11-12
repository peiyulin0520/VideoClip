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
import {
  TEXT_STYLE_KEYS,
  type Aspect,
  type Asset,
  type Item,
  type Project,
  type TextItem,
  type TextRun,
  type TextStyle,
  type Track,
  type Transform,
  type VideoItem,
} from '../model/types';
import {
  baseMediaTrack,
  duplicateFree,
  type DropTarget,
  type Range,
  findItem,
  findFreeStart,
  firstFreeTrack,
  insertIndexFor,
  isVideoItem,
  mediaItems,
  moveItemToTrack,
  moveTrack,
  placeSequential,
  reorderTrack,
  rippleDelete,
  splitByRanges,
  splitFree,
  totalDuration,
  trackEnd,
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

/** 幫物件命名（空字串＝恢復預設名稱）；一步復原 */
export function renameItem(id: string, label: string) {
  editItem(id, (it) => {
    if (label.trim()) it.label = label.trim();
    else delete it.label;
  });
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
      const ti = trackIndexFor(d.tracks as Track[], 'media', clip.start, clip.duration);
      d.tracks[ti]!.items.push(clip);
      firstId ??= clip.id;
    }
  });
  if (firstId) store().select(firstId);
  return firstId;
}

/** 同種類軌道裡第一條放得下的；沒有就在那一區的最上面新增一條（會直接改傳進來的軌道陣列），回傳 index */
export function trackIndexFor(tracks: Track[], kind: Track['kind'], start: number, duration: number): number {
  const ti = firstFreeTrack({ tracks } as never, kind, start, duration);
  if (ti >= 0) return ti;
  const at = insertIndexFor(tracks, kind);
  tracks.splice(at, 0, createTrack(kind, tracks));
  return at;
}

/**
 * 匯入的影片／照片接在最下面那條影像軌的最後面（等於以前的「主軌」）；回傳新片段開始的時間。
 * 專案裡還沒有任何影像、而且比例是「自動」：照第一個素材的形狀決定專案比例。不自動選取。
 */
export function importToBase(assets: Asset[], clips: VideoItem[]): number {
  let startOfNew = 0;
  store().apply((d) => {
    for (const a of assets) if (!d.assets.some((x) => x.id === a.id)) d.assets.push(a);
    let tr = baseMediaTrack(d as never);
    if (!tr) {
      d.tracks.splice(
        insertIndexFor(d.tracks as Track[], 'media'),
        0,
        createTrack('media', d.tracks as Track[]),
      );
      tr = baseMediaTrack(d as never)!;
    }
    const noMediaYet = mediaItems(d as never).length === 0;
    const first = assets[0];
    if (d.aspectAuto && noMediaYet && first) assignAspect(d, pickAspect(first.width, first.height), true);
    startOfNew = trackEnd(tr.items);
    tr.items.push(...(placeSequential(clips, startOfNew) as never[]));
  });
  return startOfNew;
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
      const ti = trackIndexFor(d.tracks as Track[], 'audio', clip.start, clip.duration);
      d.tracks[ti]!.items.push(clip);
      firstId ??= clip.id;
    }
  });
  if (firstId) store().select(firstId);
  return firstId;
}

/** 影片的軌道（影像軌）是不是全部靜音了 */
export function videoTracksMuted(p: Project): boolean {
  const tracks = p.tracks.filter((t) => t.kind === 'media' && t.items.length > 0);
  return tracks.length > 0 && tracks.every((t) => !!t.muted);
}

/** 一鍵把所有影片（影像軌）的聲音關掉／恢復；背景音樂不受影響。一步復原。 */
export function setAllVideoMuted(muted: boolean) {
  store().apply((d) => {
    for (const t of d.tracks) if (t.kind === 'media') t.muted = muted;
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
      const tr = createTrack('media', d.tracks as Track[]);
      tr.items.push(item);
      d.tracks.splice(insertIndexFor(d.tracks as Track[], 'media'), 0, tr);
      firstId ??= item.id;
    }
    const frame = createOverlayClip(o.frame, o.start);
    frame.duration = o.duration;
    frame.fit = 'contain';
    frame.transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 };
    frame.group = group;
    const ft = createTrack('media', d.tracks as Track[]);
    ft.name = o.frameName;
    ft.locked = true;
    ft.items.push(frame);
    d.tracks.splice(insertIndexFor(d.tracks as Track[], 'media'), 0, ft);
  });
  if (firstId) store().select(firstId);
  return firstId;
}

/** 刪掉整個版型（同一個 group 的外框與所有格子），空掉的軌道一起拿掉；一步復原 */
export function removeGroup(group: string) {
  store().apply(
    (d) => {
      for (const t of d.tracks) t.items = t.items.filter((x) => (x as VideoItem).group !== group) as never;
      // 空掉的軌道拿掉；至少留一條影像軌
      const keep = d.tracks.find((t) => t.kind === 'media')?.id;
      d.tracks = d.tracks.filter((t) => t.id === keep || t.items.length > 0) as never;
    },
    { select: null },
  );
}

export function addText(t: number, shape = false): string {
  const item = shape ? createShapeItem(t) : createTextItem(t);
  store().apply((d) => {
    // 新文字沿用上一次的樣式（字體、大小、顏色、透明度、描邊、陰影…），內容與位置照預設
    if (!shape && d.lastTextStyle)
      Object.assign(item.card.runs[0]!, JSON.parse(JSON.stringify(d.lastTextStyle)) as TextStyle);
    const ti = trackIndexFor(d.tracks as Track[], 'text', item.start, item.duration);
    d.tracks[ti]!.items.push(item);
  });
  store().select(item.id);
  return item.id;
}

/** 這個字的樣式欄位（複製一份，不含文字內容、位置、字塊、裝飾） */
export function pickTextStyle(run: TextRun): TextStyle {
  const out: Record<string, unknown> = {};
  for (const k of TEXT_STYLE_KEYS) if (run[k] !== undefined) out[k] = JSON.parse(JSON.stringify(run[k]));
  return out as TextStyle;
}

export function editText(id: string, recipe: (card: Draft<TextItem['card']>) => void, opts?: Opts) {
  store().apply((d) => {
    for (const tr of d.tracks) {
      const it = tr.items.find((x) => x.id === id);
      if (!it) continue;
      if (it.type === 'text') {
        recipe(it.card);
        const run = it.card.runs[0];
        // 獨立圖形（沒有文字）的樣式不算
        if (run && run.text !== '') d.lastTextStyle = pickTextStyle(run as TextRun);
      }
      return;
    }
  }, opts);
}

/** 把這個字卡的樣式複製到專案裡所有其他的文字（不動內容、位置、字塊、裝飾）；回傳套用了幾個。一步復原 */
export function applyTextStyleToAll(id: string): number {
  const p = store().project;
  const f = p && findItem(p, id);
  if (!p || !f || f.item.type !== 'text') return 0;
  const style = pickTextStyle(f.item.card.runs[0]!);
  let n = 0;
  store().apply((d) => {
    for (const tr of d.tracks)
      for (const it of tr.items) {
        if (it.type !== 'text' || it.id === id || it.card.runs[0]?.text === '') continue;
        for (const run of it.card.runs) {
          for (const k of TEXT_STYLE_KEYS) {
            if (style[k] === undefined) delete (run as Record<string, unknown>)[k];
            else (run as Record<string, unknown>)[k] = JSON.parse(JSON.stringify(style[k]));
          }
        }
        n++;
      }
    d.lastTextStyle = style;
  });
  return n;
}

export function removeAnyItem(id: string): boolean {
  const p = store().project;
  const f = p && findItem(p, id);
  if (!p || !f) return false;
  store().apply(
    (d) => {
      const tr = d.tracks[f.trackIndex]!;
      tr.items = tr.items.filter((x) => x.id !== id) as never;
    },
    { select: null },
  );
  return true;
}

/** 補齊空位：這條軌道在 [from, to) 空位後面的物件整個往前移（to - from）秒 */
export function closeGap(trackId: string, from: number, to: number) {
  store().apply((d) => {
    const tr = d.tracks.find((t) => t.id === trackId);
    if (!tr) return;
    const len = to - from;
    for (const it of tr.items) if (it.start >= to - 1e-6) it.start = Math.max(it.start - len, 0);
  });
}

/** 刪除並補齊：同一軌在它後面的物件整個往前移，填掉空位 */
export function rippleRemoveItem(id: string): boolean {
  const p = store().project;
  const f = p && findItem(p, id);
  if (!p || !f) return false;
  store().apply(
    (d) => {
      d.tracks[f.trackIndex]!.items = rippleDelete(d.tracks[f.trackIndex]!.items as Item[], id) as never;
    },
    { select: null },
  );
  return true;
}

export function splitAny(id: string, t: number): string | null {
  const p = store().project;
  const f = p && findItem(p, id);
  if (!p || !f) return null;
  const out = splitFree(f.track.items, id, t);
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
  const r = duplicateFree(f.track.items, id);
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
      const medias = d.tracks.filter((t) => t.kind === 'media');
      if (i < 0 || (d.tracks[i]!.kind === 'media' && medias.length <= 1)) return; // 至少留一條影像軌
      d.tracks.splice(i, 1);
    },
    { select: null },
  );
}

/**
 * 把物件搬到另一條軌道（同種類）或新增的軌道，並放在 start 秒（那裡有東西就移到最近的空位）。
 * 種類不符回傳 false。一步復原。原軌道空了也不自動刪掉。
 */
export function moveItemTo(id: string, target: DropTarget, start: number): boolean {
  const p = store().project;
  if (!p) return false;
  const next = moveItemToTrack(p.tracks, id, target, start, createTrack);
  if (!next) return false;
  store().apply((d) => {
    d.tracks = next as never;
  });
  return true;
}

/**
 * 修剪面板按「完成」：影片／音樂依標的幾段留下來。一段＝修剪；多段＝拆成多個物件，
 * 每段留在原本的時間位置（不要的地方變空位；位置被占住就移到最近的空位）。回傳第一段的 id，一步復原。
 */
export function applyRanges(itemId: string, ranges: Range[]): string | null {
  const p = store().project;
  const f = p && findItem(p, itemId);
  if (!p || !f || !isVideoItem(f.item) || f.item.type === 'image') return null;
  const asset = p.assets.find((a) => a.id === (f.item as VideoItem).assetId);
  if (!asset) return null;
  const pieces = splitByRanges(f.item, ranges, asset.duration);
  if (pieces.length === 0) return null;
  store().apply(
    (d) => {
      const tr = d.tracks[f.trackIndex]!;
      const placed: Item[] = tr.items.filter((x) => x.id !== itemId) as Item[];
      for (const piece of pieces) {
        piece.start = findFreeStart(placed, piece.start, piece.duration);
        placed.push(piece);
      }
      tr.items = placed as never;
    },
    { select: pieces[0]!.id },
  );
  return pieces[0]!.id;
}

/** 物件放到新位置（自由放置，避開同軌其他物件） */
export function placeItem(id: string, start: number, opts?: Opts) {
  const p = store().project;
  const f = p && findItem(p, id);
  if (!p || !f) return;
  const s = findFreeStart(f.track.items, start, f.item.duration, id);
  editItem(id, (it) => void (it.start = s), opts);
}

export { isVideoItem };

/**
 * 改專案比例。choice='auto'＝照第一個影片／照片的形狀決定，並維持「自動」（沒有片段就維持現在的比例）。
 * 手動選比例後 aspectAuto 會關掉。可以復原。
 */
export function setProjectAspect(choice: Aspect | 'auto'): Aspect | null {
  const p = store().project;
  if (!p) return null;
  let aspect: Aspect;
  if (choice === 'auto') {
    const first = mediaItems(p)[0];
    const asset = first && p.assets.find((a) => a.id === first.assetId);
    aspect = asset ? pickAspect(asset.width, asset.height) : p.aspect;
  } else aspect = choice;
  store().apply((d) => {
    assignAspect(d, aspect, choice === 'auto');
  });
  return aspect;
}
