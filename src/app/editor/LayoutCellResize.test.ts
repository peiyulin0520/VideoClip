import { describe, expect, it } from 'vitest';
import { dividersOf, moveDivider } from './LayoutCellResize';

const R = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

describe('拖格子大小：格子之間的線', () => {
  it('上下兩格＝一條橫線；左右兩格＝一條直線；2×2＝一條橫線＋一條直線（各自把同一條線上的格子併在一起）', () => {
    const two = [R(0.1, 0.1, 0.8, 0.35), R(0.1, 0.5, 0.8, 0.35)];
    const d = dividersOf(two);
    expect(d).toHaveLength(1);
    expect(d[0]!.dir).toBe('h');
    expect(d[0]!.at).toBeCloseTo(0.475, 5);
    const four = [
      R(0.1, 0.1, 0.38, 0.38),
      R(0.52, 0.1, 0.38, 0.38),
      R(0.1, 0.52, 0.38, 0.38),
      R(0.52, 0.52, 0.38, 0.38),
    ];
    const d4 = dividersOf(four);
    expect(d4.map((x) => x.dir).sort()).toEqual(['h', 'v']);
    expect(d4.find((x) => x.dir === 'v')!.pairs).toHaveLength(2);
  });
  it('拖線：一邊變大、另一邊變小、總和不變；最小大小會擋住', () => {
    const two = [R(0.1, 0.1, 0.8, 0.35), R(0.1, 0.5, 0.8, 0.35)];
    const [div] = dividersOf(two);
    const n = moveDivider(two, div!, 0.1);
    expect(n[0]!.h).toBeCloseTo(0.45, 5);
    expect(n[1]!.y).toBeCloseTo(0.6, 5);
    expect(n[1]!.h).toBeCloseTo(0.25, 5);
    expect(n[0]!.h + n[1]!.h).toBeCloseTo(0.7, 5);
    const far = moveDivider(two, div!, 5);
    expect(far[1]!.h).toBeCloseTo(0.08, 5); // 最小
    const back = moveDivider(two, div!, -5);
    expect(back[0]!.h).toBeCloseTo(0.08, 5);
  });
  it('2×2 拖中間的直線：兩列的格子一起變', () => {
    const four = [
      R(0.1, 0.1, 0.38, 0.38),
      R(0.52, 0.1, 0.38, 0.38),
      R(0.1, 0.52, 0.38, 0.38),
      R(0.52, 0.52, 0.38, 0.38),
    ];
    const v = dividersOf(four).find((x) => x.dir === 'v')!;
    const n = moveDivider(four, v, 0.05);
    expect(n[0]!.w).toBeCloseTo(0.43, 5);
    expect(n[2]!.w).toBeCloseTo(0.43, 5);
    expect(n[1]!.x).toBeCloseTo(0.57, 5);
    expect(n[3]!.x).toBeCloseTo(0.57, 5);
  });
});
