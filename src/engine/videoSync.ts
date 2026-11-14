// 播放中，一支 <video> 該怎麼跟時鐘對時（純函式，好測）。
// 重點：素材放完了就停在最後一格、不要再 play()——已經 ended 的影片 play() 會從 0 秒重新播，
// 接著又被 seek 回結尾，轉場時 A 在「從頭播／跳回結尾」之間來回，畫面一閃一閃。
// 素材開頭之前（轉場提前出現的 B 入點不夠）同樣停在第一格，等時間到了再開始播。

/** 影片和時鐘差超過這個秒數才硬跳（會頓一下）；轉場中放寬一點 */
export const HARD_DRIFT = 0.5;
export const HARD_DRIFT_TRANSITION = 0.6;
export const SOFT_DRIFT = 0.04;
/** 素材最後這麼多秒以內就當成「放完了」 */
export const END_EPS = 0.06;
/** 停在最後一格時 seek 到結尾前這麼多秒（剛好在結尾 seek 有的瀏覽器會變黑） */
export const END_HOLD = 0.05;

/** 播放中對時：diff = 該在的位置 − 影片目前位置（正的＝影片落後） */
export function driftPlan(
  diff: number,
  speed: number,
  soft = true,
  opts: { hard?: number; maxAdj?: number } = {},
): { seek: boolean; rate: number } {
  const a = Math.abs(diff);
  const hard = opts.hard ?? HARD_DRIFT;
  const maxAdj = opts.maxAdj ?? 0.15;
  if (a > hard) return { seek: true, rate: speed };
  // soft=false（iPhone）：不微調播放速度——改 playbackRate 會讓 Safari 的解碼卡一下，小差距就讓它去
  if (soft && a > SOFT_DRIFT)
    return { seek: false, rate: speed * (1 + Math.max(-maxAdj, Math.min(maxAdj, diff * 0.5))) };
  return { seek: false, rate: speed };
}

export type SyncPlan = {
  /** 暫停並停在原地（或 seekTo 指定的那一格）；不要呼叫 play() */
  hold: boolean;
  /** 要不要硬 seek、seek 到哪 */
  seekTo?: number;
  rate: number;
  /** 這次是不是為了追時間而硬 seek（統計用） */
  hardSeek: boolean;
};

export function videoSyncPlan(o: {
  /** 現在該播到的素材秒數（已經夾在 0～素材長度之間） */
  target: number;
  current: number;
  /** 素材長度；0＝不知道 */
  duration: number;
  speed: number;
  ended: boolean;
  seeking: boolean;
  /** 允許用播放速度微調（iPhone 平常不允許） */
  soft: boolean;
  /** 轉場進行中：放寬硬 seek、iPhone 也允許微調一點追上 */
  transitioning: boolean;
}): SyncPlan {
  const { target, current, duration, speed } = o;
  // 素材放完了：停在最後一格
  if (duration > 0.1 && target >= duration - END_EPS) {
    const last = Math.max(duration - END_HOLD, 0);
    const need = !o.seeking && Math.abs(current - last) > 0.1;
    return { hold: true, seekTo: need ? last : undefined, rate: speed, hardSeek: false };
  }
  // 還沒到素材開頭（轉場提前出現、入點不夠）：停在第一格
  if (target <= 0.02) {
    const need = !o.seeking && current > 0.05;
    return { hold: true, seekTo: need ? 0 : undefined, rate: speed, hardSeek: false };
  }
  const plan = driftPlan(target - current, speed, o.soft || o.transitioning, {
    hard: o.transitioning ? HARD_DRIFT_TRANSITION : HARD_DRIFT,
    maxAdj: o.transitioning && !o.soft ? 0.08 : 0.15,
  });
  return {
    hold: false,
    seekTo: plan.seek ? target : undefined,
    rate: plan.rate,
    hardSeek: plan.seek,
  };
}
