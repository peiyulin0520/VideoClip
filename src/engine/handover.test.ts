import { describe, expect, it } from 'vitest';
import type { Item, VideoItem } from '../model/types';
import { HANDOVER_AFTER, HANDOVER_BEFORE, HANDOVER_TOL, inHandover, pickSource } from './handover';

const vid = (id: string, start: number, duration: number, extra: Record<string, unknown> = {}) =>
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
    ...extra,
  }) as unknown as VideoItem;
// A：0–4，B：4–8，疊化 1 秒（置中：3.5–4.5）
const A = vid('A', 0, 4);
const B = vid('B', 4, 4, { transitionIn: { kind: 'dissolve', duration: 1 } });
const items = [A, B] as Item[];

describe('inHandover：轉場前後換手的範圍', () => {
  it('前一段 A：轉場開始（3.5）前 0.5 秒內；轉場進行中、更早都不算', () => {
    expect(inHandover(items, A, 3.0 - 0.01)).toBe(false);
    expect(inHandover(items, A, 3.0 + 0.01)).toBe(true);
    expect(inHandover(items, A, 3.49)).toBe(true);
    expect(inHandover(items, A, 3.5)).toBe(false); // 轉場開始：一律用預解圖
    expect(inHandover(items, A, 4.2)).toBe(false);
  });
  it('後一段 B：轉場結束（4.5）後 1 秒內', () => {
    expect(inHandover(items, B, 4.49)).toBe(false);
    expect(inHandover(items, B, 4.5)).toBe(true);
    expect(inHandover(items, B, 4.5 + HANDOVER_AFTER - 0.01)).toBe(true);
    expect(inHandover(items, B, 4.5 + HANDOVER_AFTER)).toBe(false);
    expect(inHandover(items, B, 3.0)).toBe(false);
  });
  it('沒有轉場的片段永遠不算', () => {
    const C = vid('C', 8, 4);
    expect(inHandover([A, B, C] as Item[], C, 8.2)).toBe(false);
    expect(inHandover([A, vid('B2', 4, 4)] as Item[], A, 3.9)).toBe(false);
  });
  it('常數合理', () => {
    expect(HANDOVER_BEFORE).toBeGreaterThan(0);
    expect(HANDOVER_TOL).toBeLessThan(0.05);
  });
});

describe('pickSource：換手時畫影片還是預解圖', () => {
  const base = { inHandover: true, haveCached: true, videoReady: true, diff: 0 };
  it('不在換手範圍：影片', () => {
    expect(pickSource({ ...base, inHandover: false, videoReady: false })).toBe('video');
  });
  it('沒有預解圖：影片（沒得選）', () => {
    expect(pickSource({ ...base, haveCached: false, videoReady: false })).toBe('video');
  });
  it('影片準備好、時間對上：換回影片', () => {
    expect(pickSource({ ...base, diff: HANDOVER_TOL })).toBe('video');
  });
  it('影片還沒準備好、或落後超過一格：繼續用預解圖', () => {
    expect(pickSource({ ...base, videoReady: false })).toBe('cached');
    expect(pickSource({ ...base, diff: HANDOVER_TOL + 0.01 })).toBe('cached');
    expect(pickSource({ ...base, diff: 0.63 })).toBe('cached');
  });
});
