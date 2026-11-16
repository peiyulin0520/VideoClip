import type { TextItem } from '../../model/types';
import { kineticById } from './index';

const DEFAULT_HIT: [number, number, number, number] = [0.08, 0.3, 0.84, 0.4];

/** 動態字卡舞台的內容範圍（像素，相對舞台左上角）：點選、選取框、吸附用，不用整個舞台（那會擋住底下所有東西） */
export function kineticContent(
  item: TextItem,
  W: number,
  H: number,
): { x: number; y: number; w: number; h: number } {
  const def = item.kinetic ? kineticById(item.kinetic.id) : undefined;
  const [x, y, w, h] = def?.hit ?? DEFAULT_HIT;
  return { x: x * W, y: y * H, w: w * W, h: h * H };
}
