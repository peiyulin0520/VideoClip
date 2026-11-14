import { describe, expect, it } from 'vitest';
import type { VideoItem } from '../model/types';
import { audioRetained, audioSpans, invertRanges, isFullRange } from './audioRanges';

const it_ = (extra: Partial<VideoItem> = {}): VideoItem =>
  ({
    id: 'a',
    type: 'video',
    assetId: 'x',
    start: 0,
    duration: 4,
    trimIn: 1,
    speed: 1,
    volume: 1,
    ...extra,
  }) as VideoItem;

describe('audioRetained', () => {
  it('沒有 audioRanges＝整段都有聲音；有的話範圍內有、範圍外沒有（含起點、不含終點）', () => {
    expect(audioRetained(it_(), 3)).toBe(true);
    const x = it_({
      audioRanges: [
        [1, 2],
        [3, 4],
      ],
    });
    expect(audioRetained(x, 1)).toBe(true);
    expect(audioRetained(x, 1.99)).toBe(true);
    expect(audioRetained(x, 2)).toBe(false);
    expect(audioRetained(x, 2.5)).toBe(false);
    expect(audioRetained(x, 3.5)).toBe(true);
  });
});

describe('audioSpans：匯出混音要放的素材範圍', () => {
  it('沒有標記＝物件用到的整段；有標記＝跟物件的範圍取交集（速度 2 倍時素材範圍是兩倍長）', () => {
    expect(audioSpans(it_())).toEqual([[1, 5]]);
    expect(audioSpans(it_({ speed: 2 }))).toEqual([[1, 9]]);
    expect(
      audioSpans(
        it_({
          audioRanges: [
            [0, 2],
            [4, 9],
          ],
        }),
      ),
    ).toEqual([
      [1, 2],
      [4, 5],
    ]);
    expect(audioSpans(it_({ audioRanges: [[7, 9]] }))).toEqual([]); // 全在物件範圍外
  });
});

describe('isFullRange', () => {
  it('標記蓋住物件用到的整段（沒有靜音的地方）＝true', () => {
    expect(isFullRange(it_(), [[0, 10]])).toBe(true);
    expect(
      isFullRange(it_(), [
        [1, 3],
        [3, 5],
      ]),
    ).toBe(true);
    expect(
      isFullRange(it_(), [
        [1, 2],
        [3, 5],
      ]),
    ).toBe(false);
    expect(isFullRange(it_(), [[1.5, 5]])).toBe(false);
  });
});

describe('invertRanges：保留 ⇄ 靜音 互換', () => {
  it('中間挖一段、頭尾、整段、空', () => {
    expect(invertRanges([[1, 2]], [0, 4])).toEqual([
      [0, 1],
      [2, 4],
    ]);
    expect(
      invertRanges(
        [
          [0, 1],
          [3, 4],
        ],
        [0, 4],
      ),
    ).toEqual([[1, 3]]);
    expect(invertRanges([[0, 4]], [0, 4])).toEqual([]);
    expect(invertRanges([], [0, 4])).toEqual([[0, 4]]);
  });
  it('範圍超出、重疊、沒排序也行；互換兩次回到原樣', () => {
    expect(
      invertRanges(
        [
          [3, 9],
          [-2, 1],
          [0.5, 1.5],
        ],
        [0, 4],
      ),
    ).toEqual([[1.5, 3]]);
    const keep: [number, number][] = [
      [0, 1],
      [2, 3.5],
    ];
    expect(invertRanges(invertRanges(keep, [0, 4]), [0, 4])).toEqual(keep);
  });
});
