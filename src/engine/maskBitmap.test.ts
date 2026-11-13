import { describe, expect, it } from 'vitest';
import { maskBounds } from './maskBitmap';

function mk(w: number, h: number, fill: (x: number, y: number) => boolean) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fill(x, y)) d[(y * w + x) * 4 + 3] = 255;
  return d;
}

describe('maskBounds：遮罩裡有東西的範圍（佔整張畫面的比例）', () => {
  it('一塊矩形', () => {
    const b = maskBounds(
      mk(100, 50, (x, y) => x >= 20 && x < 60 && y >= 10 && y < 30),
      100,
      50,
    )!;
    expect(b.l).toBeCloseTo(0.2, 6);
    expect(b.r).toBeCloseTo(0.4, 6);
    expect(b.t).toBeCloseTo(0.2, 6);
    expect(b.b).toBeCloseTo(0.4, 6);
  });
  it('分開的兩塊：框住全部', () => {
    const b = maskBounds(
      mk(10, 10, (x, y) => (x < 2 && y < 2) || (x >= 8 && y >= 8)),
      10,
      10,
    )!;
    expect(b).toEqual({ l: 0, t: 0, r: 0, b: 0 });
  });
  it('全部透明（或幾乎透明）＝沒有範圍', () => {
    expect(maskBounds(new Uint8ClampedArray(4 * 16), 4, 4)).toBeNull();
    const faint = new Uint8ClampedArray(4 * 16);
    faint[3] = 5;
    expect(maskBounds(faint, 4, 4)).toBeNull();
  });
});
