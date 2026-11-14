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
  type Adjust,
  type Asset,
  type EffectKind,
  type LookRef,
  type Item,
  type Project,
  type TextFxKind,
  type TextItem,
  type TextRun,
  type TextStyle,
  type Track,
  type Transform,
  type TransitionKind,
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
  mergeTracksByIds,
  moveItemToTrack,
  moveTrack,
  moveTracksBy,
  placeSequential,
  removeTracksByIds,
  reorderTrack,
  rippleDelete,
  splitByRanges,
  splitFree,
  totalDuration,
  trackEnd,
} from '../engine/timeline';
import { cellItem, inkFor, type LayoutText, type Rect } from '../engine/layouts';
import { DEFAULT_EFFECT_DURATION, DEFAULT_TRANSITION_DURATION, seamsOf } from '../engine/transitions';
import { groupPatch, transformAbout } from '../engine/groupTransform';
import { DEFAULT_PULSE, type Pulse } from '../engine/pulse';
import {
  hasKeyframes,
  KEYFRAME_EPS,
  keyframeIndexAt,
  keyframeNear,
  removeKeyframe,
  timeResolved,
  upsertKeyframe,
  usesKeyframeLook,
  withTime,
} from '../engine/keyframes';
import { useProjectStore } from './projectStore';
import { toast, useUI } from './uiStore';

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

/**
 * 把影片的原音分離成音樂軌上的一段（同一個素材、同樣的起點、長度、速度、音量與淡入淡出），
 * 影片本身改成靜音。之後可以單獨移動、修剪、刪除這段聲音。回傳新的音訊物件 id；沒有聲音的影片回傳 null。一步復原。
 */
export function separateAudio(id: string): string | null {
  const p = store().project;
  const f = p && findItem(p, id);
  if (!p || !f || f.item.type !== 'video') return null;
  const asset = p.assets.find((a) => a.id === (f.item as VideoItem).assetId);
  if (!asset?.hasAudio) return null;
  let audioId = '';
  store().apply((d) => {
    const v = d.tracks[f.trackIndex]!.items.find((x) => x.id === id) as VideoItem;
    const audio = JSON.parse(JSON.stringify(v)) as VideoItem;
    audio.id = newId('i_');
    audio.type = 'audio';
    audio.fit = 'contain';
    audio.label = v.label ? `${v.label} 原音` : '原音';
    delete audio.crop;
    delete audio.mask;
    delete audio.cell;
    delete audio.group;
    delete audio.maskBitmap;
    delete audio.transitionIn;
    delete audio.inEffect;
    delete audio.outEffect;
    v.volume = 0;
    const ti = trackIndexFor(d.tracks as Track[], 'audio', audio.start, audio.duration);
    d.tracks[ti]!.items.push(audio);
    audioId = audio.id;
  });
  return audioId || null;
}

/** 幫物件命名（空字串＝恢復預設名稱）；一步復原 */
export function renameItem(id: string, label: string) {
  editItem(id, (it) => {
    if (label.trim()) it.label = label.trim();
    else delete it.label;
  });
}

/**
 * 位置、大小、旋轉歸位。版型的任何物件＝整個版型歸位（外框回到正中央、原大小）；
 * 最下面那條影像軌的片段與字卡回到滿版／原大小，疊在上面的（畫中畫）預設縮小一半。
 */
export function resetTransform(id: string): void {
  const p = store().project;
  const f = p && findItem(p, id);
  if (!p || !f) return;
  if (f.item.type !== 'audio' && f.item.group) {
    const frame = groupFrame(p, f.item.group);
    if (frame) return setTransform(frame.item.id, { x: 0.5, y: 0.5, scale: 1, rotation: 0 }, `reset:${id}`);
  }
  const scale = f.item.type === 'text' || f.track.id === baseMediaTrack(p)?.id ? 1 : 0.5;
  if (hasKeyframes(f.item)) return setTransform(id, { x: 0.5, y: 0.5, scale, rotation: 0 }, `reset:${id}`);
  editItem(id, (x) => {
    x.transform.x = 0.5;
    x.transform.y = 0.5;
    x.transform.scale = scale;
    x.transform.rotation = 0;
  });
}

