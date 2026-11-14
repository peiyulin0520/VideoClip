import { describe, expect, it } from 'vitest';
import type { Asset } from '../model/types';
import { expandThumbs, needsThumbs, thumbCount, thumbFor, thumbIndex, thumbStrip } from './thumbs';

describe('thumbCount：每 2 秒一張、最多 60 張', () => {
  it('短的至少 1 張；90 秒 45 張；10 分鐘 60 張', () => {
    expect(thumbCount(0.5)).toBe(1);
    expect(thumbCount(2)).toBe(1);
    expect(thumbCount(2.1)).toBe(2);
    expect(thumbCount(90)).toBe(45);
    expect(thumbCount(600)).toBe(60);
  });
});

describe('thumbFor：依時間挑縮圖，空的找最近的', () => {
  const t = ['a', 'b', 'c', 'd'];
  it('依時間算第幾張；超出範圍夾住', () => {
    expect(thumbIndex(4, 0, 8)).toBe(0);
    expect(thumbIndex(4, 3, 8)).toBe(1);
    expect(thumbIndex(4, 7.9, 8)).toBe(3);
    expect(thumbIndex(4, 99, 8)).toBe(3);
    expect(thumbIndex(4, -1, 8)).toBe(0);
    expect(thumbFor(t, 5, 8)).toBe('c');
  });
  it('那一格是空字串：找最近的有的', () => {
    expect(thumbFor(['a', '', '', 'd'], 3, 8)).toBe('a');
    expect(thumbFor(['a', '', '', 'd'], 5, 8)).toBe('d');
  });
  it('全部都沒有：undefined；只有一張：永遠是它', () => {
    expect(thumbFor([], 1, 8)).toBeUndefined();
    expect(thumbFor(['', ''], 1, 8)).toBeUndefined();
    expect(thumbFor(['x'], 6, 8)).toBe('x');
  });
});

describe('expandThumbs／thumbStrip／needsThumbs', () => {
  it('舊的 8 張攤成 90 秒的 45 格：每格先用時間上最近的舊縮圖', () => {
    const old = Array.from({ length: 8 }, (_, i) => `o${i}`);
    const e = expandThumbs(old, 45);
    expect(e).toHaveLength(45);
    expect(e[0]).toBe('o0');
    expect(e[44]).toBe('o7');
    expect(e[21]).toBe('o3');
    expect(expandThumbs(old, 8)).toEqual(old);
    expect(expandThumbs([], 5)).toEqual([]);
  });
  it('thumbStrip：從 t0 到 t1 平均挑 k 張', () => {
    const th = Array.from({ length: 10 }, (_, i) => `t${i}`);
    expect(thumbStrip(th, 10, 0, 10, 2)).toEqual(['t2', 't7']);
    expect(thumbStrip(th, 10, 5, 10, 1)).toEqual(['t7']);
    expect(thumbStrip([], 10, 0, 10, 3)).toEqual([]);
    expect(thumbStrip(['x'], 0, 0, 1, 3)).toEqual(['x']); // 照片
  });
  it('只有影片、還沒補滿的才需要補', () => {
    const v = { kind: 'video', duration: 30, thumbs: ['a'] } as unknown as Asset;
    expect(needsThumbs(v)).toBe(true);
    expect(needsThumbs({ ...v, thumbsFull: true })).toBe(false);
    expect(needsThumbs({ ...v, kind: 'image', duration: 0 })).toBe(false);
    expect(needsThumbs({ ...v, kind: 'audio' })).toBe(false);
  });
});
