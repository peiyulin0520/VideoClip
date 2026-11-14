import { create } from 'zustand';
import { cropKeepingPlace, isNoCrop, NO_CROP, polygonCrop } from '../engine/crop';
import { cellRect, cellTransform } from '../engine/layouts';
import { composeWith } from '../engine/groupTransform';
import { hasKeyframes, upsertKeyframe, withTime } from '../engine/keyframes';
import { findItem, isVideoItem } from '../engine/timeline';
import { geoCtx } from '../engine/scene';
import { itemBox, aabb } from '../engine/geometry';
import type { Crop, Transform } from '../model/types';
import { useProjectStore } from './projectStore';
import { toast, useUI } from './uiStore';
import { loadMask, maskBounds } from '../engine/maskBitmap';

// 裁切模式的暫存狀態。預覽顯示「整張原始畫面」（留下的那塊位置大小不變），使用者拖四邊／四角／畫一圈，
// 按「完成」才一次寫進專案（一步復原）；「取消」什麼都不改。

export type Pt = [number, number];
export type CropSession = {
  itemId: string;
  crop: Crop;
  mask: Pt[] | null;
  /** 鎖定的比例（保留區域的像素寬 ÷ 高）；null＝自由 */
  lock: number | null;
  /** 自由形狀：用手指畫一圈 */
  lasso: boolean;
  /** 筆刷（補回要留的）／橡皮擦（擦掉多的）；null＝不在畫 */
  paint: 'brush' | 'erase' | null;
  /** 筆刷粗細（佔整張原始畫面寬的比例） */
  brush: number;
  /** 焦點圓在手指圓上方幾 px（0＝直接畫在手指下面）；存在這台手機 */
  reach: number;
  /** 筆刷／橡皮擦編輯中的遮罩（整張原始畫面座標，長邊 MASK_SIDE；不透明＝留下）；null＝還沒開始畫 */
  maskCanvas: HTMLCanvasElement | null;
  /** 這個物件原本就有點陣圖遮罩（沒被重設／重新圈選的話完成時保留） */
  hasBitmap: boolean;
  /** 要把原本的點陣圖遮罩拿掉（重設、重新圈選） */
  dropBitmap: boolean;
  /** 每畫一筆加 1：讓預覽上的紅色提示重畫 */
  maskVer: number;
  /** 復原用：每一筆之前的遮罩 */
  undo: ImageData[];
  /** 裁切模式裡顯示整張畫面用的位置、大小、填滿方式（只影響編輯時看到的，完成時另外算「切完不跳」） */
  view: { transform: Transform; fit: 'cover' | 'contain' };
};

export const useCrop = create<{ s: CropSession | null }>(() => ({ s: null }));

export function updateCrop(patch: Partial<Omit<CropSession, 'itemId'>>) {
  const { s } = useCrop.getState();
  if (s) useCrop.setState({ s: { ...s, ...patch } });
}

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
  window.scrollTo(0, 0); // 預覽在頁面最上面：從下面的工具列按進來要把預覽捲回來才拖得到
  const at = Math.max(raw.start, Math.min(player.time, raw.start + raw.duration - 0.01));
  player.seek(at);
  // 有定位（關鍵影格）的物件：以播放頭這個時間的位置、大小為準
  const item = withTime(raw, at);
  // 整張原始畫面顯示在原本的位置（留下來的那塊不動）；如果這樣會超出預覽畫面（例如填滿的橫式影片），
  // 把手就按不到了，改成縮進預覽中央完整顯示
  const inPlace = cropKeepingPlace(item, asset, NO_CROP, project.width, project.height);
  let view: CropSession['view'] = { transform: inPlace.transform, fit: item.fit };
  const ctx = geoCtx(project, project.width, project.height);
  const bb = aabb(itemBox({ ...item, crop: undefined, fit: view.fit, transform: view.transform }, ctx)!);
  const m = 2;
  if (bb.l < -m || bb.t < -m || bb.r > project.width + m || bb.b > project.height + m)
    view = { transform: { ...item.transform, x: 0.5, y: 0.5, scale: 1, rotation: 0 }, fit: 'contain' };
  player.setPreviewPatch({
    itemId,
    apply: (it) => ({
      ...it,
      crop: undefined,
      mask: undefined,
      maskBitmap: undefined,
      fit: view.fit,
      transform: view.transform,
    }),
  });
  useCrop.setState({
    s: {
      itemId,
      crop: item.crop ?? NO_CROP,
      mask: item.mask ?? null,
      paint: null,
      brush: 0.04,
      reach: readReach(),
      maskCanvas: null,
      hasBitmap: !!item.maskBitmap,
      dropBitmap: false,
      maskVer: 0,
      undo: [],
      // 版型的格子：預設鎖住格子的比例，拖動只是換「露出哪一塊」，畫面還是填滿格子
      lock: item.cell ? (item.cell.w * project.width) / (item.cell.h * project.height) : null,
      lasso: false,
      view,
    },
  });
  return true;
}

