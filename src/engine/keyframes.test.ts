import { describe, expect, it } from 'vitest';
import type { Item, Project, VideoItem } from '../model/types';
import {
  adjustAt,
  keyframeIndexAt,
  removeKeyframe,
  shiftKeyframes,
  splitKeyframes,
  timeResolved,
  transformAt,
  upsertKeyframe,
  withTime,
} from './keyframes';
import { splitFree, trimStartFree } from './timeline';

const base = { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 };
const clip = (extra: Partial<VideoItem> = {}): VideoItem =>
  ({
    id: 'a',
    type: 'video',
    assetId: 'x',
    start: 10,
    duration: 8,
    trimIn: 0,
    speed: 1,
    volume: 1,
    fit: 'cover',
    transform: base,
    ...extra,
  }) as VideoItem;

const two = clip({
  keyframes: [
    { t: 0, x: 0.2, y: 0.2, scale: 1, rotation: 0, opacity: 1 },
    { t: 4, x: 0.8, y: 0.6, scale: 0.5, rotation: 90, opacity: 0.2 },
  ],
});

describe('transformAt：兩個定位之間線性漸變', () => {
  it('沒有定位＝物件本身的 transform', () => {
    expect(transformAt(clip(), 12)).toEqual(base);
  });
  it('第一個之前、最後一個之後維持那一個；中間線性', () => {
    expect(transformAt(two, 5).x).toBeCloseTo(0.2);
    expect(transformAt(two, 30).x).toBeCloseTo(0.8);
    const mid = transformAt(two, 12); // local 2 秒＝一半
    expect(mid.x).toBeCloseTo(0.5);
    expect(mid.y).toBeCloseTo(0.4);
    expect(mid.scale).toBeCloseTo(0.75);
    expect(mid.rotation).toBeCloseTo(45);
    expect(mid.opacity).toBeCloseTo(0.6);
    expect(transformAt(two, 13).x).toBeCloseTo(0.65); // 3/4
  });
  it('三個定位：落在後兩個之間時用後兩個內插', () => {
    const three = clip({
      keyframes: [
        { t: 0, ...base, x: 0 },
        { t: 2, ...base, x: 1 },
        { t: 4, ...base, x: 0 },
      ],
    });
    expect(transformAt(three, 13).x).toBeCloseTo(0.5); // local 3 → 1 到 0 的一半
  });
  it('只有一個定位：整段都是它', () => {
    const one = clip({ keyframes: [{ t: 3, ...base, x: 0.9 }] });
    expect(transformAt(one, 10).x).toBeCloseTo(0.9);
    expect(transformAt(one, 17).x).toBeCloseTo(0.9);
  });
});

describe('色調 adjustAt：線性漸變，沒寫的項目用物件本身的', () => {
  it('沒有色調＝undefined（合成器不用加濾鏡）', () => {
    expect(adjustAt(clip(), 12)).toBeUndefined();
  });
  it('物件本身的色調（沒有定位）直接用', () => {
    expect(adjustAt(clip({ adjust: { saturation: -0.5 } }), 12)).toMatchObject({
      saturation: -0.5,
      brightness: 0,
    });
  });
  it('兩個定位的飽和度 0 → −1：中間 −0.5；沒寫的亮度用物件本身的 0.2', () => {
    const it = clip({
      adjust: { brightness: 0.2 },
      keyframes: [
        { t: 0, ...base, adjust: { saturation: 0 } },
        { t: 4, ...base, adjust: { saturation: -1 } },
      ],
    });
    const a = adjustAt(it, 12)!;
    expect(a.saturation).toBeCloseTo(-0.5);
    expect(a.brightness).toBeCloseTo(0.2);
  });
});

