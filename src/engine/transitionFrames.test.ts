import { describe, expect, it } from 'vitest';
import type { Asset, Item, Project, VideoItem } from '../model/types';
import { FRAME_FPS, TransitionFrames, transitionNeeds, type FrameNeed } from './transitionFrames';

const asset = (id: string): Asset =>
  ({ id, kind: 'video', duration: 20, width: 1280, height: 720, mime: 'video/webm' }) as unknown as Asset;
const vid = (id: string, assetId: string, start: number, duration: number, trimIn = 0): VideoItem =>
  ({
    id,
    type: 'video',
    assetId,
    start,
    duration,
    trimIn,
    speed: 1,
    volume: 1,
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
  }) as unknown as VideoItem;
const proj = (items: Item[], assets: Asset[] = [asset('a'), asset('b')]): Project =>
  ({
    id: 'p',
    assets,
    tracks: [{ id: 't', kind: 'video', items }],
  }) as unknown as Project;
const withT = (v: VideoItem, kind = 'dissolve', duration = 1, mode?: 'hold'): Item =>
  ({ ...v, transitionIn: { kind, duration, ...(mode ? { mode } : {}) } }) as unknown as Item;

describe('transitionNeeds', () => {
  it('沒有轉場就沒有要解的', () => {
    expect(transitionNeeds(proj([vid('A', 'a', 0, 4), vid('B', 'b', 4, 4)]), 640)).toEqual([]);
  });
  it('一個疊化：前後兩段各一筆，範圍落在轉場那一秒附近的素材秒數', () => {
    const needs = transitionNeeds(proj([vid('A', 'a', 0, 4), withT(vid('B', 'b', 4, 4))]), 640);
    expect(needs.map((n) => n.assetId).sort()).toEqual(['a', 'b']);
    const a = needs.find((n) => n.assetId === 'a')!;
    const b = needs.find((n) => n.assetId === 'b')!;
    // 預設置中：3.5–4.5 秒；A 用到 3.5–4（之後凍結補足，範圍不超過 A 的尾端）、B 用到 0–0.5
    expect(a.t0).toBeCloseTo(3.5, 1);
    expect(b.t0).toBeCloseTo(0, 1);
    expect(a.at).toBe(4);
    expect(b.t1).toBeLessThan(2);
  });
  it('同一個素材的鍵會隨素材秒數、解析度改變（改了就作廢重解）', () => {
    const base = transitionNeeds(proj([vid('A', 'a', 0, 4), withT(vid('B', 'b', 4, 4))]), 640);
    const moved = transitionNeeds(proj([vid('A', 'a', 0, 4, 1), withT(vid('B', 'b', 4, 4))]), 640);
    const smaller = transitionNeeds(proj([vid('A', 'a', 0, 4), withT(vid('B', 'b', 4, 4))]), 480);
    const keyOf = (l: FrameNeed[], id: string) => l.find((n) => n.assetId === id)!.key;
    expect(keyOf(moved, 'a')).not.toBe(keyOf(base, 'a'));
    expect(keyOf(moved, 'b')).toBe(keyOf(base, 'b'));
    expect(keyOf(smaller, 'b')).not.toBe(keyOf(base, 'b'));
  });
  it('停格轉場也算（前一段停最後一格、後一段停第一格）', () => {
    const needs = transitionNeeds(
      proj([vid('A', 'a', 0, 4), withT(vid('B', 'b', 5, 4), 'moveL', 1, 'hold')]),
      640,
    );
    expect(needs.map((n) => n.assetId).sort()).toEqual(['a', 'b']);
  });
  it('照片不用解', () => {
    const photo = { ...vid('B', 'p', 4, 4), type: 'image' } as unknown as Item;
    const needs = transitionNeeds(
      proj([
        vid('A', 'a', 0, 4),
        { ...photo, transitionIn: { kind: 'dissolve', duration: 1 } } as unknown as Item,
      ]),
      640,
    );
    expect(needs.map((n) => n.assetId)).toEqual(['a']);
  });
});

describe('TransitionFrames', () => {
  const bm = () => ({ width: 2, height: 2, close() {} }) as unknown as ImageBitmap;
  const mk = (budget?: number) => {
    const decoded: string[] = [];
    const f = new TransitionFrames({
      projectId: () => 'p',
      getAsset: (id) => asset(id),
      budget,
      decode: async (need, _a, put) => {
        decoded.push(need.key);
        const n = Math.round((need.t1 - need.t0) * FRAME_FPS) + 1;
        for (let i = 0; i < n; i++) put(i, bm());
      },
    });
    return { f, decoded };
  };
  const need = (assetId: string, at: number, t0 = 0, t1 = 1): FrameNeed => ({
    key: `${assetId}|${t0}|${t1}|640|o`,
    assetId,
    t0,
    t1,
    at,
  });
  const settle = () => new Promise((r) => setTimeout(r, 20));

  it('解完之後 frameAt 找得到、範圍外找不到', async () => {
    const { f } = mk();
    f.update([need('a', 4)], 0);
    await settle();
    expect(f.ready).toBe(1);
    expect(f.frameAt('a', 0.5)).not.toBeNull();
    expect(f.frameAt('a', 3)).toBeNull();
    expect(f.frameAt('b', 0.5)).toBeNull();
  });
  it('離播放線近的先解', async () => {
    const { f, decoded } = mk();
    f.update([need('a', 30), need('b', 5)], 4);
    await settle();
    expect(decoded[0]).toContain('b|');
  });
  it('專案改了：不在需求裡的丟掉，鍵沒變的不重解', async () => {
    const { f, decoded } = mk();
    const a = need('a', 4);
    f.update([a, need('b', 8)], 0);
    await settle();
    expect(decoded).toHaveLength(2);
    f.update([a], 0);
    await settle();
    expect(decoded).toHaveLength(2);
    expect(f.frameAt('b', 0.5)).toBeNull();
    expect(f.frameAt('a', 0.5)).not.toBeNull();
    expect(f.total).toBe(1);
  });
  it('超過預算：丟最遠的，要是最遠的就是自己就不解', async () => {
    // 一筆 1 秒、31 格 × 640×360×4 ≈ 28.6MB；預算只放得下一筆
    const one = 640 * 360 * 4 * 31;
    const { f } = mk(Math.round(one * 1.2));
    f.update([need('a', 4), need('b', 20)], 4);
    await settle();
    expect(f.frameAt('a', 0.5)).not.toBeNull();
    expect(f.frameAt('b', 0.5)).toBeNull();
    // 播放線走到 b 附近：丟 a、解 b
    f.update([need('a', 4), need('b', 20)], 20);
    await settle();
    expect(f.frameAt('b', 0.5)).not.toBeNull();
    expect(f.frameAt('a', 0.5)).toBeNull();
  });
  it('解碼失敗：不重試，也不影響其他筆', async () => {
    let calls = 0;
    const f = new TransitionFrames({
      projectId: () => 'p',
      getAsset: (id) => asset(id),
      decode: async (n, _a, put) => {
        calls++;
        if (n.assetId === 'a') throw new Error('x');
        put(0, bm());
      },
    });
    f.update([need('a', 1), need('b', 2, 0, 0)], 0);
    await settle();
    f.update([need('a', 1), need('b', 2, 0, 0)], 0);
    await settle();
    expect(calls).toBe(2);
    expect(f.frameAt('b', 0)).not.toBeNull();
  });
});
