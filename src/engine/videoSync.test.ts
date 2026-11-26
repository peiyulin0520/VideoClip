import { describe, expect, it } from 'vitest';
import {
  HARD_DRIFT_PROTECT,
  HIDDEN_LEAD,
  HIDDEN_MAX_TRIES,
  driftPlan,
  hiddenSyncPlan,
  videoSyncPlan,
} from './videoSync';

const base = {
  target: 2,
  current: 2,
  duration: 4,
  speed: 1,
  ended: false,
  seeking: false,
  soft: true,
  transitioning: false,
};

describe('videoSyncPlan：素材放完了／還沒開始就停住，不要 play()', () => {
  it('要的畫面在素材最後（轉場延長 A）：停在最後一格，絕不 play', () => {
    const p = videoSyncPlan({ ...base, target: 3.95, current: 3.5 });
    expect(p.hold).toBe(true);
    expect(p.seekTo).toBeCloseTo(3.95, 6); // 停在結尾前 0.05 秒
    expect(p.hardSeek).toBe(false);
  });
  it('已經停在最後一格（ended）：hold、不再 seek 也不 play（以前這裡會 play() 從頭播）', () => {
    const p = videoSyncPlan({ ...base, target: 3.95, current: 3.95, ended: true });
    expect(p).toMatchObject({ hold: true, seekTo: undefined });
  });
  it('正在 seek 的時候不再下新的 seek', () => {
    expect(videoSyncPlan({ ...base, target: 3.95, current: 1, seeking: true }).seekTo).toBeUndefined();
  });
  it('還沒到素材開頭（轉場提前出現、入點不夠）：停在第一格；現在不在 0 就 seek 回 0', () => {
    expect(videoSyncPlan({ ...base, target: 0, current: 0 })).toMatchObject({
      hold: true,
      seekTo: undefined,
    });
    expect(videoSyncPlan({ ...base, target: 0, current: 0.4 })).toMatchObject({ hold: true, seekTo: 0 });
  });
  it('平常照對時：差一點慢慢追、差很多才硬 seek', () => {
    expect(videoSyncPlan({ ...base, current: 1.99 })).toMatchObject({
      hold: false,
      seekTo: undefined,
      rate: 1,
    });
    const behind = videoSyncPlan({ ...base, current: 1.8 });
    expect(behind.rate).toBeGreaterThan(1);
    const far = videoSyncPlan({ ...base, current: 1.2 });
    expect(far).toMatchObject({ hold: false, seekTo: 2, hardSeek: true });
  });
  it('iPhone（不微調）平常差 0.2 秒不動；轉場中允許最多 ±8% 追上', () => {
    expect(videoSyncPlan({ ...base, soft: false, current: 1.8 }).rate).toBe(1);
    const t = videoSyncPlan({ ...base, soft: false, transitioning: true, current: 1.8 });
    expect(t.rate).toBeGreaterThan(1);
    expect(t.rate).toBeLessThanOrEqual(1.08 + 1e-9);
  });
  it('轉場中硬 seek 的門檻放寬到 0.6 秒（0.55 秒的差距不跳）', () => {
    expect(videoSyncPlan({ ...base, current: 1.45 }).hardSeek).toBe(true);
    expect(videoSyncPlan({ ...base, current: 1.45, transitioning: true }).hardSeek).toBe(false);
    expect(videoSyncPlan({ ...base, current: 1.3, transitioning: true }).hardSeek).toBe(true);
  });
  it('轉場前後的保護期：落後 1 秒也不硬 seek（讓它自己追，畫面一直有），超過 HARD_DRIFT_PROTECT 才跳', () => {
    expect(videoSyncPlan({ ...base, current: 1.0, transitioning: true, protect: true }).hardSeek).toBe(false);
    expect(videoSyncPlan({ ...base, current: 2 - HARD_DRIFT_PROTECT - 0.1, protect: true }).hardSeek).toBe(
      true,
    );
    // 沒有保護期：跟以前一樣
    expect(videoSyncPlan({ ...base, current: 1.0, transitioning: true }).hardSeek).toBe(true);
  });
  it('不知道素材長度（0）不會誤判成放完了', () => {
    expect(videoSyncPlan({ ...base, duration: 0, target: 5, current: 5 }).hold).toBe(false);
  });
});

describe('driftPlan（沿用）', () => {
  it('可以指定硬 seek 門檻與最大微調', () => {
    expect(driftPlan(0.55, 1, true, { hard: 0.6 }).seek).toBe(false);
    expect(driftPlan(0.55, 1, true).seek).toBe(true);
    expect(driftPlan(0.3, 1, true, { maxAdj: 0.05 }).rate).toBeCloseTo(1.05, 6);
  });
});