function close() {
  useUI.getState().player?.setPreviewPatch(null);
  useCrop.setState({ s: null });
}

export function cancelCrop() {
  if (useCrop.getState().s) close();
}

/** 完成：把裁切（和自由形狀）寫進專案，切完畫面不跳 */
export function finishCrop() {
  const s = useCrop.getState().s;
  if (!s) return;
  const store = useProjectStore.getState();
  const project = store.project;
  const found = project && findItem(project, s.itemId);
  close();
  if (!project || !found || !isVideoItem(found.item)) return;
  const tNow = useUI.getState().player?.time ?? 0;
  const item = withTime(found.item, tNow); // 有定位的物件：這個時間的位置、大小
  const asset = project.assets.find((a) => a.id === item.assetId);
  if (!asset) return;
  // 筆刷／橡皮擦畫過：遮罩的範圍就是留下來的範圍（crop 自動框住有東西的地方）
  let bitmap: string | null = null;
  if (s.maskCanvas) {
    const mc = s.maskCanvas;
    const data = mc.getContext('2d')!.getImageData(0, 0, mc.width, mc.height);
    const b = maskBounds(data.data, mc.width, mc.height);
    if (!b) return toast('整個畫面都被擦掉了，沒有套用');
    s.crop = {
      l: Math.min(b.l, 0.98),
      t: Math.min(b.t, 0.98),
      r: Math.min(b.r, 0.98),
      b: Math.min(b.b, 0.98),
    };
    s.mask = null;
    bitmap = mc.toDataURL('image/png');
  }
  const same = (a: Crop, b: Crop) =>
    Math.abs(a.l - b.l) + Math.abs(a.t - b.t) + Math.abs(a.r - b.r) + Math.abs(a.b - b.b) < 1e-6;
  const sameMask = JSON.stringify(item.mask ?? null) === JSON.stringify(s.mask);
  const bitmapSame = !bitmap && !(s.dropBitmap && item.maskBitmap);
  if (same(item.crop ?? NO_CROP, s.crop) && sameMask && bitmapSame) return; // 沒改，不要多一筆復原紀錄
  store.apply((d) => {
    const f = findItem(d as never, s.itemId);
    if (!f || !isVideoItem(f.item)) return;
    const res = cropKeepingPlace(item, asset, s.crop, project.width, project.height);
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
      // 有定位：裁完「留下來的那塊位置大小不變」寫進播放頭這個時間的定位
      it.keyframes = upsertKeyframe(it, Math.min(Math.max(tNow - it.start, 0), it.duration), res.transform);
    } else it.transform = res.transform;
    if (bitmap) {
      it.maskBitmap = bitmap;
      delete it.mask;
    } else {
      if (s.dropBitmap) delete it.maskBitmap;
      if (s.mask && s.mask.length >= 3) it.mask = s.mask;
      else delete it.mask;
    }
  });
  useUI.getState().player?.refresh();
}

