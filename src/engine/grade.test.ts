import { describe, expect, it } from 'vitest';
import {
  ADJUST_KEYS,
  effectiveAdjust,
  fullAdjust,
  gradeRGB,
  gradeUniforms,
  isNeutral,
  LOOKS,
  ZERO_ADJUST,
  type LookId,
} from './grade';

const gray: [number, number, number] = [0.5, 0.5, 0.5];
const skin: [number, number, number] = [0.85, 0.65, 0.55];
const sky: [number, number, number] = [0.35, 0.55, 0.85];
const near = (a: number[], b: number[], eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]!) < eps);
const lum = (c: number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
const spread = (c: number[]) => Math.max(...c) - Math.min(...c);

describe('gradeRGB：每一項', () => {
  it('全部 0＝原色', () => {
    expect(gradeRGB(skin, {})).toEqual(skin);
    expect(gradeRGB(skin, ZERO_ADJUST)).toEqual(skin);
    expect(isNeutral({ contrast: 0 })).toBe(true);
    expect(isNeutral({ contrast: 0.1 })).toBe(false);
  });
  it('曝光 +0.5：中灰變亮約 2 倍（夾在 1 以內）；−0.5 變暗', () => {
    expect(gradeRGB([0.3, 0.3, 0.3], { exposure: 0.5 })[0]).toBeCloseTo(0.6, 5);
    expect(gradeRGB(gray, { exposure: 0.5 })[0]).toBe(1);
    expect(gradeRGB(gray, { exposure: -0.5 })[0]).toBeCloseTo(0.25, 5);
  });
  it('對比 +：亮的更亮、暗的更暗、中灰不變；對比 −：往中灰靠', () => {
    const hi = gradeRGB([0.7, 0.7, 0.7], { contrast: 0.5 })[0];
    const lo = gradeRGB([0.3, 0.3, 0.3], { contrast: 0.5 })[0];
    expect(hi).toBeGreaterThan(0.7);
    expect(lo).toBeLessThan(0.3);
    expect(gradeRGB(gray, { contrast: 0.5 })[0]).toBeCloseTo(0.5, 6);
    expect(gradeRGB([0.9, 0.9, 0.9], { contrast: -0.5 })[0]).toBeLessThan(0.9);
  });
  it('高光 −：只壓亮部，暗部像素不變；高光 +：亮部更亮', () => {
    const dark: [number, number, number] = [0.1, 0.1, 0.1];
    expect(near(gradeRGB(dark, { highlights: -0.8 }), dark, 1e-9)).toBe(true);
    expect(gradeRGB([0.9, 0.9, 0.9], { highlights: -0.8 })[0]).toBeLessThan(0.85);
    expect(gradeRGB([0.7, 0.7, 0.7], { highlights: 0.8 })[0]).toBeGreaterThan(0.7);
  });
  it('陰影 +：只提暗部，亮部不變', () => {
    expect(gradeRGB([0.1, 0.1, 0.1], { shadows: 0.8 })[0]).toBeGreaterThan(0.15);
    expect(gradeRGB([0.95, 0.95, 0.95], { shadows: 0.8 })).toEqual([0.95, 0.95, 0.95]);
  });
  it('黑點 +：純黑變灰；黑點 −：深灰變黑', () => {
    expect(gradeRGB([0, 0, 0], { blacks: 0.6 })[0]).toBeGreaterThan(0.1);
    expect(gradeRGB([0.1, 0.1, 0.1], { blacks: -1 })[0]).toBeLessThan(0.05);
    expect(gradeRGB([1, 1, 1], { blacks: 0.6 })[0]).toBeCloseTo(1, 6);
  });
  it('亮度 +：中間調變亮，黑與白不動', () => {
    expect(gradeRGB(gray, { brightness: 0.5 })[0]).toBeGreaterThan(0.57);
    expect(gradeRGB([0, 0, 0], { brightness: 0.5 })[0]).toBe(0);
    expect(gradeRGB([1, 1, 1], { brightness: 0.5 })[0]).toBeCloseTo(1, 6);
  });
  it('飽和度 −1：紅綠藍相同（黑白）；+：更鮮豔', () => {
    const g = gradeRGB(skin, { saturation: -1 });
    expect(g[0]).toBeCloseTo(g[1], 6);
    expect(g[1]).toBeCloseTo(g[2], 6);
    expect(g[0]).toBeCloseTo(lum(skin), 5);
    expect(spread(gradeRGB(sky, { saturation: 0.5 }))).toBeGreaterThan(spread(sky));
  });
  it('鮮艷度：低飽和的顏色變化比高飽和的大', () => {
    const dull: [number, number, number] = [0.55, 0.5, 0.45];
    const vivid: [number, number, number] = [0.9, 0.2, 0.1];
    const d = spread(gradeRGB(dull, { vibrance: 0.8 })) - spread(dull);
    const v = spread(gradeRGB(vivid, { vibrance: 0.8 })) - spread(vivid);
    expect(d).toBeGreaterThan(0.03);
    expect(d / spread(dull)).toBeGreaterThan(v / spread(vivid));
  });
  it('色溫 +：紅多藍少；−：反過來；色調 +：綠少（洋紅）', () => {
    const w = gradeRGB(gray, { temperature: 0.5 });
    expect(w[0]).toBeGreaterThan(w[2]);
    const c = gradeRGB(gray, { temperature: -0.5 });
    expect(c[2]).toBeGreaterThan(c[0]);
    const m = gradeRGB(gray, { tint: 0.5 });
    expect(m[1]).toBeLessThan(m[0]);
  });
  it('褪色：純黑被抬起、對比變低', () => {
    expect(gradeRGB([0, 0, 0], { fade: 0.5 })[0]).toBeGreaterThan(0.09);
    expect(gradeRGB([1, 1, 1], { fade: 0.5 })[0]).toBeLessThan(0.95);
  });
  it('結果永遠在 0～1', () => {
    for (const k of ADJUST_KEYS)
      for (const v of [-1, 1])
        for (const c of [skin, sky, [0, 0, 0], [1, 1, 1]] as [number, number, number][])
          expect(gradeRGB(c, { [k]: v }).every((x) => x >= 0 && x <= 1)).toBe(true);
  });
});

describe('gradeUniforms／fullAdjust', () => {
  it('順序與數量固定（11 個，照 ADJUST_KEYS）', () => {
    expect(ADJUST_KEYS).toHaveLength(11);
    const u = gradeUniforms({ exposure: 0.1, fade: 0.9 });
    expect(u).toHaveLength(11);
    expect(u[0]).toBe(0.1);
    expect(u[10]).toBe(0.9);
    expect(fullAdjust({ tint: 0.2 }).vibrance).toBe(0);
  });
});

describe('色調組合 LOOKS／effectiveAdjust', () => {
  const look = (id: LookId, amount = 1) => ({ look: { id, amount } });
  it('預設×強度＋手動調整，各項相加後夾住', () => {
    const half = effectiveAdjust(look('bw', 0.5), undefined)!;
    expect(half.saturation).toBeCloseTo(-0.5, 6);
    const plus = effectiveAdjust(look('bw', 1), { saturation: 0.4 })!;
    expect(plus.saturation).toBeCloseTo(-0.6, 6); // 預設 −1＋手動 0.4
    expect(effectiveAdjust(look('bw', 1), { saturation: -0.6 })!.saturation).toBe(-1); // 夾住
    expect(effectiveAdjust(look('vintage', 1), { fade: 0.9 })!.fade).toBe(1); // 褪色上限 1
  });
  it('強度 0 ＝沒有預設；沒有預設也沒有手動＝undefined（不加濾鏡）', () => {
    expect(effectiveAdjust(look('bw', 0), undefined)).toBeUndefined();
    expect(effectiveAdjust({}, undefined)).toBeUndefined();
    expect(effectiveAdjust({}, { exposure: 0.2 })!.exposure).toBe(0.2);
  });
  it('9 個預設都有、名稱不重複', () => {
    expect(LOOKS).toHaveLength(9);
    expect(new Set(LOOKS.map((l) => l.name)).size).toBe(9);
  });
  it('每個預設對中灰、膚色、天空藍的結果符合描述', () => {
    const adj = (id: LookId) => LOOKS.find((l) => l.id === id)!.adjust;
    for (const id of ['bw', 'bwHigh'] as const)
      for (const c of [skin, sky]) {
        const g = gradeRGB(c, adj(id));
        expect(near([g[0]], [g[1]], 1e-3) && near([g[1]], [g[2]], 1e-3)).toBe(true); // 黑白 r=g=b
      }
    const cool = gradeRGB(gray, adj('cool'));
    expect(cool[2]).toBeGreaterThan(cool[0]);
    const warm = gradeRGB(gray, adj('warm'));
    expect(warm[0]).toBeGreaterThan(warm[2]);
    expect(gradeRGB([0, 0, 0], adj('vintage'))[0]).toBeGreaterThan(0.1); // 復古：純黑被抬起
    expect(gradeRGB([0, 0, 0], adj('japan'))[0]).toBeGreaterThan(0.05);
    const dull: [number, number, number] = [0.55, 0.5, 0.45];
    expect(spread(gradeRGB(dull, adj('vivid')))).toBeGreaterThan(spread(dull)); // 鮮豔：低飽和色變鮮豔
    expect(gradeRGB([0.9, 0.9, 0.9], adj('cinema'))[0]).toBeLessThan(0.9); // 電影感：高光壓低
    expect(lum(gradeRGB(gray, adj('fresh')))).toBeGreaterThan(0.5); // 清新：變亮
  });
});
