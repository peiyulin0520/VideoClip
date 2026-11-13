import { describe, expect, it } from 'vitest';
import type { Item, VideoItem } from '../model/types';
import {
  activeTransition,
  applyLook,
  clipPx,
  LEGACY_TRANSITIONS,
  TRANSITIONS,
  transitionFrame,
  transitionProgress,
  transitionSpan,
} from './transitions';
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
    const b = clip('b', 3, 3, { transitionIn: { kind: 'dissolve', duration: 0.5 } });
    expect(transitionSpan([a, b], b)?.cut).toBe(3);
    const gap = clip('b', 3.5, 3, { transitionIn: { kind: 'dissolve', duration: 0.5 } });
    expect(transitionSpan([a, gap], gap)).toBeNull();
    expect(transitionSpan([a, clip('c', 3, 3)], clip('c', 3, 3))).toBeNull(); // 沒設轉場
  });
  it('長度不會超過兩個片段各自長度的兩倍（各用一半）', () => {
    const a = clip('a', 0, 0.2);
    const b = clip('b', 0.2, 5, { transitionIn: { kind: 'whiteflash', duration: 1.2 } });
    expect(transitionSpan([a, b], b)!.d).toBeCloseTo(0.4, 6);
  });
});

describe('transitionProgress', () => {
  it('以接縫為中心：前半 A、後半 B', () => {
    const a = clip('a', 0, 3);
    const b = clip('b', 3, 3, { transitionIn: { kind: 'dissolve', duration: 1 } });
    const sp = transitionSpan([a, b], b)!;
    expect(transitionProgress(sp, 2.4)).toBeNull();
    expect(transitionProgress(sp, 2.5)).toBeCloseTo(0, 6);
    expect(transitionProgress(sp, 3)).toBeCloseTo(0.5, 6);
    expect(transitionProgress(sp, 3.5)).toBeNull();
  });
});

describe('目錄與舊名稱', () => {
  it('每一種都有分類與代號；舊名稱都能對應到新的', () => {
    expect(TRANSITIONS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(TRANSITIONS.map((t) => t.id)).size).toBe(TRANSITIONS.length);
    for (const t of TRANSITIONS) {
      expect(t.code).toHaveLength(1);
      expect(t.name.length).toBeGreaterThan(1);
    }
    for (const k of Object.values(LEGACY_TRANSITIONS)) expect(TRANSITIONS.some((t) => t.id === k)).toBe(true);
  });
});

describe('transitionFrame：每一種在開頭只看得到 A、結尾只看得到 B', () => {
  const visibleArea = (f: ReturnType<typeof transitionFrame>['a']): number => {
    if (f.opacity <= 0.001) return 0;
    if (f.clip?.kind === 'rects') return f.clip.rects.reduce((s, r) => s + r[2] * r[3], 0);
    if (f.clip?.kind === 'circle') return Math.min(Math.PI * f.clip.r ** 2, 1);
    return 1;
  };
  it.each(TRANSITIONS.map((t) => t.id))('%s', (kind) => {
    const f0 = transitionFrame(kind, 0);
    const f1 = transitionFrame(kind, 1);
    // 開頭：A 在原位完整，B 看不到（透明、裁掉、或在畫面外）
    expect(visibleArea(f0.a)).toBeGreaterThan(0.99);
    expect(Math.abs(f0.a.dx) + Math.abs(f0.a.dy)).toBeLessThan(1e-6);
    // （A 在上面而且完整蓋住時，B 在下面也看不到）
    const bGone0 =
      !f0.bOnTop || visibleArea(f0.b) < 0.01 || Math.abs(f0.b.dx) >= 0.69 || Math.abs(f0.b.dy) >= 0.69;
    expect(bGone0).toBe(true);
    // 結尾：B 在原位完整，A 看不到
    expect(visibleArea(f1.b)).toBeGreaterThan(0.99);
    expect(Math.abs(f1.b.dx) + Math.abs(f1.b.dy)).toBeLessThan(1e-6);
    expect(f1.b.scale).toBeCloseTo(1, 6);
    // （B 在上面而且完整蓋住時，A 在下面也看不到）
    const aGone1 =
      f1.bOnTop || visibleArea(f1.a) < 0.01 || Math.abs(f1.a.dx) >= 0.69 || Math.abs(f1.a.dy) >= 0.69;
    expect(aGone1).toBe(true);
    // 顏色層在兩端都是透明的（轉場結束後不會留下顏色）
    for (const c of [...f0.covers, ...f1.covers]) expect(c.alpha).toBeLessThan(0.02);
  });
  it('疊化：B 的透明度跟著進度；捲簾放下：B 從上往下露出來；左移：A 往左、B 從右進來', () => {
    expect(transitionFrame('dissolve', 0.5).b.opacity).toBeCloseTo(0.5, 6);
    const roll = transitionFrame('rollDown', 0.5).b.clip!;
    expect(roll.kind === 'rects' && roll.rects[0]![3]).toBeCloseTo(0.5, 1);
    const l = transitionFrame('moveL', 0.5);
    expect(l.a.dx).toBeLessThan(0);
    expect(l.b.dx).toBeGreaterThan(0);
    expect(l.a.dx - l.b.dx).toBeCloseTo(-1, 6); // 兩段始終緊貼著
  });
  it('四宮格：露出來的格子數隨進度增加', () => {
    const n = (p: number) => {
      const c = transitionFrame('grid4', p).b.clip!;
      return c.kind === 'rects' ? c.rects.length : -1;
    };
    expect(n(0)).toBe(0);
    expect(n(0.5)).toBeGreaterThan(0);
    expect(n(0.5)).toBeLessThan(4);
    expect(n(1)).toBe(4);
  });
  it('故障：同一個進度永遠算出同樣的結果（預覽與匯出一致）', () => {
    expect(transitionFrame('glitch2', 0.42)).toEqual(transitionFrame('glitch2', 0.42));
  });
});

