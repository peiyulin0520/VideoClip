import { describe, expect, it } from 'vitest';
import type { Asset, Crop, VideoItem } from '../model/types';
import {
  applyRatio,
  cropKeepingPlace,
  dragCrop,
  isNoCrop,
  keepSize,
  polygonCrop,
  smoothPolygon,
} from './crop';
import { itemBox, type GeoCtx } from './geometry';

const asset: Asset = {
  id: 'a',
  kind: 'video',
  name: 'a',
  mime: 'video/mp4',
  size: 1,
  duration: 5,
  width: 1920,
  height: 1080,
  hasAudio: false,
  thumbs: [],
};
const CW = 1080;
const CH = 1920;
const ctx: GeoCtx = { canvasW: CW, canvasH: CH, assets: [asset], textSize: () => ({ w: 0, h: 0 }) };
const item = (over: Partial<VideoItem> = {}): VideoItem => ({
  id: 'i',
  type: 'video',
  assetId: 'a',
  start: 0,
  duration: 5,
  trimIn: 0,
  speed: 1,
  volume: 1,
  fit: 'contain',
  transform: { x: 0.4, y: 0.6, scale: 0.8, rotation: 0, opacity: 1 },
  ...over,
});

/** 素材上某一點（原始畫面的比例）現在落在畫面哪個像素 */
function screenOf(it: VideoItem, u: number, v: number): [number, number] {
  const box = itemBox(it, ctx)!;
  const c = it.crop ?? { l: 0, t: 0, r: 0, b: 0 };
  const lx = ((u - (c.l + (1 - c.r)) / 2) / (1 - c.l - c.r)) * box.w;
  const ly = ((v - (c.t + (1 - c.b)) / 2) / (1 - c.t - c.b)) * box.h;
  const a = (box.rotation * Math.PI) / 180;
  return [box.cx + lx * Math.cos(a) - ly * Math.sin(a), box.cy + lx * Math.sin(a) + ly * Math.cos(a)];
}

describe('cropKeepingPlace：切完畫面不跳（像 PPT）', () => {
  const cases: [string, Partial<VideoItem>, Crop][] = [
    ['切左邊', {}, { l: 0.3, t: 0, r: 0, b: 0 }],
    ['切四邊', {}, { l: 0.1, t: 0.2, r: 0.25, b: 0.05 }],
    ['填滿', { fit: 'cover' }, { l: 0.2, t: 0.1, r: 0.1, b: 0.3 }],
    [
      '旋轉 30 度',
      { transform: { x: 0.4, y: 0.6, scale: 0.8, rotation: 30, opacity: 1 } },
      { l: 0.25, t: 0.15, r: 0.1, b: 0.2 },
    ],
    ['已經切過再切', { crop: { l: 0.1, t: 0.1, r: 0.1, b: 0.1 } }, { l: 0.3, t: 0.2, r: 0.2, b: 0.3 }],
    ['切過再往外拉回來', { crop: { l: 0.3, t: 0.2, r: 0.2, b: 0.3 } }, { l: 0.1, t: 0.05, r: 0.05, b: 0.1 }],
  ];
  for (const [name, over, nc] of cases)
    it(name, () => {
      const before = item(over);
      const res = cropKeepingPlace(before, asset, nc, CW, CH);
      const after = item({ ...over, crop: res.crop, transform: res.transform });
      // 兩次裁切都包含的點（原始畫面中心 0.5,0.5 附近，四個點）在畫面上的位置不變
      for (const [u, v] of [
        [0.5, 0.5],
        [0.45, 0.55],
        [0.55, 0.45],
      ] as const) {
        const p0 = screenOf(before, u, v);
        const p1 = screenOf(after, u, v);
        expect(Math.abs(p0[0] - p1[0])).toBeLessThan(0.5);
        expect(Math.abs(p0[1] - p1[1])).toBeLessThan(0.5);
      }
    });

  it('保留區域的四個角在畫面上的座標不變（切掉邊的時候）', () => {
    const before = item();
    const nc = { l: 0.2, t: 0.1, r: 0.3, b: 0.2 };
    const res = cropKeepingPlace(before, asset, nc, CW, CH);
    const after = item({ crop: res.crop, transform: res.transform });
    for (const [u, v] of [
      [nc.l, nc.t],
      [1 - nc.r, nc.t],
      [nc.l, 1 - nc.b],
      [1 - nc.r, 1 - nc.b],
    ] as const) {
      const p0 = screenOf(before, u, v);
      const p1 = screenOf(after, u, v);
      expect(Math.abs(p0[0] - p1[0])).toBeLessThan(0.5);
      expect(Math.abs(p0[1] - p1[1])).toBeLessThan(0.5);
    }
  });

  it('來回切：切了再還原，位置和大小回到原本', () => {
    const before = item();
    const cut = cropKeepingPlace(before, asset, { l: 0.3, t: 0.2, r: 0.1, b: 0.1 }, CW, CH);
    const back = cropKeepingPlace(
      item({ crop: cut.crop, transform: cut.transform }),
      asset,
      { l: 0, t: 0, r: 0, b: 0 },
      CW,
      CH,
    );
    expect(back.transform.x).toBeCloseTo(before.transform.x, 6);
    expect(back.transform.y).toBeCloseTo(before.transform.y, 6);
    expect(back.transform.scale).toBeCloseTo(before.transform.scale, 6);
  });
});

