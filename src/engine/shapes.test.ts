import { describe, expect, it } from 'vitest';
import type { PathCmd } from './decorations';
import { opsBounds } from './decorations';
import { SHAPES, shapePath } from './shapes';

/** 把路徑攤平成多邊形（貝茲曲線取樣），只取第一個子路徑 */
function flatten(cmds: PathCmd[]): [number, number][] {
  const pts: [number, number][] = [];
  let cur: [number, number] = [0, 0];
  for (const c of cmds) {
    if (c[0] === 'M' || c[0] === 'L') {
      cur = [c[1], c[2]];
      pts.push(cur);
    } else if (c[0] === 'C') {
      const [x0, y0] = cur;
      for (let i = 1; i <= 16; i++) {
        const t = i / 16;
        const u = 1 - t;
        pts.push([
          u * u * u * x0 + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5],
          u * u * u * y0 + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6],
        ]);
      }
      cur = [c[5], c[6]];
    } else break; // Z：第一個子路徑結束
  }
  return pts;
}
function inside(poly: [number, number][], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

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