describe('upsertKeyframe／removeKeyframe', () => {
  it('同一個時間（±1/60 秒）更新、不然插入並排序', () => {
    const a = upsertKeyframe(two, 4.01, { x: 0.1 });
    expect(a).toHaveLength(2);
    expect(a[1]!.x).toBe(0.1);
    expect(a[1]!.y).toBe(0.6); // 沒改的欄位保留
    const b = upsertKeyframe(two, 2, { x: 0.3 });
    expect(b.map((k) => k.t)).toEqual([0, 2, 4]);
    expect(b[1]!.x).toBe(0.3);
    expect(b[1]!.scale).toBeCloseTo(0.75); // 新的定位以「這一刻的內插值」當底
  });
  it('沒有定位的物件第一次新增：用物件目前的位置當底', () => {
    const k = upsertKeyframe(clip(), 0, { scale: 0.5 });
    expect(k).toEqual([{ t: 0, ...base, scale: 0.5 }]);
  });
  it('已經有色調定位時，新增的定位也帶這一刻的色調（不打斷漸變）', () => {
    const it = clip({
      keyframes: [
        { t: 0, ...base, adjust: { saturation: 0 } },
        { t: 4, ...base, adjust: { saturation: -1 } },
      ],
    });
    const k = upsertKeyframe(it, 2, { x: 0.3 });
    expect(k[1]!.adjust!.saturation).toBeCloseTo(-0.5);
  });
  it('改色調只改那一個定位的那一項', () => {
    const k = upsertKeyframe(two, 0, { adjust: { brightness: 0.4 } });
    expect(k[0]!.adjust).toEqual({ brightness: 0.4 });
    expect(k[1]!.adjust).toBeUndefined();
  });
  it('keyframeIndexAt／removeKeyframe', () => {
    expect(keyframeIndexAt(two, 4)).toBe(1);
    expect(keyframeIndexAt(two, 3)).toBe(-1);
    expect(removeKeyframe(two, 0)).toHaveLength(1);
  });
});

describe('分割與修剪：定位的位置要對', () => {
  it('splitKeyframes：切點兩邊各補一個內插值，後段時間平移', () => {
    const { a, b } = splitKeyframes(two, 2);
    expect(a!.map((k) => k.t)).toEqual([0, 2]); // 前段：t=0 保留，切點補一個
    expect(b![0]!.t).toBe(0);
    expect(b![0]!.x).toBeCloseTo(0.5);
    expect(b![b!.length - 1]!.t).toBeCloseTo(2); // 原本 t=4 → 平移成 2
    expect(b![b!.length - 1]!.x).toBeCloseTo(0.8);
  });
  it('splitFree：前後兩段在切點的位置一樣、各自的終點／起點不變', () => {
    const out = splitFree([two] as Item[], 'a', 12)!;
    const [p, q] = out as VideoItem[];
    expect(transformAt(p!, 11.99).x).toBeCloseTo(transformAt(q!, 12.01).x, 1);
    expect(transformAt(q!, 18).x).toBeCloseTo(0.8);
    expect(transformAt(p!, 10).x).toBeCloseTo(0.2);
  });
  it('trimStartFree：頭端往後切 1 秒，同一個時間的位置不變', () => {
    const [t] = trimStartFree([two] as Item[], 'a', 1) as VideoItem[];
    expect(t!.start).toBe(11);
    expect(transformAt(t!, 13).x).toBeCloseTo(transformAt(two, 13).x);
    expect(shiftKeyframes(undefined, 1)).toBeUndefined();
  });
});

describe('withTime／timeResolved', () => {
  const project = (items: Item[]): Project =>
    ({
      width: 1080,
      height: 1920,
      assets: [],
      tracks: [{ id: 't', kind: 'media', items }],
    }) as unknown as Project;
  it('沒有任何定位：原樣回傳同一個物件（不複製）', () => {
    const p = project([clip()]);
    expect(timeResolved(p, 12)).toBe(p);
  });
  it('有定位的物件換成這個時間的位置，其他不動', () => {
    const other = clip({ id: 'b' });
    const r = timeResolved(project([two, other]), 12);
    expect(r.tracks[0]!.items[0]!.transform.x).toBeCloseTo(0.5);
    expect(r.tracks[0]!.items[1]).toBe(other);
    expect(withTime(two, 12).adjust).toBeUndefined();
  });
  it('版型：外框有定位＝各格跟著整組一起動（外框往右移 0.3，格子也往右移 0.3）', () => {
    const frame = clip({
      id: 'f',
      group: 'g',
      keyframes: [
        { t: 0, ...base },
        { t: 4, ...base, x: 0.8 },
      ],
    });
    const cell = clip({
      id: 'c',
      group: 'g',
      cell: { x: 0, y: 0, w: 0.5, h: 0.5 },
      transform: { ...base, x: 0.3 },
    });
    const r = timeResolved(project([frame, cell]), 14); // 外框走到終點：x 0.5 → 0.8
    expect(r.tracks[0]!.items[0]!.transform.x).toBeCloseTo(0.8);
    expect(r.tracks[0]!.items[1]!.transform.x).toBeCloseTo(0.6);
  });
});
