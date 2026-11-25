import { describe, expect, it } from 'vitest';
import { freshUploadState, RVFC_STALE_MS, shouldUpload } from './videoUpload';

const run = (frames: { fc: number | null; t: number; now: number; paused?: boolean }[]) => {
  const st = freshUploadState();
  return frames.map((f) => shouldUpload(st, { fc: f.fc, currentTime: f.t, paused: !!f.paused, now: f.now }));
};

describe('shouldUpload', () => {
  it('rVFC 正常：計數變才上傳，同一個計數不重複上傳', () => {
    expect(
      run([
        { fc: 1, t: 0.0, now: 0 },
        { fc: 1, t: 0.01, now: 8 },
        { fc: 2, t: 0.034, now: 16 },
        { fc: 2, t: 0.04, now: 24 },
        { fc: 3, t: 0.067, now: 33 },
      ]),
    ).toEqual([true, false, true, false, true]);
  });
  it('rVFC 正常時，影片時間量化變了也不會額外上傳（避免一秒上傳 60 次）', () => {
    const r = run([
      { fc: 5, t: 1.0, now: 0 },
      { fc: 5, t: 1.034, now: 20 }, // 時間換格了，但計數剛變過不到 80 ms
    ]);
    expect(r).toEqual([true, false]);
  });
  it('rVFC 停了（計數不變）、影片時間在走：用時間備援，每個影片格上傳一次', () => {
    const frames = Array.from({ length: 30 }, (_, i) => ({ fc: 7, t: 2 + i / 60, now: 1000 + i * 16.7 }));
    const n = run([{ fc: 7, t: 2, now: 1000 }, ...frames.slice(1)]).filter(Boolean).length;
    // 半秒（60 fps 螢幕，30 fps 影片）：第一次＋計數沒變 80 ms 之後每個量化格 → 約 12～15 次，不是 30 次、更不是 0 次
    expect(n).toBeGreaterThan(8);
    expect(n).toBeLessThan(18);
  });
  it('rVFC 停了但影片時間也沒走（卡住）：不上傳', () => {
    const r = run([
      { fc: 7, t: 2, now: 0 },
      { fc: 7, t: 2.001, now: 200 },
      { fc: 7, t: 2.002, now: 400 },
    ]);
    expect(r).toEqual([true, false, false]);
  });
  it('沒有 rVFC：影片時間換一格上傳一次', () => {
    expect(
      run([
        { fc: null, t: 0, now: 0 },
        { fc: null, t: 0.01, now: 8 },
        { fc: null, t: 0.034, now: 16 },
        { fc: null, t: 0.04, now: 24 },
        { fc: null, t: 0.07, now: 33 },
      ]),
    ).toEqual([true, false, true, false, true]);
  });
  it('暫停：影片時間變了才上傳；剛從播放變暫停也上傳一次', () => {
    expect(
      run([
        { fc: 3, t: 1, now: 0 },
        { fc: null, t: 1.02, now: 10, paused: true },
        { fc: null, t: 1.02, now: 20, paused: true },
        { fc: null, t: 2, now: 30, paused: true },
      ]),
    ).toEqual([true, true, false, true]);
  });
  it('門檻值', () => {
    expect(RVFC_STALE_MS).toBeGreaterThan(33); // 比一個影片格久
  });
});
