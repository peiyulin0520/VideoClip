import type { TextItem } from '../../model/types';
import { kineticById } from './index';

const DEFAULT_HIT: [number, number, number, number] = [0.08, 0.3, 0.84, 0.4];

/** 預設框的種類：wide＝16:9 一條（直式畫面也跟原版比例一樣）、full＝整個畫面、lyrics＝歌詞框（中下方） */
export type KineticArea = 'wide' | 'full' | 'lyrics';

/** 預設框的大小（像素，W×H 是畫面） */
export function areaSize(area: KineticArea, W: number, H: number): { w: number; h: number } {
  if (area === 'full') return { w: W, h: H };
  if (area === 'lyrics') return { w: Math.round(W * 0.84), h: Math.round(H * 0.34) };
  // wide：16:9 的框塞進畫面（直式＝滿寬，橫式／方形＝高度放不下就縮到放得下）
  const w = Math.min(W, (H * 16) / 9);
  return { w: Math.round(w), h: Math.round((w * 9) / 16) };
}

/** 預設框的中心（畫面比例）：歌詞框在中下方，其他在正中央 */
export const areaCenter = (area: KineticArea): { x: number; y: number } =>
  area === 'lyrics' ? { x: 0.5, y: 0.68 } : { x: 0.5, y: 0.5 };

/** 這個動態字卡的框（像素）：有自己設定的大小就用它，沒有就用那一式的預設框 */
export function kineticFrame(item: TextItem, W: number, H: number): { w: number; h: number } {
  const k = item.kinetic;
  if (k?.size) return { w: Math.max(Math.round(k.size.w * W), 8), h: Math.max(Math.round(k.size.h * H), 8) };
  const def = k ? kineticById(k.id) : undefined;
  return areaSize(def?.area ?? 'wide', W, H);
}

/** 點選、選取框、吸附用的範圍（像素，相對框左上角）：框是整個畫面時只算中間有字的一條（不然會擋住底下所有東西），其他就是整個框 */
export function kineticContent(
  item: TextItem,
  W: number,
  H: number,
): { x: number; y: number; w: number; h: number } {
  const f = kineticFrame(item, W, H);
  if (f.w < W * 0.98 || f.h < H * 0.98) return { x: 0, y: 0, w: f.w, h: f.h };
  const def = item.kinetic ? kineticById(item.kinetic.id) : undefined;
  const [x, y, w, h] = def?.hit ?? DEFAULT_HIT;
  return { x: x * f.w, y: y * f.h, w: w * f.w, h: h * f.h };
}