/** 版型（同一個 group）的外框與各格：外框的 transform 就是整組的 transform */
function groupFrame(p: Project, group: string): { item: VideoItem; track: Track } | null {
  for (const track of p.tracks)
    for (const item of track.items)
      if (item.type !== 'text' && item.group === group && (track.groupRole === 'frame' || !item.cell))
        return { item: item as VideoItem, track };
  return null;
}

function groupItems(p: Project, group: string): VideoItem[] {
  return p.tracks
    .flatMap((t) => t.items)
    .filter((i): i is VideoItem => i.type !== 'text' && i.group === group);
}

/** 播放頭在這個物件自己的時間裡的位置（夾在 0～長度之間）；定格（關鍵影格）用 */
function localTime(it: Item): number {
  const t = useUI.getState().player?.time ?? 0;
  return Math.min(Math.max(t - it.start, 0), it.duration);
}

/** 播放線碰到定格菱形的範圍（CSS px，菱形的一半寬） */
const KF_HIT_PX = 8;

/**
 * 定格要改的時間（物件自己的秒）：播放線碰到某個定格的菱形 → 那個定格的時間；沒碰到 → 播放線的位置（會新增一個）。
 */
export function keyframeLocal(it: Item): number {
  const local = localTime(it);
  const pps = useUI.getState().timelinePps || 40;
  const i = keyframeNear(it, local, KF_HIT_PX / pps);
  return i >= 0 ? it.keyframes![i]!.t : local;
}

/** 色調分頁的「套用到」：沒有定格＝整段素材；有定格＝預設「這個定格」，使用者可以改成「整段素材」 */
export function gradeScopeOf(target: Item): 'item' | 'key' {
  if (!hasKeyframes(target)) return 'item';
  const o = useUI.getState().gradeScope;
  return o && o.id === target.id ? o.scope : 'key';
}

export function setTransform(id: string, patch: Partial<Transform>, coalesce = `tf:${id}`) {
  const p = store().project;
  const f = p && findItem(p, id);
  const frame = p && f && f.item.type !== 'audio' && f.item.group ? groupFrame(p, f.item.group) : null;
  if (p && f && frame && f.item.type !== 'audio') {
    // 版型裡的任何物件：移動、縮放、旋轉都變成「整組」一起動（格子不會單獨跑掉）
    const group = f.item.group!;
    if (hasKeyframes(frame.item)) {
      // 外框有定格：改的是播放頭這個時間的定格（整組一起動，各格由外框算出來，不用動）
      const t = useUI.getState().player?.time ?? 0;
      const pr = timeResolved(p, t);
      const rf = groupFrame(pr, group);
      const rm = findItem(pr, id);
      if (!rf || !rm) return;
      const T1 = groupPatch(rf.item.transform, rm.item.transform, patch);
      editItem(
        frame.item.id,
        (it) => {
          it.keyframes = upsertKeyframe(it, keyframeLocal(it), T1);
        },
        { coalesce },
      );
      return;
    }
    const T0 = frame.item.transform;
    const T1 = groupPatch(T0, f.item.transform, patch);
    const W = p.width;
    const H = p.height;
    store().apply(
      (d) => {
        for (const track of d.tracks)
          for (const it of track.items) {
            if (it.type === 'audio' || it.group !== group) continue;
            const op = patch.opacity ?? it.transform.opacity;
            it.transform =
              it.id === frame.item.id
                ? { ...T1 }
                : { ...transformAbout(it.transform as Transform, T0, T1, W, H), opacity: op };
            it.transform.opacity = op;
          }
      },
      { coalesce },
    );
    return;
  }
  editItem(
    id,
    (it) => {
      // 有定格：改的是播放頭這個時間的定格（沒有就自動新增一個）；沒有定格：改物件本身
      if (hasKeyframes(it as Item))
        it.keyframes = upsertKeyframe(it as Item, keyframeLocal(it as Item), patch);
      else Object.assign(it.transform, patch);
    },
    { coalesce },
  );
}

