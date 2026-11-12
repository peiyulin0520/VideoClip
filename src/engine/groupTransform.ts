import type { Transform } from '../model/types';

// 版型是一組物件（外框＋各格）：縮放、移動、旋轉都是「整組」一起動，格子不會單獨跑掉。
// 外框的 transform 就是整組的 transform；格子各自的 transform 是「已經套用整組之後」的結果，
// 每次整組改變時，用「從舊的整組到新的整組」的相對變化去推每一格。

export const IDENTITY: Transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 };

/**
 * 物件 tf 跟著整組從 from 變成 to：位置繞著整組的中心旋轉、縮放，大小乘上縮放比，角度加上旋轉量。
 * 位置用像素算（W、H：畫面大小），這樣橫式、直式畫面的旋轉才不會變形。opacity 不動。
 */
export function transformAbout(
  tf: Transform,
  from: Transform,
  to: Transform,
  W: number,
  H: number,
): Transform {
  const k = from.scale > 1e-9 ? to.scale / from.scale : 1;
  const a = ((to.rotation - from.rotation) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = (tf.x - from.x) * W * k;
  const dy = (tf.y - from.y) * H * k;
  return {
    x: to.x + (dx * c - dy * s) / W,
    y: to.y + (dx * s + dy * c) / H,
    scale: tf.scale * k,
    rotation: tf.rotation + (to.rotation - from.rotation),
    opacity: tf.opacity,
  };
}

/** 版型自己的座標（整組還沒動過）裡的 tf，換算成整組是 g 的時候的 tf */
export const composeWith = (tf: Transform, g: Transform, W: number, H: number): Transform =>
  transformAbout(tf, IDENTITY, g, W, H);

/**
 * 使用者對版型裡「某一個」物件做的改變（patch 是那個物件的新 transform 的一部分），換算成整組的新 transform：
 * 位置移了多少、大小乘了多少、轉了多少度，整組一起做；opacity 直接用。
 */
export function groupPatch(group: Transform, item: Transform, patch: Partial<Transform>): Transform {
  const k = patch.scale !== undefined && item.scale > 1e-9 ? patch.scale / item.scale : 1;
  return {
    x: group.x + (patch.x !== undefined ? patch.x - item.x : 0),
    y: group.y + (patch.y !== undefined ? patch.y - item.y : 0),
    scale: group.scale * k,
    rotation: group.rotation + (patch.rotation !== undefined ? patch.rotation - item.rotation : 0),
    opacity: patch.opacity ?? group.opacity,
  };
}

/** 整組動畫的位移（佔畫面寬、高的比例）：drift 由下往上捲過畫面；slide 開頭從右邊滑進來、結尾往左滑出去 */
export function motionOffset(
  motion: 'drift' | 'slide' | undefined,
  localT: number,
  duration: number,
): { x: number; y: number } {
  if (!motion || duration <= 0) return { x: 0, y: 0 };
  const p = Math.min(Math.max(localT / duration, 0), 1);
  if (motion === 'drift') return { x: 0, y: 0.35 - 0.7 * p };
  const inLen = Math.min(0.8, duration / 3);
  const outLen = Math.min(0.6, duration / 3);
  const enter = Math.min(Math.max(localT / inLen, 0), 1);
  const exit = Math.min(Math.max((localT - (duration - outLen)) / outLen, 0), 1);
  return { x: (1 - enter) ** 3 - exit ** 3, y: 0 };
}
