// 彎道〔停在最後畫面〕的收尾：一條長度固定的緞帶從畫面外飛進來、在畫面裡隨風亂飄，最後繞回正中間變成橫條。
// 這裡只放幾何（純函式，沒有畫布）：路線、緞帶的形狀、時間 → 位置。座標是 viewBox（320×180）的座標，
// 「畫面看得到的範圍」win 由呼叫的人用蓋滿（slice）的倍率算出來——直式畫面只看得到中間一小段。
import { clamp } from '../core';

export type V = { x: number; y: number };
export type Win = { x0: number; y0: number; x1: number; y1: number };
export type Route = { pts: V[]; cum: number[]; total: number };
export type Shape = { p: V[]; ang: number[]; len: number[]; total: number };

/** 收尾各段在 q（0→1）上的位置 */
export const Q_NEW = 0.07; // 新緞帶開始飛進來
export const Q_FLY_END = 0.96; // 緞帶到達正中間
export const Q_OLD_END = 0.14; // 原本的 S 形帶子完全離開

const smooth = (a: number, b: number, x: number) => {
  const p = clamp((x - a) / (b - a));
  return p * p * (3 - 2 * p);
};

/** 字串 → 0～1 的固定亂數（同一句字永遠同一條飄的路線，預覽、匯出一致） */
export function seedOf(str: string, salt: string): number {
  let h = 2166136261;
  for (const c of str + '|' + salt) h = Math.imul(h ^ c.codePointAt(0)!, 16777619);
  return (h >>> 0) / 4294967296;
}

/** Catmull-Rom 曲線經過這些點（兩端複製一個點） */
function catmull(ctrl: V[], per = 28): V[] {
  const out: V[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(i - 1, 0)]!;
    const p1 = ctrl[i]!;
    const p2 = ctrl[i + 1]!;
    const p3 = ctrl[Math.min(i + 2, ctrl.length - 1)]!;
    for (let k = 0; k < per; k++) {
      const u = k / per;
      const u2 = u * u;
      const u3 = u2 * u;
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (p2.x - p0.x) * u +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 +
            (3 * p1.x - p0.x - 3 * p2.x + p3.x) * u3),
        y:
          0.5 *
          (2 * p1.y +
            (p2.y - p0.y) * u +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 +
            (3 * p1.y - p0.y - 3 * p2.y + p3.y) * u3),
      });
    }
  }
  out.push(ctrl[ctrl.length - 1]!);
  return out;
}

/** 沿路線做高斯平滑（取樣成等距、兩端固定）：σ 是平滑的長度（沿線距離） */
function smoothPath(pts: V[], sigma: number): V[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  const total = cum[cum.length - 1]!;
  const n = Math.max(Math.round(total / 2), 8);
  const step = total / n;
  const at = (d: number): V => {
    let lo = 0;
    let hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid]! <= d) lo = mid;
      else hi = mid;
    }
    const f = (d - cum[lo]!) / Math.max(cum[hi]! - cum[lo]!, 1e-6);
    return { x: pts[lo]!.x + (pts[hi]!.x - pts[lo]!.x) * f, y: pts[lo]!.y + (pts[hi]!.y - pts[lo]!.y) * f };
  };
  const even = Array.from({ length: n + 1 }, (_, i) => at(i * step));
  const half = Math.ceil((sigma * 2.5) / step);
  const out: V[] = [];
  for (let i = 0; i <= n; i++) {
    // 兩端用對稱的視窗（離端點多近就只往內看多遠），端點本身不動
    const r = Math.min(half, i, n - i);
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let j = -r; j <= r; j++) {
      const w = Math.exp(-((j * step) ** 2) / (2 * sigma * sigma));
      sx += even[i + j]!.x * w;
      sy += even[i + j]!.y * w;
      sw += w;
    }
    out.push({ x: sx / sw, y: sy / sw });
  }
  return out;
}