describe('dragCrop：拖把手', () => {
  const full: Crop = { l: 0, t: 0, r: 0, b: 0 };
  const A = 1920 / 1080;

  it('自由：拖邊只動那一邊，不會越過對邊、至少留 5%', () => {
    expect(dragCrop(full, 'l', 0.3, 0, A, null)).toEqual({ l: 0.3, t: 0, r: 0, b: 0 });
    expect(dragCrop(full, 'r', -0.4, 0, A, null).r).toBeCloseTo(0.4);
    expect(dragCrop(full, 'l', 5, 0, A, null).l).toBeCloseTo(0.95); // 最多留 5%
    expect(dragCrop(full, 'l', -1, 0, A, null).l).toBe(0); // 不能拖出畫面外
    const c = dragCrop({ l: 0.2, t: 0.1, r: 0.3, b: 0.1 }, 'br', -0.1, -0.2, A, null);
    expect(c).toMatchObject({ l: 0.2, t: 0.1 });
    expect(c.r).toBeCloseTo(0.4);
    expect(c.b).toBeCloseTo(0.3);
  });

  it('鎖定 1:1：四個角、四條邊都保持 1:1，對邊（角）或對邊中心（邊）不動', () => {
    for (const h of ['tl', 'tr', 'bl', 'br', 'l', 'r', 't', 'b'] as const) {
      const start = applyRatio(full, 1, A); // 先套 1:1
      const c = dragCrop(start, h, h.includes('l') ? 0.05 : -0.04, h.includes('t') ? 0.05 : -0.04, A, 1);
      const { w, h: hh } = keepSize(c);
      expect((w * A) / hh).toBeCloseTo(1, 6);
      expect(c.l).toBeGreaterThanOrEqual(-1e-9);
      expect(c.t).toBeGreaterThanOrEqual(-1e-9);
      expect(c.r).toBeGreaterThanOrEqual(-1e-9);
      expect(c.b).toBeGreaterThanOrEqual(-1e-9);
    }
    const s = applyRatio(full, 1, A);
    const br = dragCrop(s, 'br', -0.1, -0.1, A, 1);
    expect(br.l).toBeCloseTo(s.l, 9); // 左上角不動
    expect(br.t).toBeCloseTo(s.t, 9);
    const r = dragCrop(s, 'r', -0.1, 0, A, 1);
    expect((r.t + (1 - r.b)) / 2).toBeCloseTo((s.t + (1 - s.b)) / 2, 9); // 邊：垂直中心不動
  });

  it('鎖定比例時拉不出畫面外', () => {
    const s = applyRatio(full, 9 / 16, A);
    const c = dragCrop(s, 'tl', -5, -5, A, 9 / 16);
    expect(c.l).toBeGreaterThanOrEqual(-1e-9);
    expect(c.t).toBeGreaterThanOrEqual(-1e-9);
    const { w, h } = keepSize(c);
    expect((w * A) / h).toBeCloseTo(9 / 16, 6);
  });
});

describe('applyRatio / polygon', () => {
  it('在整個畫面取最大的置中 9:16（橫式影片）', () => {
    const A = 1920 / 1080;
    const c = applyRatio({ l: 0, t: 0, r: 0, b: 0 }, 9 / 16, A);
    const { w, h } = keepSize(c);
    expect(h).toBeCloseTo(1, 9);
    expect((w * A) / h).toBeCloseTo(9 / 16, 9);
    expect(c.l).toBeCloseTo(c.r, 9);
  });
  it('isNoCrop', () => {
    expect(isNoCrop(undefined)).toBe(true);
    expect(isNoCrop({ l: 0, t: 0, r: 0, b: 0 })).toBe(true);
    expect(isNoCrop({ l: 0.1, t: 0, r: 0, b: 0 })).toBe(false);
  });
  it('polygonCrop：框住多邊形', () => {
    const c = polygonCrop([
      [0.2, 0.3],
      [0.7, 0.3],
      [0.7, 0.8],
      [0.2, 0.8],
    ]);
    expect(c.l).toBeCloseTo(0.2);
    expect(c.t).toBeCloseTo(0.3);
    expect(c.r).toBeCloseTo(0.3);
    expect(c.b).toBeCloseTo(0.2);
  });
  it('smoothPolygon：點太少或面積太小回傳 null；正常的圈會被磨圓（點變多）、全部在 0–1 內', () => {
    expect(smoothPolygon([[0.1, 0.1]])).toBeNull();
    expect(
      smoothPolygon([
        [0.1, 0.5],
        [0.3, 0.5],
        [0.5, 0.5],
        [0.7, 0.5],
      ]),
    ).toBeNull(); // 一條線
    const raw: [number, number][] = [];
    for (let i = 0; i < 40; i++)
      raw.push([0.5 + 0.3 * Math.cos((i / 40) * 6.283), 0.5 + 0.3 * Math.sin((i / 40) * 6.283)]);
    const out = smoothPolygon(raw)!;
    expect(out.length).toBeGreaterThan(raw.length / 2);
    expect(out.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1)).toBe(true);
  });
});
