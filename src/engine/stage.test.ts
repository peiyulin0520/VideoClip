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

describe('預覽底的寬高比', () => {
  it('previewSizeFor：有給預覽區寬高比時，整張底（含版面外面）的長邊才是 480／960', async () => {
    const { previewSizeFor } = await import('./previewQuality');
    // 沒給：版面自己的長邊（舊行為）
    expect(previewSizeFor({ width: 1080, height: 1920 }, true)).toEqual({ width: 270, height: 480 });
    // 預覽區比 9:16 寬（0.86）：底 ＝ 高度填滿、寬 1652×1920 → 長邊還是高
    const a = previewSizeFor({ width: 1080, height: 1920 }, true, 0.86);
    expect(a.height).toBe(480);
    // 預覽區比版面「更寬更矮」（1.09）：底的寬比高長 → 長邊是底的寬，版面縮得比較小
    const b = previewSizeFor({ width: 1080, height: 1920 }, true, 1.09);
    expect(b.height).toBeLessThan(480);
    const lay = stageLayout(b.width, b.height, 1.09);
    expect(Math.max(lay.baseW, lay.baseH)).toBeLessThanOrEqual(481);
  });
  it('stageLayout：給預覽區寬高比時，版面在底裡面等比放最大、置中', () => {
    const l = stageLayout(960, 540, 0.86); // 16:9 的版面放進 0.86 的底：寬度填滿
    expect(l.baseW).toBe(960);
    expect(l.baseH).toBe(Math.round(960 / 0.86));
    expect(l.offX).toBe(0);
    expect(l.fx).toBe(1);
  });
});
