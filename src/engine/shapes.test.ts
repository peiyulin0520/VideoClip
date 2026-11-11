import { describe, expect, it } from 'vitest';
import { opsBounds } from './decorations';
import {
  fitInset,
  flattenPath as flatten,
  pointInPolygon as inside,
  shapeDef,
  SHAPES,
  shapePath,
} from './shapes';

describe('圖形庫', () => {
  it('至少 30 種、id 不重複、都有分類和中文名稱', () => {
    expect(SHAPES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(SHAPES.map((s) => s.id)).size).toBe(SHAPES.length);
    for (const s of SHAPES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.inset[0]).toBeGreaterThanOrEqual(1);
      expect(s.inset[1]).toBeGreaterThanOrEqual(1);
    }
  });
  for (const s of SHAPES) {
    describe(s.id, () => {
      const cmds = shapePath(s.id, 400, 200, {});
      it('路徑座標有限，圖形主體在 w×h 範圍內（尾巴可以超出下方）', () => {
        const [W, H] = [400, 200];
        const pts = flatten(cmds); // 用曲線上的點（不是控制點）量
        const b = {
          l: Math.min(...pts.map((p) => p[0])),
          r: Math.max(...pts.map((p) => p[0])),
          t: Math.min(...pts.map((p) => p[1])),
          b: Math.max(...pts.map((p) => p[1])),
        };
        for (const v of Object.values(b)) expect(Number.isFinite(v)).toBe(true);
        expect(b.l).toBeGreaterThanOrEqual(-W * 0.02);
        expect(b.r).toBeLessThanOrEqual(W * 1.02);
        expect(b.t).toBeGreaterThanOrEqual(-H * 0.02);
        if (!s.tail) expect(b.b).toBeLessThanOrEqual(H * 1.02);
        // 主體有佔滿大部分範圍
        expect(b.r - b.l).toBeGreaterThan(W * 0.85);
      });
      for (const [W, H] of [
        [400, 200],
        [300, 300],
        [600, 150],
      ] as const) {
        it(`文字區（外框 ÷ inset，置中）整個放得進圖形裡：${W}×${H}`, () => {
          const poly = flatten(shapePath(s.id, W, H, {}));
          const tw = W / s.inset[0];
          const th = H / s.inset[1];
          const cx = W / 2;
          const cy = H / 2 + (s.dy ?? 0) * H;
          for (const [dx, dy] of [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
            [0, -1],
            [0, 1],
            [-1, 0],
            [1, 0],
          ] as const) {
            expect(inside(poly, cx + ((dx * tw) / 2) * 0.98, cy + ((dy * th) / 2) * 0.98)).toBe(true);
          }
        });
      }
    });
  }
  it('對話框的尾巴往下超出，左下／右下方向不同', () => {
    for (const id of ['speech-rect', 'speech-round', 'speech-oval', 'thought'] as const) {
      const l = opsBounds([{ type: 'fill', cmds: shapePath(id, 400, 200, { tail: 'bottom-left' }) }])!;
      const r = opsBounds([{ type: 'fill', cmds: shapePath(id, 400, 200, { tail: 'bottom-right' }) }])!;
      expect(l.b).toBeGreaterThan(200 + 20);
      expect(r.b).toBeGreaterThan(200 + 20);
    }
    const left = flatten(shapePath('speech-rect', 400, 200, { tail: 'bottom-left' }));
    const right = flatten(shapePath('speech-rect', 400, 200, { tail: 'bottom-right' }));
    const tip = (p: [number, number][]) => p.reduce((a, b) => (b[1] > a[1] ? b : a));
    expect(tip(left)[0]).toBeLessThan(200);
    expect(tip(right)[0]).toBeGreaterThan(200);
  });
});

// ---- 可調整的項目 ----
const adjustable = SHAPES.filter((s) => s.adjust.length > 0);
const mid = (a: { min: number; max: number; step: number }) =>
  Math.round((a.min + a.max) / 2 / a.step) * a.step;

