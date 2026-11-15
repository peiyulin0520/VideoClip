import { describe, expect, it } from 'vitest';
import type { Item, VideoItem } from '../model/types';
import type { GeoCtx } from './geometry';
import { groupClipArea, groupClipFor } from './scene';

const W = 1000;
const H = 1000;
const ctx: GeoCtx = {
  canvasW: W,
  canvasH: H,
  assets: [
    { id: 'f', kind: 'image', name: 'f', width: 1000, height: 1000, duration: 0, thumbs: [] } as never,
  ],
  textSize: () => ({ w: 100, h: 50 }),
};
const frame = (rotation: number, scale = 1): VideoItem =>
  ({
    id: 'f',
    type: 'image',
    assetId: 'f',
    group: 'g',
    start: 0,
    duration: 5,
    fit: 'contain',
    visible: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
    transform: { x: 0.5, y: 0.5, scale, rotation, opacity: 1 },
  }) as unknown as VideoItem;
const text: Item = {
  id: 't',
  type: 'text',
  group: 'g',
  start: 0,
  duration: 2,
  transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
  card: { runs: [], align: 'center' },
} as unknown as Item;
const none = { x: 0, y: 0 };

describe('groupClipArea：版型裡的文字／貼圖只露出外框線以內的範圍', () => {
  it('沒旋轉：外框看得到的範圍（矩形遮罩）', () => {
    const pts = groupClipArea(text, frame(0), ctx, W, H, none)!;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(250, 3);
    expect(Math.max(...xs)).toBeCloseTo(750, 3);
    expect(Math.min(...ys)).toBeCloseTo(250, 3);
    expect(Math.max(...ys)).toBeCloseTo(750, 3);
    expect(groupClipFor(text, frame(0), ctx, W, H, none)).toEqual({ rects: [[250, 250, 500, 500]] });
  });
  it('整個版型縮小 0.5：範圍跟著縮小、位置在中心', () => {
    const pts = groupClipArea(text, frame(0, 0.5), ctx, W, H, none)!;
    expect(Math.min(...pts.map((p) => p[0]))).toBeCloseTo(375, 3);
    expect(Math.max(...pts.map((p) => p[0]))).toBeCloseTo(625, 3);
  });
  it('旋轉 45 度：範圍是轉過的四邊形（多邊形遮罩），中心不變、對角線 = 邊長 × √2', () => {
    const clip = groupClipFor(text, frame(45), ctx, W, H, none)!;
    expect(clip.poly).toHaveLength(1);
    const pts = clip.poly![0]!;
    const cx = pts.reduce((s, p) => s + p[0], 0) / 4;
    const cy = pts.reduce((s, p) => s + p[1], 0) / 4;
    expect(cx).toBeCloseTo(500, 3);
    expect(cy).toBeCloseTo(500, 3);
    expect(Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]))).toBeCloseTo(
      500 * Math.SQRT2,
      2,
    );
  });
  it('外框自己、沒動過的格子不遮；force 時格子也回傳範圍', () => {
    expect(groupClipArea(frame(0), frame(0), ctx, W, H, none)).toBeUndefined();
    const cell = {
      ...frame(0),
      id: 'c',
      cell: { x: 0.3, y: 0.3, w: 0.2, h: 0.2 },
    } as unknown as VideoItem;
    expect(groupClipArea(cell, frame(0), ctx, W, H, none)).toBeUndefined();
    const pts = groupClipArea(cell, frame(0), ctx, W, H, none, true)!;
    expect(Math.min(...pts.map((p) => p[0]))).toBeCloseTo(300, 3);
    expect(
      groupClipArea({ ...cell, cellEdit: true } as unknown as VideoItem, frame(0), ctx, W, H, none),
    ).toBeDefined();
  });
});
