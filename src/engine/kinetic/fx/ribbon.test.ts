import { describe, expect, it } from 'vitest';
import {
  FLOW_HOLD,
  FLOW_P,
  flattenFactor,
  flowHead,
  flowRoute,
  readForward,
  ribbonShape,
  settleHead,
  settleRoute,
  windFactor,
  type Win,
} from './ribbon';

// 蓋滿（slice）的倍率：320×180 的 viewBox 蓋滿 W×H 的畫面；緞帶的活動範圍＝框的整個寬度、高度只用中間 60%
const winOf = (W: number, H: number): Win => {
  const k = Math.max(W / 320, H / 180);
  const ox = (W - 320 * k) / 2;
  return { x0: -ox / k, y0: 90 - (H / k) * 0.3, x1: (W - ox) / k, y1: 90 + (H / k) * 0.3 };
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
  const size = Math.min(15, (15 * vw * 0.56) / sw0);
  const sw = (sw0 * size) / 15;
  return { L: sw + size * 1.2, thick: size * (26 / 15) };
};
const center = (win: Win) => ({ cx: (win.x0 + win.x1) / 2, cy: (win.y0 + win.y1) / 2 });
const SEED = '蔡氏家族聚餐';
const SETTLE = 2.3;

/** t 秒（字卡自己的時間，已經夾在停點）緞帶的形狀 */
function shapeAtT(win: Win, t: number, seed = SEED) {
  const { L, thick } = dims(win);
  const flow = flowRoute(win, L);
  const q = Math.min(Math.max((t - FLOW_HOLD) / SETTLE, 0), 1);
  let route = flow;
  let hs = flowHead(t, flow);
  if (q > 0) {
    const st = settleRoute(win, L, thick, seed);
    route = st.route;
    hs = settleHead(q, st.d0, st.route.total, flow.total / FLOW_P, SETTLE);
  }
  return {
    L,
    thick,
    flow,
    route,
    sh: ribbonShape(route, hs, L, thick * 0.3 * windFactor(q), t, { ...center(win), e: flattenFactor(q) }),
  };
}