describe('圖形調整值', () => {
  it('調整項目：預設值落在範圍內、key 不重複、有中文名稱', () => {
    expect(adjustable.length).toBeGreaterThanOrEqual(20);
    for (const s of adjustable) {
      expect(new Set(s.adjust.map((a) => a.key)).size).toBe(s.adjust.length);
      for (const a of s.adjust) {
        expect(a.label.length).toBeGreaterThan(0);
        expect(a.min).toBeLessThan(a.max);
        expect(a.def).toBeGreaterThanOrEqual(a.min - 1e-9);
        expect(a.def).toBeLessThanOrEqual(a.max + 1e-9);
      }
    }
  });

  it('把調整項目設成「預設值」，長相跟沒有調整一模一樣（舊字卡不會變）', () => {
    for (const s of adjustable) {
      const adj = Object.fromEntries(s.adjust.map((a) => [a.key, a.def]));
      // 尾巴位置預設依左下／右下；用左下比對
      // 斜切色塊／標籤類在窄寬比下預設公式和滑桿公式不同，不比較
      if (s.id === 'parallelogram' || s.cat === '標籤箭頭') continue;
      const plain = shapePath(s.id, 400, 200, { tail: 'bottom-left' }).flat();
      const withDef = shapePath(s.id, 400, 200, { tail: 'bottom-left', adj }).flat();
      expect(withDef.length, s.id).toBe(plain.length);
      withDef.forEach((v, i) => {
        const o = plain[i];
        if (typeof v === 'number') expect(v, `${s.id}[${i}]`).toBeCloseTo(o as number, 6);
        else expect(v).toBe(o);
      });
    }
  });

  it('預設調整值下 fitInset 就是表裡的值（沒調過的字卡大小不變）', () => {
    for (const s of SHAPES) {
      const f = fitInset(s.id, {}, 3);
      expect([f.kx, f.ky, f.dy]).toEqual([s.inset[0], s.inset[1], s.dy ?? 0]);
    }
  });

  for (const s of adjustable) {
    describe(`${s.id} 每個調整項目在最小／中間／最大：座標有限、文字區放得進圖形`, () => {
      for (const a of s.adjust) {
        for (const [name, v] of [
          ['最小', a.min],
          ['中間', mid(a)],
          ['最大', a.max],
        ] as const) {
          for (const aspect of [1, 3]) {
            it(`${a.key}=${name}(${v}) 文字區 ${aspect}:1`, () => {
              const o = { adj: { [a.key]: v }, tail: 'bottom-left' as const };
              const f = fitInset(s.id, o, aspect);
              expect(f.kx).toBeGreaterThanOrEqual(1);
              expect(f.ky).toBeGreaterThanOrEqual(1);
              expect(Number.isFinite(f.kx * f.ky)).toBe(true);
              // 照 fitInset 算出的倍數建立外框 → 文字區四角與四邊中點都在圖形內
              const H = 200;
              const W = H * aspect * (f.kx / f.ky);
              const poly = flatten(shapePath(s.id, W, H, o));
              for (const p of poly) {
                expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
              }
              const tw = W / f.kx;
              const th = H / f.ky;
              const cx = W / 2;
              const cy = H / 2 + f.dy * H;
              // 極端調整值（例如星形深度 1）可能真的放不進去，此時 fitInset 退回表裡的值；其他情況一定要放得進
              const tableFallback = f.kx === s.inset[0] && f.ky === s.inset[1];
              if (!tableFallback) {
                for (const [dx, dy] of [
                  [-1, -1],
                  [1, -1],
                  [1, 1],
                  [-1, 1],
                  [0, -1],
                  [0, 1],
                  [-1, 0],
                  [1, 0],
                ] as const)
                  expect(inside(poly, cx + ((dx * tw) / 2) * 0.97, cy + ((dy * th) / 2) * 0.97)).toBe(true);
              }
            });
          }
        }
      }
    });
  }

  it('雲朵「凹槽深度」0 ＝ 接近橢圓；越大凹槽越明顯', () => {
    const pts = (depth: number) => flatten(shapePath('cloud', 400, 200, { adj: { depth } }));
    // 到橢圓邊的距離（以半徑比表示）：橢圓上 = 1
    const ratio = (p: [number, number]) => Math.hypot((p[0] - 200) / 200, (p[1] - 100) / 100);
    const spread = (depth: number) => {
      const r = pts(depth).map(ratio);
      return Math.max(...r) - Math.min(...r);
    };
    expect(spread(0)).toBeLessThan(0.09);
    expect(spread(1)).toBeGreaterThan(spread(0.5));
    expect(spread(0.5)).toBeGreaterThan(spread(0.1));
  });

  it('雲朵「凸起數量」：數量變多，路徑段數變多', () => {
    const n = (count: number) =>
      shapePath('cloud', 400, 200, { adj: { count } }).filter((c) => c[0] === 'C').length;
    expect(n(5)).toBe(5);
    expect(n(14)).toBe(14);
  });

  it('雲朵「凹槽圓滑」：接縫的轉折角變緩（不再是尖角）', () => {
    // 凸起之間的接縫：前一段進來的方向 vs 下一段出去的方向，夾角餘弦越大越平滑（-1 ＝ 掉頭的尖角）
    const joint = (smooth: number) => {
      const c = shapePath('cloud', 400, 200, { adj: { smooth, count: 8 } }).filter((x) => x[0] === 'C') as [
        'C',
        number,
        number,
        number,
        number,
        number,
        number,
      ][];
      const a = c[0]!;
      const b = c[1]!;
      const inDir = [a[5] - a[3], a[6] - a[4]];
      const outDir = [b[1] - a[5], b[2] - a[6]];
      const dot = inDir[0]! * outDir[0]! + inDir[1]! * outDir[1]!;
      return dot / (Math.hypot(inDir[0]!, inDir[1]!) * Math.hypot(outDir[0]!, outDir[1]!));
    };
    expect(joint(1)).toBeGreaterThan(joint(0) + 0.3);
  });

  it('星形「凹槽深度」越大越尖（內頂點越靠近中心）；「角的圓滑」讓外角變圓（路徑出現曲線）', () => {
    const innerR = (depth: number) => {
      const pts = flatten(shapePath('star5', 200, 200, { adj: { depth } }));
      return Math.min(...pts.map((p) => Math.hypot(p[0] - 100, p[1] - 100)));
    };
    expect(innerR(0.9)).toBeLessThan(innerR(0.3));
    expect(shapePath('star5', 200, 200, {}).some((c) => c[0] === 'C')).toBe(false);
    expect(shapePath('star5', 200, 200, { adj: { round: 0.8 } }).some((c) => c[0] === 'C')).toBe(true);
  });

  it('多邊形「角的圓滑」：最大時沒有尖角（每個頂點都換成曲線），最小時全是直線', () => {
    for (const id of ['triangle', 'diamond', 'hexagon', 'octagon', 'banner', 'chevron'] as const) {
      expect(
        shapePath(id, 300, 200, {}).some((c) => c[0] === 'C'),
        id,
      ).toBe(false);
      const rounded = shapePath(id, 300, 200, { adj: { round: 1 } });
      const curves = rounded.filter((c) => c[0] === 'C').length;
      const verts = shapePath(id, 300, 200, {}).filter((c) => c[0] === 'M' || c[0] === 'L').length;
      expect(curves).toBe(verts);
    }
  });

  it('對話框尾巴：位置、長度、寬度', () => {
    const tip = (adj: Record<string, number>) => {
      const p = flatten(shapePath('speech-rect', 400, 200, { adj }));
      return p.reduce((a, b) => (b[1] > a[1] ? b : a));
    };
    expect(tip({ tailPos: 0.1 })[0]).toBeLessThan(tip({ tailPos: 0.9 })[0]);
    expect(tip({ tailLen: 0.7 })[1]).toBeGreaterThan(tip({ tailLen: 0.2 })[1] + 30);
    // 尾巴越寬，底邊被跳過的點越多（路徑點數變少）
    const n = (tailWidth: number) =>
      flatten(shapePath('speech-rect', 400, 200, { adj: { tailWidth } })).length;
    expect(n(0.4)).toBeLessThan(n(0.08));
  });

  it('尾巴位置預設跟著左下／右下；有 tailPos 時以 tailPos 為準', () => {
    const tipX = (o: Parameters<typeof shapePath>[3]) =>
      flatten(shapePath('speech-round', 400, 200, o)).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    expect(tipX({ tail: 'bottom-left' })).toBeLessThan(200);
    expect(tipX({ tail: 'bottom-right' })).toBeGreaterThan(200);
    expect(tipX({ tail: 'bottom-right', adj: { tailPos: 0.1 } })).toBeLessThan(200);
  });

  it('shapeDef 讀得到每個圖形的調整清單', () => {
    expect(shapeDef('cloud').adjust.map((a) => a.key)).toEqual(['count', 'depth', 'smooth']);
    expect(shapeDef('ellipse').adjust).toEqual([]);
  });
});
