import { describe, expect, it } from 'vitest';
import type { Item, VideoItem } from '../model/types';
import { sourceTimeClamped } from './timeline';
import { activeTransition, holdSpan, seamsOf, transitionSpan } from './transitions';

const vid = (id: string, start: number, duration: number): VideoItem =>
  ({
    id,
    type: 'video',
    assetId: 'a',
    start,
    duration,
    trimIn: 0,
    speed: 1,
    volume: 1,
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
  }) as unknown as VideoItem;

// A：0–4，停格轉場 1 秒，所以 B 從 5 秒開始（4–5 是兩段中間的空白）
const A = vid('A', 0, 4);
const B = {
  ...vid('B', 5, 4),
  transitionIn: { kind: 'moveL', duration: 1, mode: 'hold' },
} as unknown as Item;
const items = [A, B] as Item[];

describe('停格轉場', () => {
  it('seamsOf／holdSpan：隔著剛好轉場長度的空白也算銜接；transitionSpan（重疊）不算', () => {
    expect(seamsOf(items)).toMatchObject([{ hold: true }]);
    expect(holdSpan(items, B)).toMatchObject({ start: 4, end: 5, d: 1 });
    expect(transitionSpan(items, B)).toBeNull();
  });
  it('空白的長度跟轉場長度對不上就不算（例如 A 被縮短）', () => {
    expect(holdSpan([vid('A', 0, 3), B] as Item[], B)).toBeNull();
  });
  it('只有空白那一秒有轉場：進度 0→1；前一段放完、後一段開始前後都沒有', () => {
    expect(activeTransition(items, 3.9)).toBeNull();
    expect(activeTransition(items, 4)?.p).toBeCloseTo(0, 6);
    expect(activeTransition(items, 4.5)?.p).toBeCloseTo(0.5, 6);
    expect(activeTransition(items, 5)).toBeNull();
    expect(activeTransition(items, 4.5)?.kind).toBe('moveL');
  });
  it('空白裡：前一段停在最後一格、後一段停在第一格，兩個都靜音', () => {
    for (const t of [4, 4.25, 4.5, 4.9]) {
      const at = activeTransition(items, t)!;
      const a = at.a as VideoItem;
      const b = at.b as VideoItem;
      expect(a.id).toBe('A');
      expect(b.id).toBe('B');
      expect(a.volume).toBe(0);
      expect(b.volume).toBe(0);
      expect(sourceTimeClamped(a, t, { duration: 60 })).toBeCloseTo(4 - 1 / 30, 3); // A 的最後一格
      expect(sourceTimeClamped(b, t, { duration: 60 })).toBeCloseTo(0, 3); // B 的第一格
    }
  });
});
