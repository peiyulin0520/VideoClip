import { describe, expect, it } from 'vitest';
import { DECORATION_KINDS, decorationOps, opsBounds, type Rect } from './decorations';

const ink: Rect = { x: 100, y: 50, w: 400, h: 100 };
const deco = (kind: (typeof DECORATION_KINDS)[number]['kind'], width = 0.1) => ({
  kind,
  color: '#f00',
  width,
});

describe('裝飾：每一種都有輸出、座標有限', () => {
  for (const k of DECORATION_KINDS) {
    it(k.kind, () => {
      const ops = decorationOps(deco(k.kind, k.width), ink);
      expect(ops.length).toBeGreaterThan(0);
      const bb = opsBounds(ops)!;
      expect(bb).toBeTruthy();
      for (const v of Object.values(bb)) expect(Number.isFinite(v)).toBe(true);
    });
  }
});

describe('尾端圈圈', () => {
  const bb = (w: number) => opsBounds(decorationOps(deco('tail-loop', 0.15), { ...ink, w }))!;
  it('從字左緣略前方開始，往右超出字右緣約 28%，下方延伸到約 1.2 倍字高', () => {
    const b = bb(400);
    expect(b.l).toBeLessThan(ink.x); // 左緣略前方
    expect(b.l).toBeGreaterThan(ink.x - 0.1 * ink.w);
    const over = (b.r - (ink.x + 400)) / 400;
    expect(over).toBeGreaterThan(0.25);
    expect(over).toBeLessThan(0.4);
    const below = (b.b - (ink.y + ink.h)) / ink.h;
    expect(below).toBeGreaterThan(1.1);
    expect(below).toBeLessThan(1.4);
  });
  it('字很長時圈圈不被拉扁：超出的寬度跟字高成比例，不跟字寬成比例', () => {
    const over = (w: number) => bb(w).r - (ink.x + w);
    expect(over(1600)).toBeCloseTo(over(3200), 0);
    expect(over(1600)).toBeLessThan(2.5 * ink.h);
  });
  it('一般長度（w/h 約 5）仍是等比縮放', () => {
    const over = (w: number) => bb(w).r - (ink.x + w);
    expect(over(500) / 500).toBeCloseTo(over(300) / 300, 1);
  });
});

describe('其他', () => {
  it('底線在字下方', () => {
    for (const k of ['wave-underline', 'dashed-underline', 'dotted-underline', 'double-line'] as const) {
      const b = opsBounds(decorationOps(deco(k, 0.06), ink))!;
      expect(b.t).toBeGreaterThan(ink.y + ink.h);
    }
  });
  it('手繪圈住比字大一圈、並且頭尾不閉合', () => {
    const ops = decorationOps(deco('scribble-circle', 0.07), ink);
    const b = opsBounds(ops)!;
    expect(b.l).toBeLessThan(ink.x);
    expect(b.r).toBeGreaterThan(ink.x + ink.w);
    const cmds = ops[0]!.cmds;
    const first = cmds[0] as ['M', number, number];
    const last = cmds[cmds.length - 1] as ['L', number, number];
    expect(Math.hypot(first[1] - last[1], first[2] - last[2])).toBeGreaterThan(ink.h * 0.1);
  });
  it('線寬跟字高成比例', () => {
    const a = decorationOps(deco('dashed-underline', 0.05), ink)[0]!.width!;
    const b = decorationOps(deco('dashed-underline', 0.1), ink)[0]!.width!;
    expect(b / a).toBeCloseTo(2);
  });
});
