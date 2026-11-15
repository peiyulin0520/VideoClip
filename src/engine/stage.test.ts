import { describe, expect, it } from 'vitest';
import { stageLayout } from './stage';

describe('stageLayout', () => {
  it('9:16 的版面剛好填滿底', () => {
    expect(stageLayout(540, 960)).toEqual({ baseW: 540, baseH: 960, offX: 0, offY: 0, fx: 1, fy: 1 });
  });
  it('4:3 寬度填滿、上下置中', () => {
    const l = stageLayout(960, 720);
    expect(l.baseW).toBe(960);
    expect(l.baseH).toBe(1707);
    expect(l.offX).toBe(0);
    expect(l.offY).toBe(Math.round((1707 - 720) / 2));
    expect(l.fy).toBeCloseTo(720 / 1707, 5);
  });
  it('比 9:16 更窄的版面：高度填滿、左右置中', () => {
    const l = stageLayout(400, 960);
    expect(l.baseH).toBe(960);
    expect(l.baseW).toBe(540);
    expect(l.offX).toBe(70);
    expect(l.offY).toBe(0);
  });
});
