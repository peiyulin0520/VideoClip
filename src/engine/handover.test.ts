import { describe, expect, it } from 'vitest';
import type { Item, VideoItem } from '../model/types';
import {
  HANDOVER_AFTER,
  HANDOVER_BEFORE,
  HANDOVER_RAMP,
  HANDOVER_TOL,
  handoverRemain,
  inHandover,
  pickSource,
  rampShown,
} from './handover';

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
    expect(HANDOVER_TOL).toBeLessThan(0.15); // 約 3 格
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

describe('handoverRemain／rampShown：交棒不往回跳', () => {
  it('B 換手範圍內回傳剩幾秒；A、範圍外是 null', () => {
    expect(handoverRemain(items, B, 4.5)).toBeCloseTo(HANDOVER_AFTER, 6);
    expect(handoverRemain(items, B, 4.5 + 1)).toBeCloseTo(HANDOVER_AFTER - 1, 6);
    expect(handoverRemain(items, B, 4.2)).toBeNull();
    expect(handoverRemain(items, A, 3.2)).toBeNull();
  });
  it('剩很多時照目標；快結束時慢慢靠近 <video> 的那一格；結束時剛好同一格', () => {
    expect(rampShown(5, 4.8, HANDOVER_RAMP + 0.5)).toBe(5);
    expect(rampShown(5, 4.8, HANDOVER_RAMP)).toBeCloseTo(5, 6);
    expect(rampShown(5, 4.8, HANDOVER_RAMP / 2)).toBeCloseTo(4.9, 6);
    expect(rampShown(5, 4.8, 0)).toBeCloseTo(4.8, 6);
  });
  it('對上了、落後太多、超前太多：不調整', () => {
    expect(rampShown(5, 5, 0.1)).toBe(5);
    expect(rampShown(5, 3, 0.1)).toBe(5);
    expect(rampShown(5, 5.9, 0.1)).toBe(5);
  });
  it('<video> 超前：預解圖在最後慢慢加速追上去，結束時剛好同一格；單調不倒退', () => {
    expect(rampShown(5, 5.3, HANDOVER_RAMP + 0.2)).toBe(5);
    expect(rampShown(5, 5.3, HANDOVER_RAMP / 2)).toBeCloseTo(5.15, 6);
    expect(rampShown(5, 5.3, 0)).toBeCloseTo(5.3, 6);
    let prev = -Infinity;
    for (let r = HANDOVER_AFTER; r >= 0; r -= 1 / 60) {
      const target = 10 + (HANDOVER_AFTER - r);
      const shown = rampShown(target, target + 0.3, r); // video 超前 0.3 秒
      expect(shown).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = shown;
    }
  });
  it('漸進過程中顯示的時間單調不倒退（時間往前走 1 倍時，每秒至少前進 0 秒）', () => {
    let prev = -Infinity;
    for (let r = HANDOVER_AFTER; r >= 0; r -= 1 / 60) {
      const target = 10 + (HANDOVER_AFTER - r);
      const cur = target - 0.4; // 落後 0.4，video 以 1 倍速在動
      const shown = rampShown(target, cur, r);
      expect(shown).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = shown;
    }
  });
});
