import { create } from 'zustand';
import { cropKeepingPlace, isNoCrop, NO_CROP, polygonCrop } from '../engine/crop';
import { composeKeep } from '../engine/cropCompose';
import { cellRect, cellTransform } from '../engine/layouts';
import { composeWith } from '../engine/groupTransform';
import { hasKeyframes, upsertKeyframe, withTime } from '../engine/keyframes';
import { findItem, isVideoItem } from '../engine/timeline';
import type { Crop, CropStroke } from '../model/types';
import { useProjectStore } from './projectStore';
import { toast, useUI } from './uiStore';
import { loadMask, maskBounds, maskCanvasFor } from '../engine/maskBitmap';

// 裁切模式的暫存狀態（獨立的全螢幕編輯畫面 CropEditor）。四個工具互相獨立、可以一起用：
// 一般裁切（crop 四邊）、自由裁切（mask 多邊形）、筆刷／橡皮擦（strokes 向量筆畫，座標是整張原始畫面的比例）。
// 按「套用裁切」才一次寫進專案（一步復原）；按 ❌ 什麼都不改。每一步（拉完四邊、圈完一圈、畫完一筆）都能 ↩ 復原、↪ 重做。

export type Pt = [number, number];
export type CropTool = 'rect' | 'lasso' | 'brush' | 'erase';
export type CropSnap = { crop: Crop; mask: Pt[] | null; strokes: CropStroke[] };
export type CropSession = CropSnap & {
  itemId: string;
  /** 舊版存的點陣圖遮罩（解碼後）：當成底；新版有 cropEdit 就不用它 */
  base: HTMLCanvasElement | null;
  /** 鎖定的比例（保留區域的像素寬 ÷ 高）；null＝自由 */
  lock: number | null;
  tool: CropTool;
  /** 筆刷粗細（佔整張原始畫面寬的比例） */
  brush: number;
  /** 焦點圓在手指圓上方幾 px（0＝直接畫在手指下面）；存在這台手機 */
  reach: number;
  history: CropSnap[];
  redo: CropSnap[];
  /** 「檢查結果」：只顯示留下來的部分 */
  checking: boolean;
  /** 開始時的內容（沒改就不寫、不多一筆復原紀錄） */
  initial: string;
  /** 影片的來源時間（秒）：編輯畫面顯示這一格 */
  srcT: number;
};

export const useCrop = create<{ s: CropSession | null }>(() => ({ s: null }));

export function updateCrop(patch: Partial<Omit<CropSession, 'itemId'>>) {
  const { s } = useCrop.getState();
  if (s) useCrop.setState({ s: { ...s, ...patch } });
}

const snapOf = (s: CropSnap): CropSnap => ({ crop: { ...s.crop }, mask: s.mask, strokes: s.strokes });
const keyOf = (s: CropSnap) => JSON.stringify([s.crop, s.mask, s.strokes]);

/** 進入裁切模式。選到的必須是影片或照片。 */
export function startCrop(itemId: string): boolean {
  const project = useProjectStore.getState().project;
  const found = project && findItem(project, itemId);
  const player = useUI.getState().player;
  if (!project || !found || !isVideoItem(found.item)) {
    toast('請先點選一個影片或照片');
    return false;
  }
  const raw = found.item;
  const asset = project.assets.find((a) => a.id === raw.assetId);
  if (!asset || !player) return false;
  // 要看得到這個物件才能裁：播放頭移到物件的時間範圍內
  player.pause();
  const at = Math.max(raw.start, Math.min(player.time, raw.start + raw.duration - 0.01));
  player.seek(at);
  const srcT = raw.type === 'image' ? 0 : raw.trimIn + Math.max(at - raw.start, 0) * raw.speed;
  const edit = raw.cropEdit;
  const first: CropSnap = edit
    ? { crop: { ...edit.crop }, mask: edit.mask, strokes: edit.strokes }
    : { crop: raw.crop ? { ...raw.crop } : NO_CROP, mask: raw.mask ?? null, strokes: [] };
  const url = !edit && raw.maskBitmap ? raw.maskBitmap : null;
  useCrop.setState({
    s: {
      itemId,
      ...first,
      base: url ? (maskCanvasFor(url) ?? null) : null,
      brush: 0.04,
      reach: readReach(),
      history: [],
      redo: [],
      checking: false,
      initial: keyOf(first),
      srcT: Math.min(srcT, Math.max(asset.duration - 0.05, 0)),
      // 版型的格子：預設鎖住格子的比例，拖動只是換「露出哪一塊」，畫面還是填滿格子
      lock: raw.cell ? (raw.cell.w * project.width) / (raw.cell.h * project.height) : null,
      tool: 'rect',
    },
  });
  // 舊版的點陣圖遮罩還沒解好：解好之後補上
  if (url && !maskCanvasFor(url))
    void loadMask(url).then((c) => {
      const cur = useCrop.getState().s;
      if (c && cur && cur.itemId === itemId) updateCrop({ base: c });
    });
  return true;
}

function close() {
  useCrop.setState({ s: null });
}

export function cancelCrop() {
  if (useCrop.getState().s) close();
}

/** 一步操作完成：把「操作前」的內容放進復原紀錄（內容沒變就不放）；重做紀錄清空 */
export function commitCrop(before: CropSnap, patch: Partial<CropSnap> = {}) {
  const s = useCrop.getState().s;
  if (!s) return;
  const next = { ...s, ...patch };
  if (keyOf(before) === keyOf(next)) return useCrop.setState({ s: next });
  useCrop.setState({ s: { ...next, history: [...s.history.slice(-49), snapOf(before)], redo: [] } });
}