describe('hiddenSyncPlan：藏起來的影片預約對時', () => {
  const h = {
    t: 10,
    raw: 2,
    target: 2,
    current: 2,
    speed: 1,
    duration: 8,
    lat: 0.4,
    seeking: false,
    paused: false,
    playAt: null as number | null,
    tries: 0,
  };
  it('差不多對上（≤0.25 秒）：不動，交給一般對時', () => {
    expect(hiddenSyncPlan({ ...h, current: 1.8 })).toEqual({ kind: 'none' });
    expect(hiddenSyncPlan({ ...h, current: 2.2 })).toEqual({ kind: 'none' });
  });
  it('落後很多：seek 到 目標＋起跑延遲＋提前量，等 0.25 秒再 play', () => {
    const p = hiddenSyncPlan({ ...h, current: 0 });
    expect(p).toMatchObject({ kind: 'resync' });
    if (p.kind === 'resync') {
      expect(p.seekTo).toBeCloseTo(2 + 0.4 + HIDDEN_LEAD, 6);
      expect(p.playAt).toBeCloseTo(10 + HIDDEN_LEAD, 6);
    }
  });
  it('超前很多也重對；有速度時提前量跟著速度', () => {
    const p = hiddenSyncPlan({ ...h, current: 3, speed: 2 });
    expect(p.kind).toBe('resync');
    if (p.kind === 'resync') expect(p.seekTo).toBeCloseTo(2 + (0.4 + HIDDEN_LEAD) * 2, 6);
  });
  it('正在 seek、或已預約等待中：不重複下指令；時間到了才 play', () => {
    expect(hiddenSyncPlan({ ...h, current: 0, seeking: true })).toEqual({ kind: 'keep' });
    expect(hiddenSyncPlan({ ...h, playAt: 10.2 })).toEqual({ kind: 'keep' });
    expect(hiddenSyncPlan({ ...h, playAt: 10, seeking: true })).toEqual({ kind: 'keep' });
    expect(hiddenSyncPlan({ ...h, playAt: 10 })).toEqual({ kind: 'play' });
  });
  it('試了 3 次還對不上：放棄預約，交給一般對時', () => {
    expect(hiddenSyncPlan({ ...h, current: 0, tries: HIDDEN_MAX_TRIES })).toEqual({ kind: 'none' });
  });
  it('目標快到素材結尾：不預約（seek 不到）', () => {
    expect(hiddenSyncPlan({ ...h, target: 7.5, raw: 7.5, current: 5 })).toEqual({ kind: 'none' });
  });
  it('入點不夠（raw＜0）：離開頭還有 起跑延遲 以內，就先從第一格 play；已經在動就不要碰', () => {
    expect(hiddenSyncPlan({ ...h, raw: -0.3, target: 0, current: 0, paused: true })).toEqual({
      kind: 'early-play',
    });
    expect(hiddenSyncPlan({ ...h, raw: -0.3, target: 0, current: 0.1, paused: false })).toEqual({
      kind: 'keep',
    });
    expect(hiddenSyncPlan({ ...h, raw: -0.9, target: 0, current: 0, paused: true })).toEqual({
      kind: 'none',
    });
  });
});

describe('Z29：入點 0 秒的後一段，起跑後不能又被「停在第一格」暫停', () => {
  it('raw 沒給＝舊行為：target ≤ 0.02 停在第一格', () => {
    expect(videoSyncPlan({ ...base, target: 0.01, current: 0 }).hold).toBe(true);
  });
  it('raw＜0（真的還沒到開頭）：停在第一格；現在不在 0 就 seek 回 0', () => {
    expect(videoSyncPlan({ ...base, target: 0, current: 0.1, raw: -0.3 })).toMatchObject({
      hold: true,
      seekTo: 0,
    });
  });
  it('raw 剛過 0（0～0.02）：已經起跑的影片照常播，不暫停、不倒回 0', () => {
    const p = videoSyncPlan({ ...base, target: 0.01, current: 0.12, raw: 0.01 });
    expect(p.hold).toBe(false);
    expect(p.seekTo).toBeUndefined();
  });
});

describe('Z29：hiddenSyncPlan 的重對門檻', () => {
  const h = {
    t: 10,
    raw: 2,
    target: 2,
    current: 1.7,
    speed: 1,
    duration: 8,
    lat: 0.4,
    seeking: false,
    paused: false,
    playAt: null as number | null,
    tries: 0,
  };
  it('預設落後 0.3 秒就重對；轉場結束後（resync 0.4）落後 0.3 秒不重對、落後 0.5 秒才重對', () => {
    expect(hiddenSyncPlan(h).kind).toBe('resync');
    expect(hiddenSyncPlan({ ...h, resync: 0.4 }).kind).toBe('none');
    expect(hiddenSyncPlan({ ...h, current: 1.5, resync: 0.4 }).kind).toBe('resync');
  });
});