describe('彎道：一條緞帶，平常滑過 S 形、收尾照原方向飄一圈回中間', () => {
  for (const [name, W, H] of SIZES) {
    const win = winOf(W, H);
    const { L } = dims(win);
    it(`${name}：緞帶長度固定、中間 60% 範圍內、不碰框的左右邊緣（收尾時）`, () => {
      const out: string[] = [];
      for (let f = 0; f <= (FLOW_HOLD + SETTLE) * 60; f++) {
        const t = f / 60;
        const { sh } = shapeAtT(win, t);
        if (Math.abs(sh.total / L - 1) > 0.25)
          out.push(`t=${t.toFixed(2)} 長度 ${sh.total.toFixed(1)}／${L.toFixed(1)}`);
        for (const p of sh.p) {
          if (p.y < win.y0 - 1 || p.y > win.y1 + 1)
            out.push(`t=${t.toFixed(2)} 跑出高度範圍 y=${p.y.toFixed(0)}`);
          if (t > FLOW_HOLD + 0.3 && (p.x < win.x0 || p.x > win.x1))
            out.push(`t=${t.toFixed(2)} 收尾時出界 x=${p.x.toFixed(0)}`);
        }
      }
      expect(out.slice(0, 5)).toEqual([]);
    });
    it(`${name}：每 1/60 秒中心移動連續（流動→收尾接得上），速度不突變`, () => {
      let prev: { x: number; y: number } | null = null;
      let prevSpeed = -1;
      const bad: string[] = [];
      for (let f = 20; f <= (FLOW_HOLD + SETTLE) * 60; f++) {
        const { sh } = shapeAtT(win, f / 60, SEED);
        const mid = sh.p[Math.floor(sh.p.length / 2)]!;
        if (prev) {
          const sp = Math.hypot(mid.x - prev.x, mid.y - prev.y);
          if (sp > (win.x1 - win.x0) * 0.05) bad.push(`t=${(f / 60).toFixed(2)} 一格移 ${sp.toFixed(2)}`);
          if (prevSpeed >= 0 && Math.abs(sp - prevSpeed) > (win.x1 - win.x0) * 0.015)
            bad.push(`t=${(f / 60).toFixed(2)} 速度 ${prevSpeed.toFixed(2)}→${sp.toFixed(2)}`);
          prevSpeed = sp;
        }
        prev = mid;
      }
      expect(bad.slice(0, 5)).toEqual([]);
    });
    it(`${name}：收尾開始那一刻，緞帶跟平常滑的位置一樣（q 從 0 到 0.01 只差一小步）`, () => {
      const a = shapeAtT(win, FLOW_HOLD - 0.001).sh;
      const b = shapeAtT(win, FLOW_HOLD + 0.001).sh;
      for (let i = 0; i < a.p.length; i += 8) {
        expect(Math.hypot(a.p[i]!.x - b.p[i]!.x, a.p[i]!.y - b.p[i]!.y)).toBeLessThan(1);
      }
    });
    it(`${name}：停下來是正中間的水平橫條，字照原順序讀`, () => {
      const { sh } = shapeAtT(win, FLOW_HOLD + SETTLE);
      const c = center(win);
      for (const p of sh.p) expect(p.y).toBeCloseTo(c.cy, 4);
      expect(sh.p[0]!.x).toBeCloseTo(c.cx - L / 2, 4);
      expect(sh.p[sh.p.length - 1]!.x).toBeCloseTo(c.cx + L / 2, 4);
      expect(readForward(sh, L)).toBe(1);
    });
  }
  it('平常滑的時候，一輪的中間（FLOW_HOLD）緞帶正好在畫面正中間；一輪結束整條緞帶都在畫面外', () => {
    const win = winOf(360, 640);
    const { L } = dims(win);
    const flow = flowRoute(win, L);
    const c = center(win);
    const mid = ribbonShape(flow, flowHead(FLOW_HOLD, flow), L, 0, 0);
    const xs = mid.p.map((p) => p.x);
    expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - c.cx)).toBeLessThan(4);
    const end = ribbonShape(flow, flowHead(FLOW_P - 0.001, flow), L, 0, 0);
    expect(Math.min(...end.p.map((p) => p.x))).toBeGreaterThan(win.x1 - 0.05 * L);
    const start = ribbonShape(flow, flowHead(0, flow), L, 0, 0);
    expect(Math.max(...start.p.map((p) => p.x))).toBeLessThan(win.x0 + 0.01);
  });
  it('頭的速度：收尾開始＝平常的速度，最後 0，中間不倒退', () => {
    const flowTotal = 200;
    const v0 = flowTotal / FLOW_P;
    const d0 = 100;
    const total = 600;
    const eps = 1e-4;
    const v =
      (settleHead(eps, d0, total, v0, SETTLE) - settleHead(0, d0, total, v0, SETTLE)) / (eps * SETTLE);
    // 起點斜率可能被夾在 3 倍距離以內，這裡的距離夠長，所以不夾
    expect(v).toBeCloseTo(v0, 0);
    expect(settleHead(1, d0, total, v0, SETTLE)).toBeCloseTo(total, 6);
    expect(
      (settleHead(1, d0, total, v0, SETTLE) - settleHead(1 - eps, d0, total, v0, SETTLE)) / (eps * SETTLE),
    ).toBeCloseTo(0, 0);
    let prev = 0;
    for (let q = 0; q <= 1; q += 0.01) {
      const h = settleHead(q, d0, total, v0, SETTLE);
      expect(h).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = h;
    }
  });
  it('同一句字永遠同一條路線；不同的字路線不同', () => {
    const win = winOf(360, 640);
    const t = FLOW_HOLD + 1.2;
    const a = shapeAtT(win, t, '蔡氏家族聚餐').sh.p[10]!;
    const b = shapeAtT(win, t, '蔡氏家族聚餐').sh.p[10]!;
    const c = shapeAtT(win, t, '順著河走 就會到海').sh.p[10]!;
    expect(a).toEqual(b);
    expect(a.x === c.x && a.y === c.y).toBe(false);
  });
  it('緞帶偏左走的時候字整句反過來排（字不倒過來），偏右照原順序', () => {
    const win = winOf(640, 360);
    const { L } = dims(win);
    const flow = flowRoute(win, L);
    const mk = (flip: number) => {
      const sh = ribbonShape(flow, flow.total / 2, L, 0, 0);
      return { ...sh, p: sh.p.map((p) => ({ x: p.x * flip, y: p.y })) };
    };
    expect(readForward(mk(1), L)).toBe(1);
    expect(readForward(mk(-1), L)).toBe(0);
  });
});