function bezier(a: V, c1: V, c2: V, b: V, n = 24): V[] {
  const out: V[] = [];
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const m = 1 - u;
    out.push({
      x: m * m * m * a.x + 3 * m * m * u * c1.x + 3 * m * u * u * c2.x + u * u * u * b.x,
      y: m * m * m * a.y + 3 * m * m * u * c1.y + 3 * m * u * u * c2.y + u * u * u * b.y,
    });
  }
  return out;
}

/**
 * 緞帶「頭」走的路線：從畫面左邊外面進來 → 在畫面裡左右上下飄（中間的點用 seed 稍微不同）→
 * 最後順順地進到終點（正中間偏右）：緞帶的頭到終點時，整條緞帶再慢慢拉平（見 ribbonShape 的 flat），躺在畫面正中間。
 * L＝緞帶長度、thick＝緞帶粗細；路線離畫面邊緣留 0.8 倍粗細（緞帶身體＋風的擺動不出界）。
 */
export function ribbonRoute(win: Win, L: number, thick: number, seed: string): Route {
  const cx = (win.x0 + win.x1) / 2;
  const cy = (win.y0 + win.y1) / 2;
  const m = thick * 0.8;
  const ix0 = win.x0 + m;
  const ix1 = win.x1 - m;
  const iy0 = win.y0 + m;
  const iy1 = win.y1 - m;
  const at = (u: number, v: number): V => ({ x: ix0 + (ix1 - ix0) * u, y: iy0 + (iy1 - iy0) * v });
  const r1 = seedOf(seed, 'a');
  const r2 = seedOf(seed, 'b');
  const r3 = seedOf(seed, 'c');
  // 順時針繞畫面一圈、最後繞回正中間（不來回折返，緞帶才不會折起來）；中間的點用 seed 稍微不同
  const ctrl: V[] = [
    { x: win.x0 - L * 0.6, y: at(0, 0.14 + 0.08 * r1).y }, // 從左邊外面進來
    at(0.88 + 0.06 * r2, 0.1 + 0.05 * r3),
    at(0.45 + 0.15 * r2, 0.4 + 0.06 * r1),
    at(0.86 + 0.08 * r3, 0.8 + 0.04 * r2),
    at(0.14 + 0.06 * r1, 0.88),
    at(0.1 + 0.06 * r2, 0.5 + 0.06 * r3),
  ];
  // 緞帶有長度、不能急轉彎（會折起來、字疊在一起）：把路線磨圓，轉彎半徑跟緞帶長度成比例
  const wander = smoothPath(catmull(ctrl, 36), L * 0.4);
  const last = wander[wander.length - 1]!;
  const prev = wander[wander.length - 6]!;
  const R: V = { x: cx + L / 2, y: cy }; // 終點（緞帶的頭）：緞帶最後躺在正中間
  const h = Math.hypot(R.x - last.x, R.y - last.y) * 0.45;
  const dl = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
  const c1: V = { x: last.x + ((last.x - prev.x) / dl) * h, y: last.y + ((last.y - prev.y) / dl) * h };
  const c2: V = { x: R.x + (last.x - R.x) * 0.35, y: R.y + (last.y - R.y) * 0.35 }; // 順著來的方向直直進來（最後的樣子由拉平決定）
  const pts = [...wander, ...bezier(last, c1, c2, R, 40)];
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  return { pts, cum, total: cum[cum.length - 1]! };
}

/** 路線上離起點 d 的位置與單位切線（起點之前、終點之後沿著端點的切線延伸） */
export function routeAt(r: Route, d: number): V & { tx: number; ty: number } {
  const n = r.pts.length;
  const seg = (i: number) => {
    const a = r.pts[i]!;
    const b = r.pts[i + 1]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { tx: (b.x - a.x) / l, ty: (b.y - a.y) / l };
  };
  if (d <= 0) {
    const t = seg(0);
    return { x: r.pts[0]!.x + t.tx * d, y: r.pts[0]!.y + t.ty * d, ...t };
  }
  if (d >= r.total) {
    const t = seg(n - 2);
    const e = r.pts[n - 1]!;
    return { x: e.x + t.tx * (d - r.total), y: e.y + t.ty * (d - r.total), ...t };
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (r.cum[mid]! <= d) lo = mid;
    else hi = mid;
  }
  const a = r.pts[lo]!;
  const b = r.pts[hi]!;
  const f = (d - r.cum[lo]!) / Math.max(r.cum[hi]! - r.cum[lo]!, 1e-6);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, ...seg(lo) };
}