/** 畫完一圈：保留區域自動框住多邊形 */
export function setLassoMask(points: Pt[] | null) {
  // 重新圈選：筆刷畫的東西和原本的點陣圖遮罩都作廢
  const reset = { maskCanvas: null, dropBitmap: true, undo: [] as ImageData[], paint: null } as const;
  if (!points) return updateCrop({ mask: null, ...reset });
  updateCrop({ mask: points, crop: polygonCrop(points), lock: null, ...reset });
}

/** 遮罩長邊的像素（太大手機吃不消，太小邊緣會糊） */
export const MASK_SIDE = 1024;

/** 筆刷／橡皮擦開始前先備好遮罩：原本的點陣圖遮罩 → 圈的多邊形 → 目前留下來的矩形（照這個順序） */
export async function ensureMaskCanvas(): Promise<HTMLCanvasElement | null> {
  const s0 = useCrop.getState().s;
  if (!s0) return null;
  if (s0.maskCanvas) return s0.maskCanvas;
  const project = useProjectStore.getState().project;
  const found = project && findItem(project, s0.itemId);
  const item = found && isVideoItem(found.item) ? found.item : null;
  const asset = item && project?.assets.find((a) => a.id === item.assetId);
  if (!item || !asset) return null;
  const k = MASK_SIDE / Math.max(asset.width, asset.height, 1);
  const w = Math.max(Math.round(asset.width * k), 8);
  const h = Math.max(Math.round(asset.height * k), 8);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#fff';
  if (s0.hasBitmap && !s0.dropBitmap && item.maskBitmap) {
    const src = await loadMask(item.maskBitmap);
    if (src) ctx.drawImage(src, 0, 0, w, h);
  } else if (s0.mask && s0.mask.length >= 3) {
    ctx.beginPath();
    s0.mask.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
    ctx.closePath();
    ctx.fill();
  } else {
    const c = s0.crop;
    ctx.fillRect(c.l * w, c.t * h, (1 - c.l - c.r) * w, (1 - c.t - c.b) * h);
  }
  const s = useCrop.getState().s;
  if (!s || s.itemId !== s0.itemId) return null;
  if (s.maskCanvas) return s.maskCanvas; // 等的時候別處已經建好了
  useCrop.setState({ s: { ...s, maskCanvas: cv, maskVer: s.maskVer + 1 } });
  return cv;
}

/** 每一筆畫之前呼叫：存一份遮罩給「復原筆畫」（最多 12 步） */
export function pushMaskUndo() {
  const s = useCrop.getState().s;
  const cv = s?.maskCanvas;
  if (!s || !cv) return;
  const snap = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height);
  useCrop.setState({ s: { ...s, undo: [...s.undo.slice(-11), snap] } });
}

/** 復原上一筆 */
export function undoMaskStroke() {
  const s = useCrop.getState().s;
  const cv = s?.maskCanvas;
  const last = s?.undo[s.undo.length - 1];
  if (!s || !cv || !last) return;
  cv.getContext('2d')!.putImageData(last, 0, 0);
  useCrop.setState({ s: { ...s, undo: s.undo.slice(0, -1), maskVer: s.maskVer + 1 } });
}

/** 在遮罩上畫一小段（from→to 是原始畫面的比例；r 是半徑，佔畫面寬的比例）：筆刷＝留下，橡皮擦＝去掉 */
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

export function paintMask(from: Pt, to: Pt, tool: 'brush' | 'erase') {
  const s = useCrop.getState().s;
  const cv = s?.maskCanvas;
  if (!s || !cv) return;
  const ctx = cv.getContext('2d')!;
  const w = cv.width;
  const h = cv.height;
  const r = (s.brush * w) / 2;
  ctx.save();
  ctx.globalCompositeOperation = tool === 'brush' ? 'source-over' : 'destination-out';
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(from[0] * w, from[1] * h);
  ctx.lineTo(to[0] * w, to[1] * h);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(to[0] * w, to[1] * h, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 一筆畫完：讓預覽上的紅色提示重畫 */
export function bumpMask() {
  const s = useCrop.getState().s;
  if (s) useCrop.setState({ s: { ...s, maskVer: s.maskVer + 1 } });
}
