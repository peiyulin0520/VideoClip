// 彎道：從頭到尾只有一條緞帶（長度＝整句字一遍＋留白、字黏在緞帶上、不重複）。平常沿著 S 形從左滑到右、一輪接一輪；
// 〔停在最後畫面〕時從第一輪滑到一半開始，照原本的方向和速度離開 S、繞畫面一圈（有風的擺動），最後停在正中間拉直成橫條。
// 這裡只放幾何（純函式，沒有畫布）：路線、緞帶的形狀、時間 → 位置。座標是 viewBox（320×180）的座標，
// 「畫面看得到的範圍」win 由呼叫的人用蓋滿（slice）的倍率算出來——直式畫面只看得到中間一小段。
import { clamp } from '../core';

export type V = { x: number; y: number };
export type Win = { x0: number; y0: number; x1: number; y1: number };
export type Route = { pts: V[]; cum: number[]; total: number };
export type Shape = { p: V[]; ang: number[]; len: number[]; total: number };

/** 緞帶滑過畫面一輪的秒數；〔停在最後畫面〕從第一輪滑到一半（緞帶在畫面正中間）時開始 */
export const FLOW_P = 1.8;
export const FLOW_HOLD = FLOW_P / 2;

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

/** 平常滑的路線：左邊畫面外 → 右邊畫面外的一條 S 形（正弦），頭在 x0−0.2L 進來、在 x1+1.2L 出去（整條緞帶完全離開才算一輪） */
export function flowRoute(win: Win, L: number): Route {
  const w = win.x1 - win.x0;
  const h = win.y1 - win.y0;
  const cy = (win.y0 + win.y1) / 2;
  const A = h * 0.17;
  const lam = w * 1.7;
  const xa = win.x0 - 0.2 * L;
  const xb = win.x1 + 1.2 * L;
  const n = 160;
  const pts: V[] = [];
  for (let i = 0; i <= n; i++) {
    const x = xa + ((xb - xa) * i) / n;
    pts.push({ x, y: cy + A * Math.sin((2 * Math.PI * (x - (xa + xb) / 2)) / lam) });
  }
  return toRoute(pts);
}

function toRoute(pts: V[]): Route {
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  return { pts, cum, total: cum[cum.length - 1]! };
}

/**
 * 〔停在最後畫面〕頭走的路線：前半＝平常的 S 形走到一半（d0＝緞帶在畫面正中間的位置，跟平常滑的完全一樣），
 * 接著順著同一個方向繞畫面一圈（順時針：右 → 下 → 左 → 上），最後進到終點（正中間偏右：頭到終點時，整條緞帶再慢慢拉平，躺在畫面正中間）。
 * 路線離畫面邊緣留 1.05 倍粗細（緞帶身體＋風的擺動不出界）；轉角用 seed 稍微不同（同一句字永遠同一條）。
 */
export function settleRoute(
  win: Win,
  L: number,
  thick: number,
  seed: string,
): { route: Route; d0: number; flow: Route } {
  const flow = flowRoute(win, L);
  const d0 = flow.total / 2;
  const M = routeAt(flow, d0);
  const cx = (win.x0 + win.x1) / 2;
  const cy = (win.y0 + win.y1) / 2;
  const m = thick * 1.05;
  const ix0 = win.x0 + m;
  const ix1 = win.x1 - m;
  const iy0 = win.y0 + m;
  const iy1 = win.y1 - m;
  const at = (u: number, v: number): V => ({ x: ix0 + (ix1 - ix0) * u, y: iy0 + (iy1 - iy0) * v });
  const r1 = seedOf(seed, 'a');
  const r2 = seedOf(seed, 'b');
  const r3 = seedOf(seed, 'c');
  const R: V = { x: cx + L / 2, y: cy };
  // 前一個點放在 M 往後一點（切線方向），這樣曲線在 M 順順地接下去
  const back: V = { x: M.x - M.tx * 40, y: M.y - M.ty * 40 };
  const ctrl: V[] = [
    back,
    { x: M.x, y: M.y },
    at(0.95, 0.66 + 0.06 * r2), // 先往下（不是往右，頭本來就在右邊）
    at(0.6 + 0.1 * r3, 0.98),
    at(0.1 + 0.04 * r1, 0.84),
    at(0.06 + 0.04 * r2, 0.4),
    at(0.3 + 0.1 * r3, 0.1 + 0.04 * r1),
    R,
  ];
  const per = 30;
  const loop = catmull(ctrl, per).slice(per); // 去掉 back → M 那一段
  const head = flow.pts.filter((_, i) => flow.cum[i]! < d0 - 1e-6);
  const route = toRoute([...head, { x: M.x, y: M.y }, ...loop.slice(1)]);
  return { route, d0: route.cum[head.length]!, flow };
}

/** 平常（沒收尾）：頭走到 S 形的哪裡。t＝字卡自己的時間；一輪 FLOW_P 秒，接著下一輪 */
export function flowHead(t: number, flow: Route): number {
  const u = (((t / FLOW_P) % 1) + 1) % 1;
  return flow.total * u;
}

/**
 * 收尾（q 0→1）：頭從 d0 走到路線終點。三次 Hermite：起點速度＝平常滑的速度（不會突然變快變慢）、終點速度 0。
 * v0＝平常的速度（距離／秒）、T＝收尾總秒數。
 */
export function settleHead(q: number, d0: number, total: number, v0: number, T: number): number {
  const dl = Math.max(total - d0, 1e-6);
  const s0 = Math.min((v0 * T) / dl, 3); // 起點斜率（超過 3 單調性會壞）
  const x = clamp(q);
  const h = s0 * x + (3 - 2 * s0) * x * x + (s0 - 2) * x * x * x; // Hermite：H(0)=0、H(1)=1、H'(0)=s0、H'(1)=0
  return d0 + dl * h;
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

/** 拉平的程度（0～1）：快到中間時，緞帶從彎彎的慢慢拉直成橫條 */
export function flattenFactor(q: number): number {
  return smooth(0.78, 0.98, q);
}

/** 風的擺動大小（0～1）：平常滑的時候一直有（q＝0 時是 1，跟收尾接得上）、快到中間時風停 */
export function windFactor(q: number): number {
  return 1 - smooth(0.62, 0.92, q);
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
