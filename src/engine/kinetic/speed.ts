// 動態字卡「停在最後畫面」時的速度：字卡在播放軸上多長，特效就在那段時間內播完（留一小段停住）。
// 字卡短就自動加速、長就自動放慢；在細調面板拖速度＝改字卡的長度。（重複播放的字卡照舊用自己設的速度。）
import type { TextItem } from '../../model/types';

export const FIT_MIN = 0.25;
export const FIT_MAX = 6;
/** 字卡拖到最長時，速度滑桿的範圍 */
export const SLIDER_MIN = 0.25;
export const SLIDER_MAX = 4;

/** 留給「播完之後停住」的秒數：最多 0.5 秒，字卡很短時最多佔 15% */
export const tailPause = (duration: number) => Math.min(0.5, Math.max(duration, 0) * 0.15);

/** 字卡長 duration 秒、播到「所有字都出現」要 hold 秒（速度 1 時）→ 要用的速度 */
export function fitSpeed(hold: number, duration: number): number {
  const run = Math.max(duration - tailPause(duration), 0.1);
  return Math.min(Math.max(hold / run, FIT_MIN), FIT_MAX);
}

/** 反過來：想要這個速度，字卡要多長（秒） */
export function fitDuration(hold: number, speed: number): number {
  const run = hold / Math.max(speed, 0.01);
  // duration − tailPause(duration) = run：短的（15% 比 0.5 秒小）d×0.85 = run；長的 d = run + 0.5
  const d = run / 0.85;
  return d * 0.15 <= 0.5 ? d : run + 0.5;
}

/** 這張動態字卡現在實際的速度倍數：〔停在最後畫面〕而且是自動配合長度（fit）→ 由長度算；其他→ 自己設的 */
export function kineticSpeed(k: NonNullable<TextItem['kinetic']>, duration: number, hold: number): number {
  if (k.fit && k.end === 'hold') return fitSpeed(hold, duration);
  return k.speed ?? 1;
}
