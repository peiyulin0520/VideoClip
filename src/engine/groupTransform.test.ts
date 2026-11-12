import { describe, expect, it } from 'vitest';
import type { Transform } from '../model/types';
import { composeWith, groupPatch, IDENTITY, motionOffset, transformAbout } from './groupTransform';

const W = 1080;
const H = 1920;
const t = (x: number, y: number, scale = 1, rotation = 0): Transform => ({
  x,
  y,
  scale,
  rotation,
  opacity: 1,
});

describe('transformAbout：整組縮放／移動／旋轉時，格子跟著動', () => {
  it('整組縮小一半：格子離中心的距離和大小都減半', () => {
    const cell = t(0.5, 0.3, 1); // 格子在整組中心上方 0.2 個畫面高
    const out = transformAbout(cell, IDENTITY, t(0.5, 0.5, 0.5), W, H);
    expect(out.x).toBeCloseTo(0.5);
    expect(out.y).toBeCloseTo(0.5 - 0.1);
    expect(out.scale).toBeCloseTo(0.5);
  });
  it('整組移動：格子一起平移同樣的距離', () => {
    const out = transformAbout(t(0.4, 0.6, 0.8), IDENTITY, t(0.6, 0.45), W, H);
    expect(out.x).toBeCloseTo(0.4 + 0.1);
    expect(out.y).toBeCloseTo(0.6 - 0.05);
    expect(out.scale).toBeCloseTo(0.8);
  });
  it('整組轉 90°：格子繞中心轉（用像素算），角度加 90', () => {
    const out = transformAbout(t(0.5, 0.3), IDENTITY, t(0.5, 0.5, 1, 90), W, H);
    // 往上 0.2×1920 = 384px → 順時針轉 90° 變成往右 384px = 0.3556 個畫面寬
    expect(out.x).toBeCloseTo(0.5 + 384 / W, 4);
    expect(out.y).toBeCloseTo(0.5, 4);
    expect(out.rotation).toBeCloseTo(90);
  });
  it('先放大再縮回來：回到原位（可逆）', () => {
    const cell = t(0.3, 0.7, 0.6);
    const big = t(0.55, 0.4, 2, 30);
    const there = transformAbout(cell, IDENTITY, big, W, H);
    const back = transformAbout(there, big, IDENTITY, W, H);
    expect(back.x).toBeCloseTo(cell.x, 6);
    expect(back.y).toBeCloseTo(cell.y, 6);
    expect(back.scale).toBeCloseTo(cell.scale, 6);
    expect(back.rotation).toBeCloseTo(0, 6);
  });
  it('composeWith：整組是原本的位置＝不變', () => {
    const cell = t(0.2, 0.8, 0.7);
    expect(composeWith(cell, IDENTITY, W, H)).toEqual(cell);
  });
});

describe('groupPatch：對版型裡某個物件的操作換成整組的操作', () => {
  it('在格子上拖移 dx、dy：整組移動同樣的量', () => {
    const out = groupPatch(t(0.5, 0.5), t(0.4, 0.3, 0.7), { x: 0.5, y: 0.35 });
    expect(out.x).toBeCloseTo(0.6);
    expect(out.y).toBeCloseTo(0.55);
    expect(out.scale).toBe(1);
  });
  it('在格子上雙指縮放：用縮放的比例乘整組的大小；旋轉量一樣加上去', () => {
    const out = groupPatch(t(0.5, 0.5, 0.8, 10), t(0.4, 0.3, 0.5, 0), { scale: 0.25, rotation: 90 });
    expect(out.scale).toBeCloseTo(0.4); // 0.8 × (0.25 ÷ 0.5)
    expect(out.rotation).toBeCloseTo(100);
  });
  it('對外框本身操作＝直接是那個值；透明度直接用', () => {
    const out = groupPatch(t(0.5, 0.5), t(0.5, 0.5), { x: 0.7, opacity: 0.4 });
    expect(out).toMatchObject({ x: 0.7, y: 0.5, scale: 1, opacity: 0.4 });
  });
});

describe('motionOffset：捲動、滑入滑出', () => {
  it('drift：開頭在下面（+0.35）、中間在原位、結尾在上面（−0.35）', () => {
    expect(motionOffset('drift', 0, 4).y).toBeCloseTo(0.35);
    expect(motionOffset('drift', 2, 4).y).toBeCloseTo(0);
    expect(motionOffset('drift', 4, 4).y).toBeCloseTo(-0.35);
  });
  it('slide：開頭在畫面右邊外面、很快滑進來、結尾往左滑出', () => {
    expect(motionOffset('slide', 0, 6).x).toBeCloseTo(1);
    expect(motionOffset('slide', 0.8, 6).x).toBeCloseTo(0);
    expect(motionOffset('slide', 3, 6).x).toBeCloseTo(0);
    expect(motionOffset('slide', 6, 6).x).toBeCloseTo(-1);
  });
  it('沒有動畫＝不動', () => {
    expect(motionOffset(undefined, 1, 4)).toEqual({ x: 0, y: 0 });
  });
});
