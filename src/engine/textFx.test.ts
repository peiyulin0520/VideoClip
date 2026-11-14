import { describe, expect, it } from 'vitest';
import { fxRnd, textFxStep, TEXT_FXS, typingCount } from './textFx';

describe('typingCount：打字', () => {
  it('進場：從前面往後一個字一個字打出來', () => {
    expect(typingCount('in', 0, 4)).toBe(0);
    expect(typingCount('in', 0.2, 4)).toBe(1);
    expect(typingCount('in', 0.5, 4)).toBe(2);
    expect(typingCount('in', 0.76, 4)).toBe(4);
    expect(typingCount('in', 1, 4)).toBe(4);
  });
  it('出場：像 delete，從最後一個字往前刪（剩下的是前面的字）', () => {
    expect(typingCount('out', 0, 4)).toBe(4);
    expect(typingCount('out', 0.3, 4)).toBe(3);
    expect(typingCount('out', 0.5, 4)).toBe(2);
    expect(typingCount('out', 1, 4)).toBe(0);
  });
  it('字數 0 或超出範圍也不會出錯', () => {
    expect(typingCount('in', 0.5, 0)).toBe(0);
    expect(typingCount('in', 5, 3)).toBe(3);
  });
});

describe('textFxStep：時間量化，同一步畫面一樣（預覽與匯出一致）', () => {
  it('同一個時間永遠同一步；方格字每 0.12 秒換一步', () => {
    for (const f of TEXT_FXS) expect(textFxStep(f.id, 1.234)).toBe(textFxStep(f.id, 1.234));
    expect(textFxStep('pixel', 0.05)).toBe(0);
    expect(textFxStep('pixel', 0.13)).toBe(1);
    expect(textFxStep('pixel', 0.5)).toBeGreaterThan(textFxStep('pixel', 0.2));
  });
  it('閃爍一輪 1.6 秒會回到起點；負的時間當 0', () => {
    expect(textFxStep('shimmer', 1.6)).toBe(textFxStep('shimmer', 0));
    expect(textFxStep('shimmer', -3)).toBe(0);
  });
  it('亂數只看種子', () => {
    expect(fxRnd(42)).toBe(fxRnd(42));
    expect(fxRnd(42)).not.toBe(fxRnd(43));
  });
});
