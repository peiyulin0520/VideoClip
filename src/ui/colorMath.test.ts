import { describe, expect, it } from 'vitest';
import { hexToRgb, hsvFromRgbKeepHue, hsvToRgb, rgbToHex, rgbToHsv, type RGB } from './colorMath';

describe('色碼 ⇄ RGB', () => {
  it('正常轉換、大小寫與 # 都可以', () => {
    expect(hexToRgb('#ff8000')).toEqual([255, 128, 0]);
    expect(hexToRgb('FF8000')).toEqual([255, 128, 0]);
    expect(rgbToHex([255, 128, 0])).toBe('#ff8000');
    expect(rgbToHex([0, 0, 0])).toBe('#000000');
  });
  it('壞色碼回傳 null；RGB 超出範圍會夾在 0–255', () => {
    expect(hexToRgb('#12ab3')).toBeNull();
    expect(hexToRgb('xyz')).toBeNull();
    expect(rgbToHex([300, -5, 12.6])).toBe('#ff000d');
  });
});

describe('RGB ⇄ HSV', () => {
  const cases: [RGB, { h: number; s: number; v: number }][] = [
    [[255, 0, 0], { h: 0, s: 1, v: 1 }],
    [[0, 255, 0], { h: 120, s: 1, v: 1 }],
    [[0, 0, 255], { h: 240, s: 1, v: 1 }],
    [[255, 255, 255], { h: 0, s: 0, v: 1 }],
    [[0, 0, 0], { h: 0, s: 0, v: 0 }],
    [[128, 128, 128], { h: 0, s: 0, v: 128 / 255 }],
  ];
  for (const [rgb, hsv] of cases)
    it(`${rgb.join(',')}`, () => {
      const t = rgbToHsv(rgb);
      expect(t.h).toBeCloseTo(hsv.h, 5);
      expect(t.s).toBeCloseTo(hsv.s, 5);
      expect(t.v).toBeCloseTo(hsv.v, 5);
      expect(hsvToRgb(hsv)).toEqual(rgb);
    });
  it('所有 RGB 組合（抽樣）來回轉換後不變', () => {
    for (let r = 0; r < 256; r += 17)
      for (let g = 0; g < 256; g += 17)
        for (let b = 0; b < 256; b += 17) expect(hsvToRgb(rgbToHsv([r, g, b]))).toEqual([r, g, b]);
  });
  it('色相超過 360 或負數會繞回來；s、v 夾在 0–1', () => {
    expect(hsvToRgb({ h: 360, s: 1, v: 1 })).toEqual([255, 0, 0]);
    expect(hsvToRgb({ h: -120, s: 1, v: 1 })).toEqual([0, 0, 255]);
    expect(hsvToRgb({ h: 0, s: 5, v: 2 })).toEqual([255, 0, 0]);
  });
  it('拉到灰色／黑色時沿用原本的色相', () => {
    expect(hsvFromRgbKeepHue([100, 100, 100], 200).h).toBe(200);
    expect(hsvFromRgbKeepHue([0, 0, 0], 77).h).toBe(77);
    expect(hsvFromRgbKeepHue([255, 0, 0], 200).h).toBe(0);
  });
});
