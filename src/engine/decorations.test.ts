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

describe('與文字的距離（gap）與大小（scale）', () => {
  const ext = (
    kind: (typeof DECORATION_KINDS)[number]['kind'],
    over: Record<string, number> = {},
    width = 0.06,
  ) => {
    const def = DECORATION_KINDS.find((k) => k.kind === kind)!;
    return opsBounds(
      decorationOps({ kind, color: '#f00', width: def.hasWidth ? width : def.width, ...over }, ink),
    )!;
  };

  it('底線類：距離越大離字越遠', () => {
    for (const k of [
      'wave-underline',
      'dashed-underline',
      'dotted-underline',
      'double-line',
      'tail-loop',
    ] as const) {
      expect(ext(k, { gap: 0.5 }).t).toBeGreaterThan(ext(k, { gap: 0 }).t + ink.h * 0.45);
    }
  });
  it('底線類：線從 5% 變粗到 25%，線的上緣不會往上碰到字（往下長）', () => {
    for (const k of ['wave-underline', 'dashed-underline', 'dotted-underline', 'double-line'] as const) {
      const thin = ext(k, {}, 0.05);
      const thick = ext(k, {}, 0.25);
      expect(Math.abs(thick.t - thin.t)).toBeLessThan(ink.h * 0.02);
      expect(thick.t).toBeGreaterThan(ink.y + ink.h); // 永遠在字下方
      expect(thick.b).toBeGreaterThan(thin.b); // 往下長
    }
  });
  it('預設值下，底線離字底至少 0.3 倍字高（使用者回報太貼近）', () => {
    for (const k of ['wave-underline', 'dashed-underline', 'dotted-underline', 'double-line'] as const) {
      expect(ext(k, {}, 0.06).t - (ink.y + ink.h)).toBeGreaterThan(ink.h * 0.28);
    }
  });
  it('負的距離可以靠近字（最多 −0.3）', () => {
    expect(ext('dashed-underline', { gap: -0.3 }).t).toBeLessThan(ext('dashed-underline', { gap: 0 }).t);
  });
  it('包圍類：往外擴', () => {
    for (const k of ['scribble-circle', 'corner-brackets'] as const) {
      const a = ext(k, { gap: 0 });
      const b = ext(k, { gap: 0.4 });
      expect(b.l).toBeLessThan(a.l - ink.h * 0.3);
      expect(b.r).toBeGreaterThan(a.r + ink.h * 0.3);
      expect(b.t).toBeLessThan(a.t - ink.h * 0.3);
      expect(b.b).toBeGreaterThan(a.b + ink.h * 0.3);
    }
  });
  it('兩側類：往左右推開', () => {
    for (const k of ['hearts', 'slashes', 'sparkles'] as const) {
      const a = ext(k, { gap: 0 });
      const b = ext(k, { gap: 0.5 });
      expect(b.r - b.l).toBeGreaterThan(a.r - a.l + ink.h * 0.5);
    }
    // 打勾、彎箭頭：只往一邊推
    expect(ext('check', { gap: 0.5 }).r).toBeLessThan(ext('check', { gap: 0 }).r - ink.h * 0.4);
    expect(ext('arrow-curve', { gap: 0.5 }).l).toBeGreaterThan(
      ext('arrow-curve', { gap: 0 }).l + ink.h * 0.4,
    );
  });
  it('螢光筆：距離＝上下位置', () => {
    expect(ext('marker', { gap: 0.3 }).t).toBeGreaterThan(ext('marker', { gap: 0 }).t + ink.h * 0.25);
  });
  it('大小：星星、愛心、打勾、彎箭頭變大；線寬不受大小影響', () => {
    for (const k of ['sparkles', 'hearts', 'check', 'arrow-curve'] as const) {
      const small = ext(k, { scale: 0.5 });
      const big = ext(k, { scale: 2 });
      expect(big.r - big.l).toBeGreaterThan(small.r - small.l);
      expect(big.b - big.t).toBeGreaterThanOrEqual(small.b - small.t);
      // 面積變大（文字本身的寬度算在裡面，所以不用太嚴格的倍數）
      expect((big.r - big.l) * (big.b - big.t)).toBeGreaterThan(
        (small.r - small.l) * (small.b - small.t) * 1.1,
      );
    }
    const w = (scale: number) =>
      decorationOps({ kind: 'check', color: '#f00', width: 0.1, scale }, ink)[0]!.width;
    expect(w(0.5)).toBe(w(2));
  });
  it('每種裝飾的調整項目標示正確（有粗細／有大小／距離名稱）', () => {
    const by = Object.fromEntries(DECORATION_KINDS.map((k) => [k.kind, k]));
    expect(by['marker']!.hasWidth).toBe(false);
    expect(by['marker']!.gapLabel).toBe('上下位置');
    expect(by['sparkles']).toMatchObject({ hasWidth: false, hasScale: true });
    expect(by['check']).toMatchObject({ hasWidth: true, hasScale: true });
    expect(by['tail-loop']).toMatchObject({ hasWidth: true, hasScale: false, gapLabel: '與文字距離' });
  });
});