export function undoCrop() {
  const s = useCrop.getState().s;
  const prev = s?.history[s.history.length - 1];
  if (!s || !prev) return;
  useCrop.setState({
    s: { ...s, ...snapOf(prev), history: s.history.slice(0, -1), redo: [...s.redo, snapOf(s)] },
  });
}

export function redoCrop() {
  const s = useCrop.getState().s;
  const next = s?.redo[s.redo.length - 1];
  if (!s || !next) return;
  useCrop.setState({
    s: { ...s, ...snapOf(next), redo: s.redo.slice(0, -1), history: [...s.history, snapOf(s)] },
  });
}

/** 畫完一圈：保留區域自動框住多邊形 */
export function setLassoMask(points: Pt[] | null) {
  const s = useCrop.getState().s;
  if (!s) return;
  const before = snapOf(s);
  if (!points) return commitCrop(before, { mask: null, crop: NO_CROP });
  commitCrop(before, { mask: points, crop: polygonCrop(points) });
  updateCrop({ lock: null });
}

/** 遮罩長邊的像素（太大手機吃不消，太小邊緣會糊） */
export const MASK_SIDE = 1024;

/** 套用：把裁切（形狀、筆畫）寫進專案，切完畫面不跳 */
export function finishCrop() {
  const s = useCrop.getState().s;
  if (!s) return;
  const store = useProjectStore.getState();
  const project = store.project;
  const found = project && findItem(project, s.itemId);
  if (!project || !found || !isVideoItem(found.item)) return close();
  const tNow = useUI.getState().player?.time ?? 0;
  const item = withTime(found.item, tNow); // 有定格的物件：這個時間的位置、大小
  const asset = project.assets.find((a) => a.id === item.assetId);
  if (!asset) return close();
  if (keyOf(s) === s.initial) return close(); // 沒改，不要多一筆復原紀錄

  let crop = s.crop;
  let mask = s.mask;
  let bitmap: string | null = null;
  const bitmapPath = s.strokes.length > 0 || !!s.base;
  if (bitmapPath) {
    // 有筆畫（或舊版的點陣圖遮罩）：畫成點陣圖，crop 自動框住有東西的地方
    const k = MASK_SIDE / Math.max(asset.width, asset.height, 1);
    const w = Math.max(Math.round(asset.width * k), 8);
    const h = Math.max(Math.round(asset.height * k), 8);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d')!;
    composeKeep(ctx, w, h, s.crop, s.mask, s.strokes, s.base);
    const b = maskBounds(ctx.getImageData(0, 0, w, h).data, w, h);
    if (!b) return toast('整個畫面都被擦掉了，沒有套用');
    crop = {
      l: Math.min(b.l, 0.98),
      t: Math.min(b.t, 0.98),
      r: Math.min(b.r, 0.98),
      b: Math.min(b.b, 0.98),
    };
    mask = null;
    bitmap = cv.toDataURL('image/png');
  }
  close();
  store.apply((d) => {
    const f = findItem(d as never, s.itemId);
    if (!f || !isVideoItem(f.item)) return;
    const res = cropKeepingPlace(item, asset, crop, project.width, project.height);
    const it = f.item;
    if (isNoCrop(res.crop)) delete it.crop;
    else it.crop = res.crop;
    // 版型的格子：畫面一律填滿那個格子；其他物件：留下來的那塊位置大小不變
    if (item.cell) {
      // 先算「版型還沒動過」時的格子位置，再套上整組目前的位置、大小、角度
      const frame = project.tracks
        .flatMap((t) => t.items)
        .find((x) => x.type !== 'text' && x.group === item.group && !x.cell);
      const base = cellTransform(
        asset,
        res.crop,
        cellRect(item.cell, project.width, project.height),
        project.width,
        project.height,
      );
      it.transform =
        frame && frame.type !== 'text'
          ? composeWith(base, frame.transform, project.width, project.height)
          : base;
    } else if (hasKeyframes(it)) {
      // 有定格：裁完「留下來的那塊位置大小不變」寫進播放頭這個時間的定格
      it.keyframes = upsertKeyframe(it, Math.min(Math.max(tNow - it.start, 0), it.duration), res.transform);
    } else it.transform = res.transform;
    if (bitmap) {
      it.maskBitmap = bitmap;
      delete it.mask;
      it.cropEdit = {
        crop: s.crop,
        mask: s.mask,
        strokes: s.strokes,
      };
      if (s.strokes.length === 0) delete it.cropEdit; // 只有舊版遮罩被再裁小：沒有向量筆畫可以存
    } else {
      delete it.maskBitmap;
      delete it.cropEdit;
      if (mask && mask.length >= 3) it.mask = mask;
      else delete it.mask;
    }
  });
  useUI.getState().player?.refresh();
}

const REACH_KEY = 'vc-brush-reach';
export const DEFAULT_REACH = 70;
export const MAX_REACH = 150;
function readReach(): number {
  try {
    const v = Number(localStorage.getItem(REACH_KEY));
    if (localStorage.getItem(REACH_KEY) !== null && Number.isFinite(v))
      return Math.min(Math.max(v, 0), MAX_REACH);
  } catch {
    /* 沒有儲存空間就用預設 */
  }
  return DEFAULT_REACH;
}
export function saveReach(v: number) {
  try {
    localStorage.setItem(REACH_KEY, String(v));
  } catch {
    /* ignore */
  }
}
