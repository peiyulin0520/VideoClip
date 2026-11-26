import { describe, expect, it } from 'vitest';
import {
  Q_FLY_END,
  Q_NEW,
  flattenFactor,
  headDist,
  readForward,
  ribbonRoute,
  ribbonShape,
  windFactor,
  type Win,
} from './ribbon';

// 蓋滿（slice）的倍率：320×180 的 viewBox 蓋滿 W×H 的畫面，看得到的範圍
const winOf = (W: number, H: number): Win => {
  const k = Math.max(W / 320, H / 180);
  const ox = (W - 320 * k) / 2;
  const oy = (H - 180 * k) / 2;
  return { x0: -ox / k, y0: -oy / k, x1: (W - ox) / k, y1: (H - oy) / k };
};
const SIZES: [string, number, number][] = [
  ['9:16', 360, 640],
  ['3:4', 480, 640],
  ['1:1', 640, 640],
  ['16:9', 640, 360],
];
/** 跟 flow.ts 一樣算緞帶長度與粗細（字句 6 個字＋1 個空格） */
const dims = (win: Win) => {
  const vw = win.x1 - win.x0;
  const sw0 = 15 * 6.58;
  const size = Math.min(15, (15 * vw * 0.68) / sw0);
  const sw = (sw0 * size) / 15;
  return { L: sw + size * 1.2, thick: size * (26 / 15) };
};
const center = (win: Win) => ({ cx: (win.x0 + win.x1) / 2, cy: (win.y0 + win.y1) / 2 });
const shapeAtQ = (win: Win, q: number, seed = '蔡氏家族聚餐', t = 1) => {
  const { L, thick } = dims(win);
  const r = ribbonRoute(win, L, thick, seed);
  const c = center(win);
  return {
    L,
    r,
    sh: ribbonShape(r, headDist(q, r.total), L, thick * 0.3 * windFactor(q), t, {
      ...c,
      e: flattenFactor(q),
    }),
  };
};

describe('彎道收尾：緞帶的路線與形狀', () => {
  for (const [name, W, H] of SIZES) {
    const win = winOf(W, H);
    const { L, thick } = dims(win);
    it(`${name}：緞帶長度固定（不累加）、飄的時候整條都在畫面看得到的範圍內`, () => {
      const out: string[] = [];
      for (let q = 0.3; q <= 1; q += 0.01) {
        const { sh } = shapeAtQ(win, q);
        // 風的擺動讓沿線長度多一點點，其他時候就是 L
        if (Math.abs(sh.total / L - 1) > 0.15)
          out.push(`q=${q.toFixed(2)} 長度 ${sh.total.toFixed(1)}／${L.toFixed(1)}`);
        for (const p of sh.p)
          if (p.x < win.x0 || p.x > win.x1 || p.y < win.y0 || p.y > win.y1)
            out.push(`q=${q.toFixed(2)} 出界 (${p.x.toFixed(0)},${p.y.toFixed(0)})`);
      }
      expect(out.slice(0, 5)).toEqual([]);
      expect(thick).toBeGreaterThan(0);
    });
    it(`${name}：每 1/60 秒緞帶中心移動不超過畫面高的 8%（沒有跳）`, () => {
      let prev: { x: number; y: number } | null = null;
      let worst = 0;
      for (let f = 0; f <= 2.8 * 60; f++) {
        const q = f / (2.8 * 60);
        if (q < Q_NEW + 0.02) continue;
        const { sh } = shapeAtQ(win, q, '蔡氏家族聚餐', 0.8 + q * 2.8);
        const mid = sh.p[Math.floor(sh.p.length / 2)]!;
        if (prev) worst = Math.max(worst, Math.hypot(mid.x - prev.x, mid.y - prev.y));
        prev = mid;
      }
      expect(worst).toBeLessThan((win.y1 - win.y0) * 0.08);
    });
    it(`${name}：停下來（q=1）是正中間的水平橫條`, () => {
      const { sh } = shapeAtQ(win, 1);
      const c = center(win);
      for (const p of sh.p) expect(p.y).toBeCloseTo(c.cy, 4);
      expect(sh.p[0]!.x).toBeCloseTo(c.cx - L / 2, 4);
      expect(sh.p[sh.p.length - 1]!.x).toBeCloseTo(c.cx + L / 2, 4);
      expect(readForward(sh, L)).toBe(1); // 字照原順序讀
    });
  }
  it('同一句字永遠同一條路線；不同的字路線不同', () => {
    const win = winOf(360, 640);
    const a = shapeAtQ(win, 0.5, '蔡氏家族聚餐').sh.p[10]!;
    const b = shapeAtQ(win, 0.5, '蔡氏家族聚餐').sh.p[10]!;
    const c = shapeAtQ(win, 0.5, '順著河走 就會到海').sh.p[10]!;
    expect(a).toEqual(b);
    expect(a.x === c.x && a.y === c.y).toBe(false);
  });
  it('頭走的距離：飛進來之前 0、之後單調增加、到達中間時剛好是整條路線', () => {
    expect(headDist(0, 500)).toBe(0);
    expect(headDist(Q_NEW, 500)).toBe(0);
    expect(headDist(Q_FLY_END, 500)).toBeCloseTo(500, 6);
    let prev = 0;
    for (let q = 0; q <= 1; q += 0.01) {
      const d = headDist(q, 500);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
  it('緞帶偏左走的時候字整句反過來排（字不倒過來），偏右照原順序', () => {
    const win = winOf(640, 360);
    const { L, thick } = dims(win);
    const r = ribbonRoute(win, L, thick, 'x');
    const mk = (flip: number) => {
      const sh = ribbonShape(r, r.total, L, 0, 0, { ...center(win), e: 1 });
      return { ...sh, p: sh.p.map((p) => ({ x: p.x * flip, y: p.y })) };
    };
    expect(readForward(mk(1), L)).toBe(1);
    expect(readForward(mk(-1), L)).toBe(0);
  });
});
