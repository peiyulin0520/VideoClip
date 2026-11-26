import type { Item } from '../model/types';
import { transitionSpan } from './transitions';

// 轉場前後「顯示來源換手」的判斷：轉場中畫的是預先解好的畫面；轉場前（前一段 A）、轉場後（後一段 B）一小段時間裡，
// 預解圖有這個時間的畫面，就等 <video> 準備好、而且時間對上了才換回 <video>，不然繼續用預解圖
// （不然 <video> 落後一點就換過去，畫面往回跳一小段＝看起來「開頭又播了一次」）。

/** 前一段 A：轉場開始前這麼多秒起就用預解圖；後一段 B：轉場結束後這麼多秒內都可能用預解圖 */
export const HANDOVER_BEFORE = 0.5;
export const HANDOVER_AFTER = 2.0;
/** 前一段 A 進轉場前，<video> 可能落後時鐘這麼多秒：A 的預解圖要往前多留這麼多（顯示「目標 − 落後」那一格） */
export const HANDOVER_A_LAG = 0.6;
/** 後一段 B 的換手範圍剩這麼多秒時，開始把預解圖慢慢放慢到跟 <video> 同一格 */
export const HANDOVER_RAMP = 0.6;
/** <video> 的時間跟要的時間差多少以內才算對上（約 1 格） */
export const HANDOVER_TOL = 0.04;

/** 這個時間 t，這個片段（it，在 items 這一軌）是不是在某個轉場前後的換手範圍裡（轉場進行中不算，那時一律用預解圖） */
export function inHandover(items: Item[], it: Item, t: number): boolean {
  // 作為後一段 B：轉場結束後 HANDOVER_AFTER 秒內
  const mine = transitionSpan(items, it);
  if (mine) {
    const end = mine.cut + mine.after;
    if (t >= end && t < end + HANDOVER_AFTER) return true;
  }
  // 作為前一段 A：下一個片段的轉場開始前 HANDOVER_BEFORE 秒內
  for (const nb of items) {
    if (nb === it || !nb.transitionIn) continue;
    const sp = transitionSpan(items, nb);
    if (!sp || sp.prev.id !== it.id) continue;
    const start = sp.cut - sp.before;
    if (t >= start - HANDOVER_BEFORE && t < start) return true;
  }
  return false;
}

/** 後一段 B：換手範圍還剩幾秒（不在範圍內回傳 null；A 也回傳 null） */
export function handoverRemain(items: Item[], it: Item, t: number): number | null {
  const mine = transitionSpan(items, it);
  if (!mine) return null;
  const end = mine.cut + mine.after;
  if (t >= end && t < end + HANDOVER_AFTER) return end + HANDOVER_AFTER - t;
  return null;
}

/**
 * 換手範圍快結束、<video> 還落後 d 秒（0＜d≤HANDOVER_RAMP）時，預解圖不要等到最後才往回跳：
 * 剩 HANDOVER_RAMP 秒時還是「目標」那一格，之後慢慢往 <video> 的那一格靠，範圍結束時剛好同一格。
 * 落後太多、或 <video> 超前，就照目標（結束時只好跳一下）。
 */
export function rampShown(target: number, current: number, remain: number): number {
  const d = target - current;
  if (!(d > 0.02) || d > HANDOVER_RAMP) return target;
  const f = Math.min(Math.max(1 - remain / HANDOVER_RAMP, 0), 1);
  return target - d * f;
}

export type SourcePick = 'video' | 'cached';

/** 換手範圍裡畫哪個：沒有預解圖或不在範圍 → 影片；影片準備好而且時間對上 → 影片；其他 → 預解圖 */
export function pickSource(i: {
  inHandover: boolean;
  haveCached: boolean;
  videoReady: boolean;
  diff: number;
}): SourcePick {
  if (!i.inHandover || !i.haveCached) return 'video';
  return i.videoReady && i.diff <= HANDOVER_TOL ? 'video' : 'cached';
}
