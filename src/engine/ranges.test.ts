import { describe, expect, it } from 'vitest';
import { createClip } from '../model/defaults';
import type { Asset, VideoItem } from '../model/types';
import { mergeRanges, splitByRanges } from './timeline';

const asset: Asset = {
  id: 'a',
  kind: 'video',
  name: 'a',
  mime: 'video/mp4',
  size: 1,
  duration: 10,
  width: 100,
  height: 100,
  hasAudio: true,
  thumbs: [],
};
const item = (extra: Partial<VideoItem> = {}): VideoItem => ({
  ...createClip(asset),
  id: 'orig',
  start: 5,
  trimIn: 2,
  duration: 6,
  ...extra,
});

describe('mergeRanges', () => {
  it('排序、夾住範圍、合併重疊或相接、丟掉太短的', () => {
    expect(
      mergeRanges(
        [
          [4, 6],
          [1, 3],
        ],
        10,
        0.2,
      ),
    ).toEqual([
      [1, 3],
      [4, 6],
    ]);
    expect(
      mergeRanges(
        [
          [1, 3],
          [2.5, 5],
        ],
        10,
        0.2,
      ),
    ).toEqual([[1, 5]]);
    expect(
      mergeRanges(
        [
          [1, 3],
          [3, 4],
        ],
        10,
        0.2,
      ),
    ).toEqual([[1, 4]]); // 相接
    expect(
      mergeRanges(
        [
          [-2, 1],
          [9, 15],
        ],
        10,
        0.2,
      ),
    ).toEqual([
      [0, 1],
      [9, 10],
    ]); // 夾在 0–10
    expect(
      mergeRanges(
        [
          [3, 3.1],
          [5, 6],
        ],
        10,
        0.2,
      ),
    ).toEqual([[5, 6]]);
    expect(mergeRanges([[6, 4]], 10, 0.2)).toEqual([[4, 6]]); // 起終點顛倒
    expect(mergeRanges([], 10, 0.2)).toEqual([]);
  });
});

describe('splitByRanges：一個片段依多段拆開，每段留在原本的時間位置', () => {
  it('一段：只是修剪（沿用 id，位置跟著起點算）', () => {
    const out = splitByRanges(item(), [[3, 6]], 10);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'orig', trimIn: 3, duration: 3 });
    expect(out[0]!.start).toBeCloseTo(6); // 5 + (3 − 2)
  });
  it('兩段：中間不要的變空位；第一段沿用 id，第二段新 id、不帶命名', () => {
    const out = splitByRanges(
      item({ label: '開場' }),
      [
        [2, 4],
        [6, 8],
      ],
      10,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'orig', label: '開場', trimIn: 2, duration: 2 });
    expect(out[0]!.start).toBeCloseTo(5);
    expect(out[1]!.id).not.toBe('orig');
    expect(out[1]!.label).toBeUndefined();
    expect(out[1]!.start).toBeCloseTo(9); // 5 + (6 − 2)
    expect(out[1]!.trimIn).toBe(6);
    expect(out[1]!.start).toBeGreaterThan(out[0]!.start + out[0]!.duration); // 中間有空位
  });
  it('三段、亂序、有重疊：合併後依時間排好', () => {
    const out = splitByRanges(
      item(),
      [
        [7, 9],
        [2, 3],
        [2.5, 4],
      ],
      10,
    );
    expect(out.map((o) => [o.trimIn, o.trimIn + o.duration])).toEqual([
      [2, 4],
      [7, 9],
    ]);
  });
  it('變速：時間軸長度 = 素材長度 ÷ 速度，位置也用速度換算', () => {
    const out = splitByRanges(
      item({ speed: 2, duration: 3 }),
      [
        [2, 4],
        [6, 8],
      ],
      10,
    );
    expect(out[0]!.duration).toBeCloseTo(1);
    expect(out[1]!.start).toBeCloseTo(5 + (6 - 2) / 2);
  });
  it('超出素材範圍會夾住；往前延伸超過專案開頭會切掉超出的部分', () => {
    const out = splitByRanges(item({ start: 0.5, trimIn: 2 }), [[0, 3]], 10);
    expect(out[0]!.start).toBe(0);
    expect(out[0]!.trimIn).toBeCloseTo(1.5); // 往前最多 0.5 秒
    expect(out[0]!.duration).toBeCloseTo(1.5);
    expect(
      splitByRanges(item(), [[9, 20]], 10)[0]!.trimIn + splitByRanges(item(), [[9, 20]], 10)[0]!.duration,
    ).toBeCloseTo(10);
  });
  it('沒有可用的段：空陣列', () => {
    expect(splitByRanges(item(), [[3, 3.05]], 10)).toEqual([]);
  });
});