/** 定格（關鍵影格）作用的物件：版型裡的任何物件＝外框（整組一起動）；音樂沒有 */
export function keyframeTarget(p: Project, id: string | null): Item | null {
  const f = id ? findItem(p, id) : null;
  if (!f || f.item.type === 'audio') return null;
  if (f.item.group) return groupFrame(p, f.item.group)?.item ?? f.item;
  return f.item;
}

/** 播放頭這個時間有沒有定格：沒有就新增（值＝目前畫面上的樣子），有就刪掉。回傳做了什麼 */
export function toggleKeyframe(id: string): 'added' | 'removed' | null {
  const p = store().project;
  const target = p && keyframeTarget(p, id);
  if (!p || !target) return null;
  const local = localTime(target);
  const idx = keyframeIndexAt(target, local);
  const t = useUI.getState().player?.time ?? 0;
  if (t < target.start || t > target.start + target.duration + 1e-6) {
    toast('播放頭要在這個素材的時間範圍裡才能打定格');
    return null;
  }
  editItem(target.id, (it) => {
    if (idx >= 0) {
      const next = removeKeyframe(it as Item, idx);
      if (next.length) it.keyframes = next;
      else delete it.keyframes;
    } else it.keyframes = upsertKeyframe(it as Item, local, {});
  });
  return idx >= 0 ? 'removed' : 'added';
}

/** 刪除播放線碰到的那個定格（沒碰到什麼都不做）。回傳有沒有刪 */
export function deleteNearKeyframe(id: string): boolean {
  const p = store().project;
  const target = p && keyframeTarget(p, id);
  if (!p || !target || !hasKeyframes(target)) return false;
  const idx = keyframeNear(target, localTime(target), KF_HIT_PX / (useUI.getState().timelinePps || 40));
  if (idx < 0) return false;
  editItem(target.id, (it) => {
    const next = removeKeyframe(it as Item, idx);
    if (next.length) it.keyframes = next;
    else delete it.keyframes;
  });
  return true;
}

/**
 * 設定（或取消）播放線碰到的那個定格的小特效（震／彈／晃／跳）。回傳設定到的定格時間（物件自己的秒），沒碰到定格回傳 null。
 * patch 只改指定的欄位（沒有小特效時用預設值補齊）；null＝取消。
 */
export function setKeyframePulse(
  id: string,
  patch: Partial<Pulse> | null,
  coalesce?: string,
  /** 指定第幾個定格（試播中播放線不在定格上時用）；沒給就用播放線碰到的 */
  index?: number,
): number | null {
  const p = store().project;
  const target = p && keyframeTarget(p, id);
  if (!p || !target || !hasKeyframes(target)) return null;
  const idx =
    index ?? keyframeNear(target, localTime(target), KF_HIT_PX / (useUI.getState().timelinePps || 40));
  if (idx < 0 || !target.keyframes![idx]) return null;
  const at = target.keyframes![idx]!.t;
  editItem(
    target.id,
    (it) => {
      const k = it.keyframes![idx]!;
      if (patch === null) delete k.pulse;
      else k.pulse = { ...DEFAULT_PULSE, ...k.pulse, ...patch };
    },
    coalesce ? { coalesce } : undefined,
  );
  return at;
}

/** 清除全部定格：物件停在播放頭這個時間的樣子（畫面不跳）；一步復原 */
export function clearKeyframes(id: string): void {
  const p = store().project;
  const target = p && keyframeTarget(p, id);
  if (!p || !target || !hasKeyframes(target)) return;
  const t = useUI.getState().player?.time ?? 0;
  const now = withTime(target, t);
  editItem(target.id, (it) => {
    it.transform = { ...now.transform };
    it.adjust = now.adjust ? { ...now.adjust } : undefined;
    if (!it.adjust) delete it.adjust;
    if (usesKeyframeLook(target)) delete it.look; // 色調組合已經算進 adjust
    delete it.keyframes;
  });
}

