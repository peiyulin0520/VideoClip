// 播放中，一支 <video> 該怎麼跟時鐘對時（純函式，好測）。
// 重點：素材放完了就停在最後一格、不要再 play()——已經 ended 的影片 play() 會從 0 秒重新播，
// 接著又被 seek 回結尾，轉場時 A 在「從頭播／跳回結尾」之間來回，畫面一閃一閃。
// 素材開頭之前（轉場提前出現的 B 入點不夠）同樣停在第一格，等時間到了再開始播。

/** 影片和時鐘差超過這個秒數才硬跳（會頓一下）；轉場中放寬一點 */
export const HARD_DRIFT = 0.5;
export const HARD_DRIFT_TRANSITION = 0.6;
/** 轉場前後的保護期（後一段剛要開始播、iPhone 的 play() 還沒真的動）：落後在這個秒數以內不硬 seek，讓它自己追，畫面至少一直有它 */
export const HARD_DRIFT_PROTECT = 1.5;
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
  /** 轉場前後的保護期（後一段的暖機到轉場結束後 1 秒）：硬 seek 的門檻放到 HARD_DRIFT_PROTECT */
  protect?: boolean;
  /** 沒夾過的素材秒數（入點不夠時是負的）。有給：只有「真的還沒到素材開頭（raw＜0）」才停在第一格；到了開頭（raw≥0）就正常播，不要把已經起跑的影片又暫停、倒回 0 */
  raw?: number;
}): SyncPlan {
  const { target, current, duration, speed } = o;
  // 素材放完了：停在最後一格
  if (duration > 0.1 && target >= duration - END_EPS) {
    const last = Math.max(duration - END_HOLD, 0);
    const need = !o.seeking && Math.abs(current - last) > 0.1;
    return { hold: true, seekTo: need ? last : undefined, rate: speed, hardSeek: false };
  }
  // 還沒到素材開頭（轉場提前出現、入點不夠）：停在第一格
  if (o.raw === undefined ? target <= 0.02 : o.raw < 0) {
    const need = !o.seeking && current > 0.05;
    return { hold: true, seekTo: need ? 0 : undefined, rate: speed, hardSeek: false };
  }
  const plan = driftPlan(target - current, speed, o.soft || o.transitioning, {
    hard: o.protect ? HARD_DRIFT_PROTECT : o.transitioning ? HARD_DRIFT_TRANSITION : HARD_DRIFT,
    maxAdj: o.transitioning && !o.soft ? 0.08 : 0.15,
  });
  return {
    hold: false,
    seekTo: plan.seek ? target : undefined,
    rate: plan.rate,
    hardSeek: plan.seek,
  };
}

// ---------- 藏起來的影片：先預約對時 ----------
// iPhone 的 play()（暫停或 seek 之後）要 0.3～0.6 秒才真的動，而且不用 playbackRate 追（會卡）。
// 後一段 B 在轉場前暖機、轉場中（畫面用預解圖）、轉場後換手範圍裡，<video> 都沒人看：
// 落後太多時，不要讓它自己慢慢追，而是「暫停 → seek 到 目標＋起跑延遲＋一點 → 等時鐘走到再 play()」，一次對準。

/** 落後／超前超過這個秒數才預約重對；以內交給一般的對時（可以微調速度） */
export const HIDDEN_RESYNC = 0.25;
/** 預約重對時多抓的提前量（秒） */
export const HIDDEN_LEAD = 0.25;
export const HIDDEN_MAX_TRIES = 3;

export type HiddenPlan =
  | { kind: 'none' }
  | { kind: 'keep' }
  | { kind: 'early-play' }
  | { kind: 'play' }
  | { kind: 'resync'; seekTo: number; playAt: number };

export function hiddenSyncPlan(o: {
  /** 時間軸現在的秒數 */
  t: number;
  /** 沒夾過的素材秒數（入點不夠時是負的） */
  raw: number;
  target: number;
  current: number;
  speed: number;
  duration: number;
  /** 起跑延遲（秒） */
  lat: number;
  seeking: boolean;
  paused: boolean;
  /** 已預約：什麼時候（時間軸秒數）要 play()；沒預約＝null */
  playAt: number | null;
  tries: number;
  /** 落後／超前超過這個秒數才預約重對（預設 HIDDEN_RESYNC；轉場結束後聲音已經是 1，只在落後很多時才做） */
  resync?: number;
}): HiddenPlan {
  if (o.playAt !== null) {
    if (o.seeking) return { kind: 'keep' };
    return o.t >= o.playAt ? { kind: 'play' } : { kind: 'keep' };
  }
  // 素材開頭之前（入點不夠）：停在第一格，但要在「差起跑延遲」的時候就先 play()，時間到了它剛好開始動
  if (o.raw < 0) {
    if (o.raw >= -(o.lat * o.speed + 0.05)) return o.paused ? { kind: 'early-play' } : { kind: 'keep' };
    return { kind: 'none' };
  }
  if (o.seeking) return { kind: 'keep' };
  const diff = o.target - o.current;
  if (Math.abs(diff) <= (o.resync ?? HIDDEN_RESYNC) || o.tries >= HIDDEN_MAX_TRIES) return { kind: 'none' };
  const seekTo = o.target + (o.lat + HIDDEN_LEAD) * o.speed;
  if (o.duration > 0.1 && seekTo >= o.duration - END_HOLD * 2) return { kind: 'none' };
  return { kind: 'resync', seekTo, playAt: o.t + HIDDEN_LEAD };
}
