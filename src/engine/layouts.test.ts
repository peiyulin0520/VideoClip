import { describe, expect, it } from 'vitest';
import type { Asset } from '../model/types';
import { itemBox, type GeoCtx } from './geometry';
import {
  applyLineScale,
  buildIn,
  cellGap,
  cellItem,
  cellRect,
  cellTransform,
  coverCrop,
  defOf,
  GRID_MAX,
  LINE_MAX,
  gridDef,
  LAYOUTS,
  layoutById,
  planCell,
  type Rect,
} from './layouts';

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

describe('planCell', () => {
  it('素材比格子短：keep 留後面空白；blank before 空白在前面', () => {
    expect(planCell(2, 3, 'keep')).toEqual({ speed: 1, duration: 2, offset: 0, blank: [2, 3] });
    expect(planCell(2, 3, 'blank', 'before')).toEqual({ speed: 1, duration: 2, offset: 1, blank: [0, 1] });
  });
  it('fit：慢動作 speed = S/L；快動作；超出範圍有限制', () => {
    expect(planCell(2, 3, 'fit').speed).toBeCloseTo(2 / 3, 6);
    expect(planCell(2, 3, 'fit').blank).toBeNull();
    expect(planCell(6, 3, 'fit')).toMatchObject({ speed: 2, duration: 3, blank: null });
    const slow = planCell(0.3, 3, 'fit');
    expect(slow.speed).toBe(0.25);
    expect(slow.duration).toBeCloseTo(1.2, 6);
    expect(slow.blank![0]).toBeCloseTo(1.2, 6);
    expect(planCell(100, 3, 'fit').speed).toBe(4);
  });
  it('素材比格子長：keep 只用前面', () => {
    expect(planCell(10, 3, 'keep')).toEqual({ speed: 1, duration: 3, offset: 0, blank: null });
  });
});

describe('版型 v2：左右雙格、自訂格數、版型大小', () => {
  it('左右雙格：兩格左右並排、同高', () => {
    const b = layoutById('split-1x2').build(1080, 1920);
    expect(b.windows).toHaveLength(2);
    expect(b.windows[0]!.y).toBeCloseTo(b.windows[1]!.y, 6);
    expect(b.windows[0]!.x + b.windows[0]!.w).toBeLessThan(b.windows[1]!.x);
  });
  it('gridDef：列×欄格數、不重疊、都在版型範圍內；超出範圍的列欄被夾住', () => {
    const d = gridDef(3, 2);
    const b = d.build(1000, 1000);
    expect(b.windows).toHaveLength(6);
    for (const w of b.windows) {
      expect(w.x).toBeGreaterThanOrEqual(0);
      expect(w.x + w.w).toBeLessThanOrEqual(1000.001);
      expect(w.y + w.h).toBeLessThanOrEqual(1000.001);
    }
    expect(gridDef(9, 9).cells).toBe(GRID_MAX * GRID_MAX);
    expect(gridDef(0, 0).cells).toBe(1);
  });
  it('buildIn：沒給大小＝整個畫面；給大小＝縮小後置中，格子長寬比例跟著版型', () => {
    const d = gridDef(1, 2);
    const full = buildIn(d, 1000, 2000);
    expect(full.windows[0]!.h).toBeGreaterThan(1500);
    const small = buildIn(d, 1000, 2000, { w: 0.5, h: 0.25 });
    // 版型寬 500、高 500，放在畫面正中央（x 從 250、y 從 750）
    const xs = small.windows.map((w) => w.x);
    const ys = small.windows.map((w) => w.y);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(250);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(750);
    expect(Math.max(...small.windows.map((w) => w.x + w.w))).toBeLessThanOrEqual(750.001);
    expect(Math.max(...small.windows.map((w) => w.y + w.h))).toBeLessThanOrEqual(1250.001);
    expect(small.panels[0]).toMatchObject({ x: 250, y: 750, w: 500, h: 500 });
  });
  it('defOf：自訂格數依列欄產生，其他依 id', () => {
    expect(defOf({ layout: 'grid', rows: 2, cols: 3 }).cells).toBe(6);
    expect(defOf({ layout: 'booth-2x2' }).cells).toBe(4);
  });
});

describe('格子之間的框線粗細', () => {
  const b0 = gridDef(1, 2).build(1000, 1000);
  const gapOf = (b: typeof b0) => b.windows[1]!.x - (b.windows[0]!.x + b.windows[0]!.w);
  it('cellGap：兩格之間的空隙；只有一格沒有', () => {
    expect(cellGap(b0.windows)).toBeCloseTo(gapOf(b0), 3);
    expect(cellGap(gridDef(1, 1).build(1000, 1000).windows)).toBeUndefined();
  });
  it('applyLineScale：2 倍＝空隙變 2 倍、0＝格子貼在一起、1＝不動；格子仍在原範圍內', () => {
    const g = gapOf(b0);
    expect(gapOf(applyLineScale(b0, 2))).toBeCloseTo(g * 2, 3);
    expect(gapOf(applyLineScale(b0, 0))).toBeCloseTo(0, 3);
    expect(applyLineScale(b0, 1)).toBe(b0);
    expect(gapOf(applyLineScale(b0, 99))).toBeCloseTo(g * LINE_MAX, 3); // 上限 3 倍
    for (const w of applyLineScale(b0, 3).windows) expect(w.w).toBeGreaterThan(0);
  });
  it('buildIn 帶 line；每個內建多格版型都有框線可調，拍立得（一格）沒有', () => {
    for (const d of LAYOUTS) {
      const gap = cellGap(d.build(1080, 1920).windows);
      if (d.cells === 1) expect(gap).toBeUndefined();
      else expect(gap).toBeGreaterThan(0);
    }
    const thick = buildIn(gridDef(1, 2), 1000, 1000, undefined, 2);
    expect(gapOf(thick)).toBeCloseTo(gapOf(b0) * 2, 3);
  });
});
