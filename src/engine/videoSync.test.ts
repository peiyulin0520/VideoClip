import { describe, expect, it } from 'vitest';
import { driftPlan, videoSyncPlan } from './videoSync';

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
