import { create } from 'zustand';
import { cropKeepingPlace, isNoCrop, NO_CROP, polygonCrop } from '../engine/crop';
import { findItem, isVideoItem } from '../engine/timeline';
import { geoCtx } from '../engine/scene';
import { itemBox, aabb } from '../engine/geometry';
import type { Crop, Transform } from '../model/types';
import { useProjectStore } from './projectStore';
import { toast, useUI } from './uiStore';

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
  const item = found.item;
  const asset = project.assets.find((a) => a.id === item.assetId);
  if (!asset || !player) return false;
  // 要看得到這個物件才能裁：播放頭移到物件的時間範圍內
  player.pause();
  window.scrollTo(0, 0); // 預覽在頁面最上面：從下面的工具列按進來要把預覽捲回來才拖得到
  player.seek(Math.max(item.start, Math.min(player.time, item.start + item.duration - 0.01)));
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
    apply: (it) => ({ ...it, crop: undefined, mask: undefined, fit: view.fit, transform: view.transform }),
  });
  useCrop.setState({
    s: { itemId, crop: item.crop ?? NO_CROP, mask: item.mask ?? null, lock: null, lasso: false, view },
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
  const item = found.item;
  const asset = project.assets.find((a) => a.id === item.assetId);
  if (!asset) return;
  const same = (a: Crop, b: Crop) =>
    Math.abs(a.l - b.l) + Math.abs(a.t - b.t) + Math.abs(a.r - b.r) + Math.abs(a.b - b.b) < 1e-6;
  const sameMask = JSON.stringify(item.mask ?? null) === JSON.stringify(s.mask);
  if (same(item.crop ?? NO_CROP, s.crop) && sameMask) return; // 沒改，不要多一筆復原紀錄
  store.apply((d) => {
    const f = findItem(d as never, s.itemId);
    if (!f || !isVideoItem(f.item)) return;
    const res = cropKeepingPlace(item, asset, s.crop, project.width, project.height);
    const it = f.item;
    if (isNoCrop(res.crop)) delete it.crop;
    else it.crop = res.crop;
    it.transform = res.transform;
    if (s.mask && s.mask.length >= 3) it.mask = s.mask;
    else delete it.mask;
  });
  useUI.getState().player?.refresh();
}

/** 畫完一圈：保留區域自動框住多邊形 */
export function setLassoMask(points: Pt[] | null) {
  if (!points) return updateCrop({ mask: null });
  updateCrop({ mask: points, crop: polygonCrop(points), lock: null });
}
