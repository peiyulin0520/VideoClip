import { describe, expect, it } from 'vitest';
import type { Asset } from '../model/types';
import { itemBox, type GeoCtx } from './geometry';
import { cellItem, cellRect, cellTransform, coverCrop, LAYOUTS, type Rect } from './layouts';

const SIZES: [string, number, number][] = [
  ['9:16', 1080, 1920],
  ['1:1', 1080, 1080],
  ['16:9', 1920, 1080],
  ['3:4', 1080, 1440],
];
const inside = (a: Rect, b: Rect, eps = 0.5) =>
  a.x >= b.x - eps && a.y >= b.y - eps && a.x + a.w <= b.x + b.w + eps && a.y + a.h <= b.y + b.h + eps;
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

describe('版型：格子位置', () => {
  for (const def of LAYOUTS)
    for (const [name, W, H] of SIZES)
      it(`${def.name}（${name}）：格子數正確、都在外框裡、在畫面內、彼此不重疊、大小合理`, () => {
        const b = def.build(W, H);
        expect(b.windows).toHaveLength(def.cells);
        for (const w of b.windows) {
          expect(w.w).toBeGreaterThan(W * 0.04);
          expect(w.h).toBeGreaterThan(W * 0.04);
          expect(inside(w, { x: 0, y: 0, w: W, h: H })).toBe(true);
          expect(b.panels.some((p) => inside(w, p))).toBe(true);
        }
        for (let i = 0; i < b.windows.length; i++)
          for (let j = i + 1; j < b.windows.length; j++)
            expect(overlap(b.windows[i]!, b.windows[j]!)).toBe(false);
        for (const p of b.panels) expect(inside(p, { x: 0, y: 0, w: W, h: H })).toBe(true);
        for (const h of b.holes) {
          expect(inside(h, { x: 0, y: 0, w: W, h: H })).toBe(true);
          for (const w of b.windows) expect(overlap(h, w)).toBe(false); // 齒孔不會跑進格子
        }
      });
});

const asset = (w: number, h: number, kind: Asset['kind'] = 'video'): Asset => ({
  id: 'a',
  kind,
  name: 'a',
  mime: 'video/mp4',
  size: 1,
  duration: 5,
  width: w,
  height: h,
  hasAudio: false,
  thumbs: [],
});

describe('每一格的物件：素材裁好、剛好填滿格子', () => {
  const W = 1080;
  const H = 1920;
  const ctx = (a: Asset): GeoCtx => ({
    canvasW: W,
    canvasH: H,
    assets: [a],
    textSize: () => ({ w: 0, h: 0 }),
  });
  const wins: Rect[] = [
    { x: 100, y: 200, w: 521, h: 365 },
    { x: 60, y: 900, w: 300, h: 300 },
    { x: 500, y: 1200, w: 400, h: 700 },
  ];
  for (const [aw, ah] of [
    [1920, 1080],
    [1080, 1920],
    [1000, 1000],
    [400, 300],
    [3840, 2160],
  ] as const)
    for (const win of wins)
      it(`素材 ${aw}×${ah} 放進 ${Math.round(win.w)}×${Math.round(win.h)} 的格子：方框剛好等於格子`, () => {
        const a = asset(aw, ah);
        const item = cellItem(a, win, W, H, 0, 3, 'g1');
        const box = itemBox(item, ctx(a))!;
        expect(box.w).toBeCloseTo(win.w, 1);
        expect(box.h).toBeCloseTo(win.h, 1);
        expect(box.cx).toBeCloseTo(win.x + win.w / 2, 1);
        expect(box.cy).toBeCloseTo(win.y + win.h / 2, 1);
        expect(item.type).toBe(a.kind);
        expect(item.group).toBe('g1');
        expect(cellRect(item.cell!, W, H).w).toBeCloseTo(win.w, 3);
      });

  it('素材跟格子比例一樣：不用裁切；不一樣：只裁掉超出的那個方向（置中）', () => {
    expect(coverCrop({ width: 1000, height: 500 }, { x: 0, y: 0, w: 400, h: 200 })).toBeUndefined();
    const c = coverCrop({ width: 1000, height: 1000 }, { x: 0, y: 0, w: 400, h: 200 })!;
    expect(c.l).toBe(0);
    expect(c.r).toBe(0);
    expect(c.t).toBeCloseTo(0.25);
    expect(c.b).toBeCloseTo(0.25);
    const d = coverCrop({ width: 1000, height: 1000 }, { x: 0, y: 0, w: 200, h: 400 })!;
    expect(d.l).toBeCloseTo(0.25);
    expect(d.t).toBe(0);
  });

  it('cellTransform：裁切比例跟格子不一樣時蓋滿格子（不留空隙）', () => {
    const a = asset(1000, 1000);
    const win = { x: 100, y: 100, w: 400, h: 200 };
    const t = cellTransform(a, undefined, win, W, H); // 正方形素材、沒裁：寬 400 才夠蓋住高 200
    const base = Math.min(W / 1000, H / 1000) * 1000;
    expect(base * t.scale).toBeGreaterThanOrEqual(400 - 0.01);
  });

  it('時間與長度：照片、影片都用傳進來的長度；至少 0.2 秒', () => {
    const a = asset(100, 100, 'image');
    expect(cellItem(a, wins[0]!, W, H, 2, 4, 'g').start).toBe(2);
    expect(cellItem(a, wins[0]!, W, H, 2, 4, 'g').duration).toBe(4);
    expect(cellItem(a, wins[0]!, W, H, 0, 0, 'g').duration).toBe(0.2);
  });
});
