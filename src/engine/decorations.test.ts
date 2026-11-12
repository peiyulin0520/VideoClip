import { describe, expect, it } from 'vitest';
import { DECORATION_KINDS, decorationOps, lineSpan, opsBounds, type Rect } from './decorations';

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

describe('裝飾：長度、透明度、放大後的範圍', () => {
  const ink: Rect = { x: 100, y: 50, w: 400, h: 80 };
  const spanOf = (d: Parameters<typeof decorationOps>[0]) => {
    const b = opsBounds(decorationOps(d, ink))!;
    return { l: b.l, r: b.r, w: b.r - b.l };
  };

  it('lineSpan：置中／靠左／靠右，長度限制在 20%–150%', () => {
    expect(lineSpan(0, 100, 1, 'center')).toEqual([0, 100]);
    expect(lineSpan(0, 100, 0.5, 'center')).toEqual([25, 75]);
    expect(lineSpan(0, 100, 0.5, 'start')).toEqual([0, 50]);
    expect(lineSpan(0, 100, 0.5, 'end')).toEqual([50, 100]);
    expect(lineSpan(0, 100, 0.01, 'start')).toEqual([0, 20]);
    expect(lineSpan(0, 100, 9, 'start')).toEqual([0, 150]);
    expect(lineSpan(0, 100, undefined, undefined)).toEqual([0, 100]);
  });

  it('底線類：長度 50% → 線約一半長；預設（沒有 length）和 length=1 完全一樣', () => {
    for (const kind of ['dashed-underline', 'dotted-underline', 'double-line', 'wave-underline'] as const) {
      const base = { kind, color: '#f00', width: 0.06 };
      const full = spanOf(base);
      expect(spanOf({ ...base, length: 1 })).toEqual(full);
      const half = spanOf({ ...base, length: 0.5 });
      expect(half.w).toBeLessThan(full.w * 0.62);
      expect(half.w).toBeGreaterThan(full.w * 0.4);
      // 置中：中心不變；靠左：左端不變；靠右：右端不變
      expect((half.l + half.r) / 2).toBeCloseTo((full.l + full.r) / 2, 0);
      expect(spanOf({ ...base, length: 0.5, align: 'start' }).l).toBeCloseTo(full.l, 0);
      expect(spanOf({ ...base, length: 0.5, align: 'end' }).r).toBeCloseTo(full.r, 0);
      // 拉長
      expect(spanOf({ ...base, length: 1.5 }).w).toBeGreaterThan(full.w * 1.3);
    }
  });

  it('螢光筆也能縮短', () => {
    const base = { kind: 'marker' as const, color: '#ff0', width: 1 };
    expect(spanOf({ ...base, length: 0.5 }).w).toBeLessThan(spanOf(base).w * 0.62);
    expect(spanOf({ ...base, length: 1 })).toEqual(spanOf(base));
  });

  it('尾端圈圈：縮短只縮直線段，圈圈（右端）位置與大小不變；length=1 跟以前一樣', () => {
    const base = { kind: 'tail-loop' as const, color: '#f00', width: 0.15 };
    const full = opsBounds(decorationOps(base, ink))!;
    expect(opsBounds(decorationOps({ ...base, length: 1 }, ink))).toEqual(full);
    const short = opsBounds(decorationOps({ ...base, length: 0.3 }, ink))!;
    expect(short.r).toBeCloseTo(full.r, 3);
    expect(short.b).toBeCloseTo(full.b, 3);
    expect(short.l).toBeGreaterThan(full.l + 100);
    expect(short.r - short.l).toBeGreaterThan(ink.h); // 圈圈還在
  });

  it('沒有長度的裝飾（星星、愛心…）不受 length 影響', () => {
    for (const kind of ['sparkles', 'hearts', 'check', 'arrow-curve'] as const) {
      const base = { kind, color: '#f00', width: 0.1 };
      expect(decorationOps({ ...base, length: 0.3 }, ink)).toEqual(decorationOps(base, ink));
    }
  });

  it('透明度乘進每一筆；螢光筆本來的 0.65 也會再乘', () => {
    const o = decorationOps({ kind: 'double-line', color: '#f00', width: 0.05, opacity: 0.4 }, ink);
    expect(o.length).toBe(2);
    for (const op of o) expect(op.alpha).toBeCloseTo(0.4);
    expect(
      decorationOps({ kind: 'marker', color: '#ff0', width: 1, opacity: 0.5 }, ink)[0]!.alpha,
    ).toBeCloseTo(0.325);
    expect(decorationOps({ kind: 'double-line', color: '#f00', width: 0.05 }, ink)[0]!.alpha).toBeUndefined();
    expect(
      decorationOps({ kind: 'double-line', color: '#f00', width: 0.05, opacity: 1 }, ink)[0]!.alpha,
    ).toBe(undefined);
  });

  it('範圍放大後仍然有限：粗細 60%、距離 −100%～300%、大小 20%～400%', () => {
    for (const k of DECORATION_KINDS) {
      for (const over of [
        { width: 0.6 },
        { gap: -1 },
        { gap: 3 },
        { scale: 0.2 },
        { scale: 4 },
        { length: 0.2 },
        { length: 1.5 },
      ]) {
        const ops = decorationOps({ kind: k.kind, color: '#f00', width: k.width, ...over }, ink);
        const b = opsBounds(ops)!;
        expect(ops.length).toBeGreaterThan(0);
        expect([b.l, b.t, b.r, b.b].every(Number.isFinite)).toBe(true);
      }
    }
    // 距離 300% 的底線離字更遠；−100% 比 0 更靠上
    const y = (gap: number) =>
      opsBounds(decorationOps({ kind: 'dashed-underline', color: '#f00', width: 0.05, gap }, ink))!.t;
    expect(y(3)).toBeGreaterThan(y(0) + ink.h * 2.5);
    expect(y(-1)).toBeLessThan(y(0) - ink.h * 0.9);
  });

  it('每種裝飾標示有沒有「長度」「靠哪一邊」', () => {
    const by = Object.fromEntries(DECORATION_KINDS.map((k) => [k.kind, k]));
    for (const k of ['wave-underline', 'dashed-underline', 'dotted-underline', 'double-line', 'marker'])
      expect(by[k]).toMatchObject({ hasLength: true, hasAlign: true });
    expect(by['tail-loop']).toMatchObject({ hasLength: true, hasAlign: false });
    for (const k of [
      'sparkles',
      'hearts',
      'check',
      'arrow-curve',
      'slashes',
      'corner-brackets',
      'scribble-circle',
    ])
      expect(by[k]).toMatchObject({ hasLength: false, hasAlign: false });
  });
});