describe('applyLook／clipPx', () => {
  it('applyLook：以畫面中心放大、位移用畫面寬高的比例', () => {
    const box = { cx: 100, cy: 200, w: 50, h: 80, rotation: 0 };
    const out = applyLook(box, { dx: 0.1, dy: -0.5, scale: 2, opacity: 1 }, 1000, 2000);
    expect(out.cx).toBeCloseTo(500 + (100 - 500) * 2 + 100, 6);
    expect(out.cy).toBeCloseTo(1000 + (200 - 1000) * 2 - 1000, 6);
    expect(out.w).toBe(100);
  });
  it('clipPx：比例換成畫面像素', () => {
    expect(clipPx({ kind: 'rects', rects: [[0, 0.5, 1, 0.25]] }, 100, 200).rects).toEqual([
      [0, 100, 100, 50],
    ]);
    expect(clipPx({ kind: 'circle', cx: 0.5, cy: 0, r: 0.5 }, 100, 200).circle).toEqual({
      cx: 50,
      cy: 0,
      r: 100,
    });
  });
});

describe('activeTransition：兩段真的重疊', () => {
  const A = clip('A', 0, 3, { trimIn: 1 });
  const B = clip('B', 3, 3, { trimIn: 2, transitionIn: { kind: 'dissolve', duration: 1 } });
  const items = [A, B] as Item[];
  it('接縫前：A 是原本的，B 提前出現（入點往前退、靜音）', () => {
    const at = activeTransition(items, 2.7)!;
    expect(at.a!.id).toBe('A');
    expect(at.a!.volume).toBe(1);
    expect(at.b!.id).toBe('B');
    expect(at.b!.start).toBeCloseTo(2.5, 6);
    expect(at.b!.trimIn).toBeCloseTo(1.5, 6); // 2 − 0.5
    expect(at.b!.volume).toBe(0);
    // 提前的 B 在同一個時間點對到的素材秒數，跟 B 自己播到那裡一樣
    expect(at.b!.trimIn + (2.7 - at.b!.start)).toBeCloseTo(B.trimIn + (2.7 - B.start), 6);
  });
  it('接縫後：B 是原本的，A 延長到接縫後的一半（靜音）', () => {
    const at = activeTransition(items, 3.2)!;
    expect(at.b!.id).toBe('B');
    expect(at.b!.volume).toBe(1);
    expect(at.a!.id).toBe('A');
    expect(at.a!.duration).toBeCloseTo(3.5, 6);
    expect(at.a!.volume).toBe(0);
  });
  it('B 的入點是 0（前面沒有素材）：提前的部分縮短，更早的時候 B 還沒出現', () => {
    const B0 = clip('B', 3, 3, { trimIn: 0.2, transitionIn: { kind: 'dissolve', duration: 1 } });
    expect(activeTransition([A, B0] as Item[], 2.6)!.b).toBeNull(); // 只能提前 0.2 秒
    expect(activeTransition([A, B0] as Item[], 2.9)!.b!.trimIn).toBeCloseTo(0, 6);
  });
  it('不在轉場期間回傳 null', () => {
    expect(activeTransition(items, 1)).toBeNull();
    expect(activeTransition(items, 4)).toBeNull();
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
