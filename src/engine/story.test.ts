import { describe, expect, it } from 'vitest';
import { animatedRect, cycleFont, monthTitle, STORY_SECONDS, storyParts, storyTint } from './story';

describe('storyParts', () => {
  it('開場是 16:9 的橫條、最後滿版；三格各佔 1/3，依序從上、右、下進來', () => {
    const [open, c1, c2, c3] = storyParts(1080, 1920);
    expect(open!.anim.from.w).toBe(1);
    expect(open!.anim.from.h).toBeCloseTo((1080 * 9) / 16 / 1920, 6);
    expect(open!.cell).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(c1!.start).toBeLessThan(c2!.start);
    expect(c2!.start).toBeLessThan(c3!.start);
    expect(c1!.anim.from.y).toBeLessThan(0); // 從上面進來
    expect(c2!.anim.from.x).toBe(1); // 從右邊進來
    expect(c3!.anim.from.y).toBe(1); // 從下面進來
    expect([c1, c2, c3].map((c) => c!.cell.h.toFixed(3))).toEqual(['0.333', '0.333', '0.333']);
    expect(open!.sound).toBe(true);
    expect([c1, c2, c3].every((c) => !c!.sound)).toBe(true);
  });
});

describe('animatedRect', () => {
  it('t0 之前停在 from、t1 之後在 cell、中間在兩者之間', () => {
    const cell = { x: 0, y: 0, w: 1, h: 1 / 3 };
    const anim = { from: { x: 0, y: -1 / 3, w: 1, h: 1 / 3 }, t0: 0, t1: 0.6 };
    expect(animatedRect(cell, anim, -1).y).toBeCloseTo(-1 / 3, 6);
    expect(animatedRect(cell, anim, 0.3).y).toBeGreaterThan(-1 / 3);
    expect(animatedRect(cell, anim, 0.3).y).toBeLessThan(0);
    expect(animatedRect(cell, anim, 0.6).y).toBeCloseTo(0, 6);
    expect(animatedRect(cell, anim, 5).y).toBeCloseTo(0, 6);
  });
});

describe('storyTint', () => {
  it('前面沒有染色；結尾暖色漸強、最後閃白', () => {
    expect(storyTint(3, STORY_SECONDS)).toEqual({ warm: 0, white: 0 });
    expect(storyTint(STORY_SECONDS - 1, STORY_SECONDS).warm).toBeGreaterThan(0.2);
    expect(storyTint(STORY_SECONDS - 1, STORY_SECONDS).white).toBe(0);
    expect(storyTint(STORY_SECONDS - 0.05, STORY_SECONDS).white).toBeGreaterThan(0.6);
  });
});

describe('cycleFont', () => {
  const c = { fonts: ['a', 'b', 'c'], interval: 0.2, until: 1 };
  it('每 interval 秒換下一個，輪完回頭；until 之後固定第一個', () => {
    expect(cycleFont(c, 0)).toBe('a');
    expect(cycleFont(c, 0.21)).toBe('b');
    expect(cycleFont(c, 0.41)).toBe('c');
    expect(cycleFont(c, 0.61)).toBe('a');
    expect(cycleFont(c, 0.81)).toBe('b');
    expect(cycleFont(c, 1.2)).toBe('a');
    expect(cycleFont({ ...c, fonts: [] }, 0.3)).toBe('system');
  });
});

describe('monthTitle', () => {
  it('英文月份大寫', () => {
    expect(monthTitle(new Date(2026, 10, 12))).toBe('NOVEMBER');
    expect(monthTitle(new Date(2026, 0, 1))).toBe('JANUARY');
  });
});