/**
 * 色調（亮度、飽和度、色溫、色調）。有定格＝改播放頭這個時間的定格；沒有＝改物件本身（版型＝整組每個物件都改）。
 */
export function setAdjust(id: string, patch: Partial<Adjust>, coalesce = `adj:${id}`): void {
  const p = store().project;
  const target = p && keyframeTarget(p, id);
  if (!p || !target) return;
  if (hasKeyframes(target) && gradeScopeOf(target) === 'key') {
    editItem(
      target.id,
      (it) => {
        it.keyframes = upsertKeyframe(it as Item, keyframeLocal(it as Item), { adjust: patch });
      },
      { coalesce },
    );
    return;
  }
  const group = target.type !== 'audio' ? target.group : undefined;
  store().apply(
    (d) => {
      for (const track of d.tracks)
        for (const it of track.items) {
          if (it.id !== target.id && !(group && it.type !== 'audio' && it.group === group)) continue;
          it.adjust = { ...it.adjust, ...patch };
        }
    },
    { coalesce },
  );
}

/** 調色作用的物件：版型裡的任何物件＝整組（外框與各格）；其他是自己 */
function colorTargetIds(p: Project, id: string): string[] {
  const f = findItem(p, id);
  if (!f) return [];
  if (f.item.type !== 'audio' && f.item.group) {
    const group = f.item.group;
    return p.tracks
      .flatMap((t) => t.items)
      .filter((x) => x.type !== 'audio' && x.group === group)
      .map((x) => x.id);
  }
  return [id];
}

/** 設定（或取消）色調組合；amount 沒給就沿用原本的（新選的預設 1）。一步復原，拖強度滑桿會合併成一步 */
export function setLook(id: string, lookId: LookRef['id'] | null, amount?: number, coalesce?: string): void {
  const p = store().project;
  if (!p) return;
  const target = keyframeTarget(p, id);
  if (target && hasKeyframes(target) && gradeScopeOf(target) === 'key') {
    // 有定格：改的是播放線碰到（或這個時間新增）的定格；null＝這個定格明確用原色
    editItem(
      target.id,
      (it) => {
        const local = keyframeLocal(it as Item);
        const cur = (it.keyframes ?? []).find((k) => Math.abs(k.t - local) <= KEYFRAME_EPS);
        const prev = cur?.look === undefined ? it.look : cur.look;
        const look: LookRef | null = lookId
          ? { id: lookId, amount: amount ?? (prev?.id === lookId ? prev.amount : 1) }
          : null;
        it.keyframes = upsertKeyframe(it as Item, local, { look });
      },
      coalesce ? { coalesce } : undefined,
    );
    return;
  }
  const ids = new Set(colorTargetIds(p, id));
  store().apply(
    (d) => {
      for (const track of d.tracks)
        for (const it of track.items) {
          if (!ids.has(it.id) || it.type === 'audio') continue;
          if (!lookId) delete it.look;
          else it.look = { id: lookId, amount: amount ?? (it.look?.id === lookId ? it.look.amount : 1) };
        }
    },
    coalesce ? { coalesce } : undefined,
  );
}

/** 調色全部歸零：色調組合、手動調整、定格裡的調色都清掉（定格的位置大小不動）；一步復原 */
export function resetGrade(id: string): void {
  const p = store().project;
  if (!p) return;
  const ids = new Set(colorTargetIds(p, id));
  store().apply((d) => {
    for (const track of d.tracks)
      for (const it of track.items) {
        if (!ids.has(it.id)) continue;
        delete it.look;
        delete it.adjust;
        for (const k of it.keyframes ?? []) {
          delete k.adjust;
          delete k.look;
        }
      }
  });
}

/** 清掉定格上的調色（色調組合、手動調整），位置大小不動；從「這個定格」改成「整段素材」時用；一步復原 */
export function clearKeyframeGrade(id: string): void {
  const p = store().project;
  const target = p && keyframeTarget(p, id);
  if (!p || !target) return;
  editItem(target.id, (it) => {
    for (const k of it.keyframes ?? []) {
      delete k.adjust;
      delete k.look;
    }
  });
}

