import { describe, expect, it } from 'vitest';
import { FIT_MAX, FIT_MIN, fitDuration, fitSpeed, kineticSpeed, tailPause } from './speed';

describe('動態字卡速度配合字卡長度', () => {
  it('tailPause：最多 0.5 秒，字卡很短時最多佔 15%', () => {
    expect(tailPause(10)).toBe(0.5);
    expect(tailPause(2)).toBeCloseTo(0.3, 6);
    expect(tailPause(0)).toBe(0);
  });
  it('fitSpeed：字卡 5 秒、播完要 4.5 秒 → 速度 1；字卡短自動加速、長自動放慢；有上下限', () => {
    expect(fitSpeed(4.5, 5)).toBeCloseTo(1, 6);
    expect(fitSpeed(4.5, 2.5)).toBeGreaterThan(1.5); // 短 → 加速
    expect(fitSpeed(4.5, 10)).toBeCloseTo(4.5 / 9.5, 6); // 長 → 放慢
    expect(fitSpeed(4.5, 0.6)).toBe(FIT_MAX);
    expect(fitSpeed(4.5, 500)).toBe(FIT_MIN);
  });
  it('字卡在 duration 秒內剛好播完：速度 × 時間 = 要播的長度，最後留 tailPause', () => {
    for (const [hold, d] of [
      [4.5, 5],
      [3, 12],
      [8, 4],
      [2, 1.5],
    ] as const) {
      const sp = fitSpeed(hold, d);
      if (sp > FIT_MIN && sp < FIT_MAX) expect(hold / sp).toBeCloseTo(d - tailPause(d), 6);
    }
  });
  it('fitDuration 是 fitSpeed 的反函數（短的、長的都對）', () => {
    for (const [hold, sp] of [
      [4.5, 1],
      [4.5, 3],
      [4.5, 0.5],
      [1, 2],
      [10, 0.25],
    ] as const) {
      const d = fitDuration(hold, sp);
      expect(fitSpeed(hold, d)).toBeCloseTo(sp, 6);
    }
  });
  it('kineticSpeed：hold＋fit 由長度算；其他（重複播放、舊專案 hold）照自己設的速度', () => {
    expect(kineticSpeed({ id: 'burst', end: 'hold', fit: true }, 5, 4.5)).toBeCloseTo(1, 6);
    expect(kineticSpeed({ id: 'burst', end: 'hold', fit: true, speed: 2 }, 5, 4.5)).toBeCloseTo(1, 6);
    expect(kineticSpeed({ id: 'burst', end: 'hold', speed: 2 }, 5, 4.5)).toBe(2);
    expect(kineticSpeed({ id: 'burst', fit: true, speed: 1.5 }, 5, 4.5)).toBe(1.5); // loop
    expect(kineticSpeed({ id: 'burst' }, 5, 4.5)).toBe(1);
  });
});
