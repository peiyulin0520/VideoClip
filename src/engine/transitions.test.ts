import { describe, expect, it } from 'vitest';
import type { Item, VideoItem } from '../model/types';
import { applyLook, transitionLook, transitionProgress, transitionSpan, TRANSITIONS } from './transitions';
import { splitFree } from './timeline';

const clip = (id: string, start: number, duration: number, extra: Partial<VideoItem> = {}): VideoItem =>
  ({
    id,
    type: 'video',
    assetId: 'a',
    start,
    duration,
    trimIn: 0,
    speed: 1,
    volume: 1,
    fit: 'cover',
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
    ...extra,
  }) as VideoItem;

describe('transitionSpan', () => {
  it('前面緊接著另一個片段才有轉場；中間有空隙就沒有', () => {
    const a = clip('a', 0, 3);
    const b = clip('b', 3, 3, { transitionIn: { kind: 'fade', duration: 0.5 } });
    expect(transitionSpan([a, b], b)?.cut).toBe(3);
    const gap = clip('b', 3.5, 3, { transitionIn: { kind: 'fade', duration: 0.5 } });
    expect(transitionSpan([a, gap], gap)).toBeNull();
    expect(transitionSpan([a, clip('c', 3, 3)], clip('c', 3, 3))).toBeNull(); // 沒設轉場
  });
  it('長度不會超過兩個片段各自長度的兩倍（各用一半）', () => {
    const a = clip('a', 0, 0.2);
    const b = clip('b', 0.2, 5, { transitionIn: { kind: 'white', duration: 1.2 } });
    expect(transitionSpan([a, b], b)!.d).toBeCloseTo(0.4, 6);
  });
});

describe('transitionProgress', () => {
  it('以接縫為中心：前半在前一個片段，後半在後一個片段', () => {
    const a = clip('a', 0, 3);
    const b = clip('b', 3, 3, { transitionIn: { kind: 'fade', duration: 1 } });
    const sp = transitionSpan([a, b], b)!;
    expect(transitionProgress(sp, 2.4)).toBeNull();
    expect(transitionProgress(sp, 2.5)).toBeCloseTo(0, 6);
    expect(transitionProgress(sp, 3)).toBeCloseTo(0.5, 6);
    expect(transitionProgress(sp, 3.49)).toBeCloseTo(0.99, 2);
    expect(transitionProgress(sp, 3.5)).toBeNull();
  });
});

describe('transitionLook', () => {
  it('七種轉場都有；顏色層在接縫最濃、兩端是 0', () => {
    expect(TRANSITIONS.map((t) => t.code).join('')).toBe('淡黑白閃推升縮');
    for (const k of ['fade', 'black', 'white', 'flash'] as const) {
      expect(transitionLook(k, 0).cover!.alpha).toBeCloseTo(0, 6);
      expect(transitionLook(k, 0.5).cover!.alpha).toBeGreaterThanOrEqual(0.99);
      expect(transitionLook(k, 0.999).cover!.alpha).toBeLessThan(0.05);
    }
    expect(transitionLook('fade', 0.5).cover!.color).toBe('#000000');
    expect(transitionLook('white', 0.5).cover!.color).toBe('#ffffff');
  });
  it('左推：前一個往左滑出去，後一個從右邊滑進來', () => {
    expect(transitionLook('push', 0).dx).toBeCloseTo(0, 6);
    expect(transitionLook('push', 0.49).dx).toBeLessThan(-0.9);
    expect(transitionLook('push', 0.5).dx).toBeCloseTo(1, 6);
    expect(transitionLook('push', 0.999).dx).toBeCloseTo(0, 1);
  });
  it('縮放：離開時放大淡出，進來時從放大縮回來', () => {
    expect(transitionLook('zoom', 0.49).scale).toBeGreaterThan(1.5);
    expect(transitionLook('zoom', 0.49).opacity).toBeLessThan(0.1);
    expect(transitionLook('zoom', 0.5).opacity).toBeCloseTo(0, 6);
    expect(transitionLook('zoom', 0.999).scale).toBeCloseTo(1, 1);
  });
  it('applyLook：以畫面中心放大、位移用畫面寬高的比例', () => {
    const box = { cx: 100, cy: 200, w: 50, h: 80, rotation: 0 };
    const out = applyLook(box, { dx: 0.1, dy: -0.5, scale: 2, opacity: 1, cover: null }, 1000, 2000);
    expect(out.cx).toBeCloseTo(500 + (100 - 500) * 2 + 100, 6);
    expect(out.cy).toBeCloseTo(1000 + (200 - 1000) * 2 - 1000, 6);
    expect(out.w).toBe(100);
  });
});

describe('分割', () => {
  it('轉場在片段開頭：分割後只有前半留著', () => {
    const b = clip('b', 3, 4, { transitionIn: { kind: 'flash', duration: 0.5 } });
    const out = splitFree([b] as Item[], 'b', 5)!;
    expect((out[0] as VideoItem).transitionIn).toBeDefined();
    expect((out[1] as VideoItem).transitionIn).toBeUndefined();
  });
});