/** 定格上有沒有調色（色調組合或手動調整） */
export function keyframeHasGrade(it: Item): boolean {
  return !!it.keyframes?.some((k) => k.look !== undefined || (k.adjust && Object.keys(k.adjust).length > 0));
}

/** 把這個素材的調色（色調組合＋手動調整）套用到「同一類」的所有素材：字卡→所有字卡；影像、貼圖→所有影片、照片、貼圖。回傳套用了幾個 */
export function applyGradeToAll(id: string): number {
  const p = store().project;
  const f = p && findItem(p, id);
  if (!p || !f || f.item.type === 'audio') return 0;
  const src = f.item;
  const isText = src.type === 'text';
  let n = 0;
  store().apply((d) => {
    for (const track of d.tracks)
      for (const it of track.items) {
        if (it.type === 'audio' || it.id === id || (it.type === 'text') !== isText) continue;
        if (src.look) it.look = { ...src.look };
        else delete it.look;
        if (src.adjust) it.adjust = { ...src.adjust };
        else delete it.adjust;
        n++;
      }
  });
  return n;
}

/** 把一群疊加素材放在 t 秒：各自放進第一條有空位的疊加軌，沒有就新增一條（所以會疊在同一秒） */
/** scale：預設大小（貼圖用比較小的 0.3）；整個加入是一步復原 */
export function addOverlayClips(
  assets: Asset[],
  t: number,
  opts: { scale?: number; sticker?: boolean } = {},
): string | null {
  if (assets.length === 0) return null;
  let firstId: string | null = null;
  store().apply((d) => {
    // 素材和片段在同一步加入（一次復原就整個拿掉）；已經在專案裡的素材不重複加
    for (const asset of assets) {
      const have = d.assets.find((a) => a.id === asset.id);
      if (!have) d.assets.push(opts.sticker ? { ...asset, origin: 'sticker' } : asset);
      else if (opts.sticker) have.origin = 'sticker';
    }
    for (const asset of assets) {
      const clip = createOverlayClip(asset, t);
      if (opts.scale) clip.transform.scale = opts.scale;
      // 貼圖放貼圖軌（時間軸上自成一類「貼圖」），影片、照片放影像軌
      const ti = trackIndexFor(
        d.tracks as Track[],
        opts.sticker ? 'sticker' : 'media',
        clip.start,
        clip.duration,
      );
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
 * 加一個多格版型：每一格一個物件（各自一條軌道，放在下面；時間軸上藏起來）＋最上面一條外框軌道（外框是有洞的 PNG，
 * 在時間軸上代表整個版型）。它們共用同一個 group：一起縮放、移動、同一段時間；預覽上點到的是整個版型，
 * 再點一下格子才會選到那一格（可以個別選片段，但不能單獨縮放）。只有第 1 格預設出聲。一步復原整個拿掉。
 */
export function addLayout(o: {
  cells: { asset: Asset; win: Rect }[];
  frame: Asset;
  start: number;
  duration: number;
  frameName: string;
  /** 外框看得到的範圍（px，畫面座標）：選取框、點選範圍用它 */
  frameVisible?: Rect;
  motion?: 'drift' | 'slide';
  /** 整個版型的進場／出場特效（外框、各格、色塊一起） */
  inEffect?: TransitionKind;
  outEffect?: TransitionKind;
  /** 外框的樣式（之後改顏色、透明度要用它重畫外框） */
  frameStyle?: { layout: string; color: string; opacity: number };
  /** 版型附的文字（拍貼機的 PHOTO BOOTH…）：跟著整個版型一起動 */
  texts?: LayoutText[];
}): string | null {
  const proj = store().project;
  if (!proj || o.cells.length === 0) return null;
  const { width: W, height: H } = proj;
  const group = newId('g_');
  let firstId: string | null = null;
  store().apply((d) => {
    for (const a of [...o.cells.map((c) => c.asset), o.frame])
      if (!d.assets.some((x) => x.id === a.id)) d.assets.push(a);
    o.cells.forEach((c, i) => {
      const dur = c.asset.kind === 'image' ? o.duration : Math.min(c.asset.duration, o.duration);
      const item = cellItem(c.asset, c.win, W, H, o.start, dur, group);
      if (i > 0) item.volume = 0; // 只有第 1 格出聲
      const tr = createTrack('media', d.tracks as Track[]);
      tr.group = group;
      tr.groupRole = 'cell';
      tr.fill = 'black';
      tr.items.push(item);
      d.tracks.splice(insertIndexFor(d.tracks as Track[], 'media'), 0, tr);
      firstId ??= item.id;
    });
    const frame = createOverlayClip(o.frame, o.start);
    frame.duration = o.duration;
    frame.fit = 'contain';
    frame.transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 };
    frame.group = group;
    frame.label = o.frameName;
    if (o.frameStyle) frame.frameStyle = o.frameStyle;
    if (o.motion) frame.motion = o.motion;
    if (o.inEffect)
      frame.inEffect = { kind: o.inEffect, duration: Math.min(DEFAULT_EFFECT_DURATION, o.duration) };
    if (o.outEffect)
      frame.outEffect = { kind: o.outEffect, duration: Math.min(DEFAULT_EFFECT_DURATION, o.duration) };
    if (o.frameVisible)
      frame.visible = {
        x: o.frameVisible.x / W,
        y: o.frameVisible.y / H,
        w: o.frameVisible.w / W,
        h: o.frameVisible.h / H,
      };
    const ft = createTrack('media', d.tracks as Track[]);
    ft.name = o.frameName;
    ft.group = group;
    ft.groupRole = 'frame';
    ft.items.push(frame);
    d.tracks.splice(insertIndexFor(d.tracks as Track[], 'media'), 0, ft);
    // 版型的文字：普通的字卡，但 group 跟版型一樣——跟著整個版型移動、縮放、進出場，一起刪除
    const ink = inkFor(o.frameStyle?.color ?? '#ffffff');
    for (const lt of o.texts ?? []) {
      const ti = createTextItem(o.start, lt.text);
      ti.duration = o.duration;
      ti.group = group;
      ti.transform = { x: lt.x / W, y: lt.y / H, scale: 1, rotation: 0, opacity: 1 };
      const run = ti.card.runs[0]!;
      run.size = lt.size;
      run.fontId = lt.fontId;
      run.weight = lt.bold ? 'bold' : 'normal';
      run.letterSpacing = lt.letterSpacing;
      run.color = ink;
      run.lineHeight = 1.3;
      delete run.shadow;
      const ki = trackIndexFor(d.tracks as Track[], 'text', ti.start, ti.duration);
      d.tracks[ki]!.items.push(ti);
    }
  });
  if (firstId) store().select(firstId);
  return firstId;
}

/**
 * 版型外框換顏色／透明度：新的外框圖（已經重畫好）換掉外框物件的素材，一步復原；
 * 版型文字如果還是舊顏色的「自動深淺字」，跟著換成新外框配的深／淺字（自己改過顏色的不動）。
 */
export function applyFrameStyle(
  group: string,
  asset: Asset,
  style: { layout: string; color: string; opacity: number },
): void {
  const p = store().project;
  const frame = p && groupFrame(p, group);
  if (!p || !frame) return;
  const oldInk = inkFor(frame.item.frameStyle?.color ?? '#ffffff');
  const newInk = inkFor(style.color);
  store().apply((d) => {
    if (!d.assets.some((a) => a.id === asset.id)) d.assets.push(asset);
    for (const track of d.tracks)
      for (const it of track.items) {
        if (it.type === 'audio' || it.group !== group) continue;
        if (it.id === frame.item.id && it.type !== 'text') {
          it.assetId = asset.id;
          it.frameStyle = { ...style };
        } else if (it.type === 'text') {
          const run = it.card.runs[0];
          if (run && run.color === oldInk) run.color = newInk;
        }
      }
  });
}

/** 整個版型換位置：整組的開始時間往前或往後移（不能小於 0 秒），各格跟著一起 */
export function moveGroupTo(group: string, start: number) {
  const p = store().project;
  const frame = p && groupFrame(p, group);
  if (!p || !frame) return;
  const items = groupItems(p, group);
  const minStart = Math.min(...items.map((i) => i.start));
  const delta = Math.max(start, 0) - frame.item.start;
  const shift = Math.max(delta, -minStart);
  if (Math.abs(shift) < 1e-9) return;
  store().apply((d) => {
    for (const track of d.tracks)
      for (const it of track.items) if (it.type !== 'audio' && it.group === group) it.start += shift;
  });
}

/**
 * 整個版型的長度：外框改成 duration 秒；各格超出新的結尾的部分切掉（整段在結尾之後的拿掉）。
 * 變長時各格的片段不拉長，多出來的時間顯示色塊（素材放完了）。一步復原。
 */
export function setGroupDuration(group: string, duration: number, opts?: Opts) {
  const p = store().project;
  const frame = p && groupFrame(p, group);
  if (!p || !frame) return;
  const d1 = Math.max(duration, 0.5);
  store().apply((d) => {
    const end = frame.item.start + d1;
    for (const track of d.tracks) {
      const keep: Item[] = [];
      for (const it of track.items) {
        if (it.type === 'audio' || it.group !== group) {
          keep.push(it as Item);
          continue;
        }
        if (it.id === frame.item.id) {
          it.duration = d1;
          keep.push(it as Item);
        } else if (it.start >= end - 0.05) continue;
        else {
          if (it.start + it.duration > end) it.duration = end - it.start;
          keep.push(it as Item);
        }
      }
      track.items = keep as never;
    }
  }, opts);
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

/** 轉場資料換成新的總長（前後的分配照原本的比例；沒分別設定就維持對稱） */
function withDuration(
  prev: { duration: number; before?: number; after?: number } | undefined,
  duration: number,
) {
  if (!prev || (prev.before === undefined && prev.after === undefined)) return { duration };
  const total = (prev.before ?? 0) + (prev.after ?? 0) || 1;
  return {
    duration,
    before: ((prev.before ?? 0) / total) * duration,
    after: ((prev.after ?? 0) / total) * duration,
  };
}

/** 設定（或取消）一個片段的進場轉場；duration 沒給就沿用原本的 */
export function setTransition(id: string, kind: TransitionKind | null, duration?: number, opts?: Opts): void {
  editItem(
    id,
    (it) => {
      if (it.type === 'audio') return;
      if (!kind) delete it.transitionIn;
      else
        it.transitionIn = {
          kind,
          ...withDuration(
            it.transitionIn,
            duration ?? it.transitionIn?.duration ?? DEFAULT_TRANSITION_DURATION,
          ),
        };
    },
    opts,
  );
}

/** 字卡的文字樣式特效（閃爍、發光閃亮、方格字、震動）；null＝取消 */
export function setTextFx(id: string, kind: TextFxKind | null, opts?: Opts): void {
  editItem(
    id,
    (it) => {
      if (it.type !== 'text') return;
      if (!kind) delete it.textFx;
      else it.textFx = { kind };
    },
    opts,
  );
}

/** 轉場分配：佔前一段結尾 before 秒、佔這一段開頭 after 秒（總長＝兩者相加） */
export function setTransitionSplit(id: string, before: number, after: number, opts?: Opts): void {
  editItem(
    id,
    (it) => {
      if (it.type === 'audio' || !it.transitionIn) return;
      it.transitionIn = { ...it.transitionIn, before, after, duration: before + after };
    },
    opts,
  );
}

/** 單一素材的進場（role in）／出場（role out）特效；kind 是 null＝取消；duration 沒給就沿用原本的（預設 0.8 秒） */
export function setItemEffect(
  id: string,
  role: 'in' | 'out',
  kind: EffectKind | null,
  duration?: number,
  opts?: Opts,
): void {
  editItem(
    id,
    (it) => {
      if (it.type === 'audio') return;
      const key = role === 'in' ? 'inEffect' : 'outEffect';
      if (!kind) delete it[key];
      else it[key] = { kind, duration: duration ?? it[key]?.duration ?? DEFAULT_EFFECT_DURATION };
    },
    opts,
  );
}

/** 同一軌上所有「前面緊接著另一個同類片段」的片段都套用同一種轉場；回傳套用了幾個 */
export function setTransitionAll(trackId: string, kind: TransitionKind | null, duration?: number): number {
  const p = store().project;
  const tr = p?.tracks.find((t) => t.id === trackId);
  if (!p || !tr) return 0;
  const ids = seamsOf(tr.items).map((x) => x.next.id);
  if (ids.length === 0) return 0;
  store().apply((d) => {
    const t = d.tracks.find((x) => x.id === trackId);
    for (const it of t?.items ?? []) {
      if (!ids.includes(it.id) || it.type === 'audio') continue;
      if (!kind) delete it.transitionIn;
      else
        it.transitionIn = {
          kind,
          ...withDuration(
            it.transitionIn,
            duration ?? it.transitionIn?.duration ?? DEFAULT_TRANSITION_DURATION,
          ),
        };
    }
  });
  return ids.length;
}

/** 版型整組動畫：不動／捲動／滑入滑出 */
export function setGroupMotion(group: string, motion: 'drift' | 'slide' | undefined) {
  const p = store().project;
  const frame = p && groupFrame(p, group);
  if (!frame) return;
  editItem(frame.item.id, (it) => {
    if (it.type === 'text') return;
    if (motion) it.motion = motion;
    else delete it.motion;
  });
}

/** 版型某一格的素材放完（或這段是空位）時顯示的色塊：反黑或反白 */
export function setCellFill(trackId: string, fill: 'black' | 'white') {
  store().apply((d) => {
    const t = d.tracks.find((x) => x.id === trackId);
    if (t) t.fill = fill;
  });
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
  // 版型的外框＝整個版型：刪掉就是整個拿掉
  if (f.track.groupRole === 'frame' && f.item.type !== 'text' && f.item.group) {
    removeGroup(f.item.group);
    return true;
  }
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
  // 版型：外框＝整個版型一起拿掉；格子只是空出來（不補齊）
  if (f.item.type !== 'text' && f.item.type !== 'audio' && f.item.group) return removeAnyItem(id);
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

/** 多選軌道：一起上移（dir=1）／下移（-1），一步復原 */
export function moveTracksMulti(ids: string[], dir: 1 | -1): boolean {
  const p = store().project;
  if (!p) return false;
  const next = moveTracksBy(p.tracks as Track[], ids, dir);
  if (next === p.tracks) return false;
  store().apply((d) => void (d.tracks = next as never));
  return true;
}

/** 多選軌道：一起刪（版型整個），一步復原 */
export function removeTracksMulti(ids: string[]): void {
  const p = store().project;
  if (!p) return;
  const next = removeTracksByIds(p.tracks as Track[], ids);
  if (next.length === p.tracks.length) return;
  store().apply((d) => void (d.tracks = next as never), { select: null });
}

/** 多選軌道：整併成一條；回傳結果（null＝不能整併） */
export function mergeTracksMulti(ids: string[]): { merged: number; kept: number } | null {
  const p = store().project;
  if (!p) return null;
  const r = mergeTracksByIds(p.tracks as Track[], ids);
  if (!r) return null;
  store().apply((d) => void (d.tracks = r.tracks as never));
  return { merged: r.merged, kept: r.kept };
}

export function removeTrack(trackId: string) {
  const t0 = store().project?.tracks.find((t) => t.id === trackId);
  if (t0?.group) return removeGroup(t0.group); // 版型的軌道：整個版型一起拿掉
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
  const next = moveItemToTrack(p.tracks, id, target, start, createTrack, p.assets);
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
  if (f.track.groupRole === 'frame' && f.item.type !== 'text' && f.item.group) {
    moveGroupTo(f.item.group, start);
    return;
  }
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
