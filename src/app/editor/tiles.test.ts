import { describe, expect, it } from 'vitest';
import { tileLayout } from './tiles';

describe('tileLayout：時間軸縮圖鋪滿整個片段', () => {
  it('不超過上限：照舊（每格原本的寬度）', () => {
    expect(tileLayout(600, 30)).toEqual({ count: 20, tileW: 30 });
    expect(tileLayout(601, 30).count).toBe(21);
  });
  it('超過上限（長影片）：格數維持 120、每格放寬，剛好鋪滿', () => {
    const r = tileLayout(7000, 30); // 以前只畫到 3600px＝60 秒
    expect(r.count).toBe(120);
    expect(r.tileW).toBeCloseTo(7000 / 120, 6);
    expect(r.count * r.tileW).toBeCloseTo(7000, 6);
  });
  it('剛好 60 秒（3600px）不用放寬；再長一點就放寬', () => {
    expect(tileLayout(3600, 30)).toEqual({ count: 120, tileW: 30 });
    expect(tileLayout(3601, 30).tileW).toBeGreaterThan(30);
  });
  it('寬度 0 或很小也不會出錯', () => {
    expect(tileLayout(0, 30).count).toBe(1);
    expect(tileLayout(4, 30).count).toBe(1);
  });
});