/** 緞帶的頭走到路線的哪裡（距離）：飛進來很快、越靠近中間越慢，停下來時剛好到終點 */
export function headDist(q: number, total: number): number {
  const x = clamp((q - Q_NEW) / (Q_FLY_END - Q_NEW));
  return total * (1 - (1 - x) * (1 - x));
}

/** 拉平的程度（0～1）：快到中間時，緞帶從彎彎的慢慢拉直成橫條 */
export function flattenFactor(q: number): number {
  return smooth(0.76, Q_FLY_END + 0.01, q);
}

/** 風的擺動大小（0～1）：飛進來後慢慢起風、快到中間時風停 */
export function windFactor(q: number): number {
  return smooth(Q_NEW, 0.22, q) * (1 - smooth(0.7, 0.95, q));
}

/**
 * 緞帶現在的形狀：頭在路線 hs 的位置，身體（長 L）沿著頭走過的路線排在後面（像蛇），再加上從頭往尾傳的風的波浪。
 * 回傳中心線的點（從尾到頭）、每個點的切線角、累計長度。amp＝擺動幅度（viewBox 單位）、tWind＝風的時間（秒）。
 */
export function ribbonShape(
  r: Route,
  hs: number,
  L: number,
  amp: number,
  tWind: number,
  flat?: { cx: number; cy: number; e: number },
  n = 96,
): Shape {
  const p: V[] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1); // 0＝尾、1＝頭
    const c = routeAt(r, hs - L * (1 - u));
    // 尾巴擺得比頭大；波長約緞帶的一半
    const w = amp * Math.sin(2 * Math.PI * (u * 1.6) - tWind * 5.2) * (0.12 + 0.88 * (1 - u) ** 1.5);
    const q: V = { x: c.x - c.ty * w, y: c.y + c.tx * w };
    // 快到的時候整條慢慢拉平成正中間的橫條（頭已經在終點、身體照著頭走過的路線排，這時才把尾巴順順地拉直）
    if (flat && flat.e > 0) {
      q.x += (flat.cx - L / 2 + L * u - q.x) * flat.e;
      q.y += (flat.cy - q.y) * flat.e;
    }
    p.push(q);
  }
  const ang: number[] = [];
  const len = [0];
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(i - 1, 0)]!;
    const b = p[Math.min(i + 1, n - 1)]!;
    ang.push(Math.atan2(b.y - a.y, b.x - a.x));
    if (i > 0) len.push(len[i - 1]! + Math.hypot(p[i]!.x - p[i - 1]!.x, p[i]!.y - p[i - 1]!.y));
  }
  return { p, ang, len, total: len[n - 1]! };
}

/** 整條緞帶從尾指向頭的方向偏左還是偏右：回傳「字照原順序讀（尾→頭）」的比重 0～1；偏左的時候字整句反過來排（才不會倒過來） */
export function readForward(shape: Shape, L: number): number {
  const a = shape.p[0]!;
  const b = shape.p[shape.p.length - 1]!;
  return smooth(-0.1 * L, 0.1 * L, b.x - a.x);
}

/** 中心線上離尾 d（沿線長度）的位置與切線角 */
export function shapeAt(sh: Shape, d: number): { x: number; y: number; a: number } {
  const n = sh.p.length;
  const dd = clamp(d, 0, sh.total);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sh.len[mid]! <= dd) lo = mid;
    else hi = mid;
  }
  const f = (dd - sh.len[lo]!) / Math.max(sh.len[hi]! - sh.len[lo]!, 1e-6);
  return {
    x: sh.p[lo]!.x + (sh.p[hi]!.x - sh.p[lo]!.x) * f,
    y: sh.p[lo]!.y + (sh.p[hi]!.y - sh.p[lo]!.y) * f,
    a: sh.ang[lo]! + (sh.ang[hi]! - sh.ang[lo]!) * f,
  };
}
