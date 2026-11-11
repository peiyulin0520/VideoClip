import type { BoxShape } from '../model/types';
import type { PathCmd } from './decorations';

// 圖形庫（Office 簡報風格，自己用路徑實作，沒有用任何現成圖檔）。見 docs/TEXT_CARDS.md §4。
// 每個圖形：(w, h, 選項) → 路徑指令。當字塊用時，圖形大小 = 文字墨跡 + 內距，再乘上 inset，
// 讓文字（矩形）剛好放得進圖形裡面（橢圓、星形、愛心的可放文字區比外框小）。

export type ShapeOpts = {
  radius?: number;
  tail?: 'bottom-left' | 'bottom-right';
  /** 圖形調整值（像 Office 的黃色調整點）：沒有的項目用預設值 */
  adj?: Record<string, number>;
};
/** 一個可以調整的項目；def 是目前預設長相對應的值 */
export type AdjDef = { key: string; label: string; min: number; max: number; step: number; def: number };
export type ShapeDef = {
  id: BoxShape;
  label: string;
  cat: '基本' | '對話框' | '星形' | '標籤箭頭';
  /** 圖形外框 = 文字區 ×（kx, ky）（預設調整值下用這個表；調過之後用 fitInset 重算）；dy：文字區中心往下移圖形高度的比例 */
  inset: [number, number];
  dy?: number;
  tail?: boolean; // 有尾巴（對話框）
  adjust: AdjDef[];
  path: (w: number, h: number, o: ShapeOpts) => PathCmd[];
};
type RawShape = Omit<ShapeDef, 'adjust'>;

const adjOf = (o: ShapeOpts, key: string, def: number) => o.adj?.[key] ?? def;

const M = (x: number, y: number): PathCmd => ['M', x, y];
const L = (x: number, y: number): PathCmd => ['L', x, y];
const C = (a: number, b: number, c: number, d: number, e: number, f: number): PathCmd => [
  'C',
  a,
  b,
  c,
  d,
  e,
  f,
];
const Z: PathCmd = ['Z'];
const KAPPA = 0.5522847498;

function poly(pts: [number, number][]): PathCmd[] {
  return [...pts.map(([x, y], i) => (i === 0 ? M(x, y) : L(x, y))), Z];
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): PathCmd[] {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    M(cx + rx, cy),
    C(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry),
    C(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy),
    C(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry),
    C(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy),
    Z,
  ];
}

function roundRectPath(w: number, h: number, r: number): PathCmd[] {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rad <= 0)
    return poly([
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ]);
  const k = rad * (1 - KAPPA);
  return [
    M(rad, 0),
    L(w - rad, 0),
    C(w - k, 0, w, k, w, rad),
    L(w, h - rad),
    C(w, h - k, w - k, h, w - rad, h),
    L(rad, h),
    C(k, h, 0, h - k, 0, h - rad),
    L(0, rad),
    C(0, k, k, 0, rad, 0),
    Z,
  ];
}

// ---- 邊界取樣（對話框尾巴要接在邊界上用）----
type Pt = [number, number];
function roundRectPoly(w: number, h: number, r: number, seg = 14): Pt[] {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  const pts: Pt[] = [];
  const arc = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + ((Math.PI / 2) * i) / seg;
      pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
    }
  };
  if (rad <= 0)
    return [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ];
  arc(w - rad, rad, -Math.PI / 2); // 右上
  arc(w - rad, h - rad, 0); // 右下
  arc(rad, h - rad, Math.PI / 2); // 左下
  arc(rad, rad, Math.PI); // 左上
  return pts;
}
function ellipsePoly(w: number, h: number, n = 72): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / n; // 從正上方、順時針
    pts.push([w / 2 + (Math.cos(a) * w) / 2, h / 2 + (Math.sin(a) * h) / 2]);
  }
  return pts;
}
function densify(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
    for (let k = 0; k < n; k++) out.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
  }
  return out;
}
/**
 * 在順時針邊界的底部插入一個尖尾巴；順時針時底邊是由右往左走。
 * xc：尾巴根部中心（0–1，沿底邊）；tw：根部寬度（佔寬度比例）；len：尾巴長度（px）。尾尖往外側（離中心較遠那邊）偏。
 */
function withTail(raw: Pt[], w: number, h: number, xc: number, tw: number, len: number): PathCmd[] {
  const pts = densify(raw, Math.max(w, h) / 60);
  const x1 = (xc - tw / 2) * w;
  const x2 = (xc + tw / 2) * w;
  const tipX = clampN(xc * w + (xc < 0.5 ? -0.18 : 0.18) * w, 0.02 * w, 0.98 * w);
  const lower = pts.map((p, i) => ({ p, i })).filter((q) => q.p[1] > h * 0.6);
  const nearest = (x: number) =>
    lower.reduce((a, b) => (Math.abs(a.p[0] - x) <= Math.abs(b.p[0] - x) ? a : b)).i;
  const iR = nearest(x2);
  const iL = nearest(x1);
  const out: Pt[] =
    iR <= iL
      ? [...pts.slice(0, iR + 1), [tipX, h + len], ...pts.slice(iL)]
      : [...pts.slice(0, iL + 1), [tipX, h + len], ...pts.slice(iR)]; // 根部太窄、最近點撞在一起時的保險
  return poly(out);
}
const clampN = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** 尾巴設定：位置預設跟著左下／右下，也可以用調整值移到底邊任何地方 */
function tailParams(o: ShapeOpts, w: number, h: number) {
  const xc = adjOf(o, 'tailPos', o.tail === 'bottom-right' ? 0.72 : 0.28);
  const tw = adjOf(o, 'tailWidth', 0.2);
  const len = adjOf(o, 'tailLen', 0.3) * Math.min(w, h);
  return { xc, tw, len };
}

/** 把多邊形每個角換成圓弧（t：0＝尖角、1＝最圓；半徑最多是相鄰較短邊的一半） */
function roundPolygon(pts: Pt[], t: number): PathCmd[] {
  if (t <= 0.001) return poly(pts);
  const n = pts.length;
  const cmds: PathCmd[] = [];
  for (let i = 0; i < n; i++) {
    const v = pts[i]!;
    const p = pts[(i + n - 1) % n]!;
    const q = pts[(i + 1) % n]!;
    const lp = Math.hypot(p[0] - v[0], p[1] - v[1]) || 1;
    const lq = Math.hypot(q[0] - v[0], q[1] - v[1]) || 1;
    const d = Math.min(lp, lq) * 0.5 * t;
    const a: Pt = [v[0] + ((p[0] - v[0]) / lp) * d, v[1] + ((p[1] - v[1]) / lp) * d];
    const b: Pt = [v[0] + ((q[0] - v[0]) / lq) * d, v[1] + ((q[1] - v[1]) / lq) * d];
    cmds.push(i === 0 ? M(a[0], a[1]) : L(a[0], a[1]));
    cmds.push(
      C(
        a[0] + ((v[0] - a[0]) * 2) / 3,
        a[1] + ((v[1] - a[1]) * 2) / 3,
        b[0] + ((v[0] - b[0]) * 2) / 3,
        b[1] + ((v[1] - b[1]) * 2) / 3,
        b[0],
        b[1],
      ),
    );
  }
  cmds.push(Z);
  return cmds;
}
const polyR = (pts: Pt[], o: ShapeOpts) => roundPolygon(pts, adjOf(o, 'round', 0));

function starPoly(w: number, h: number, n: number, inner: number, rot = -Math.PI / 2, wobble = 0): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const outer = i % 2 === 0;
    const a = rot + (Math.PI * i) / n;
    const rr = outer ? 1 - wobble * (((i * 7) % 5) / 5) : inner;
    pts.push([w / 2 + Math.cos(a) * rr * (w / 2), h / 2 + Math.sin(a) * rr * (h / 2)]);
  }
  return pts;
}

/** 扇貝邊圓（雲朵、波浪印章）：沿橢圓取 n 個點，每兩點之間往外鼓一個圓弧 */
function scallop(
  w: number,
  h: number,
  n: number,
  bulge: number,
  smooth = 0,
  ry0 = 0.5,
  rx0 = 0.5,
): PathCmd[] {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w * rx0 * (1 - bulge * 0.9);
  const ry = h * ry0 * (1 - bulge * 0.9);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  const cmds: PathCmd[] = [M(pts[0]![0], pts[0]![1])];
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % n]!;
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2;
    // 往外的方向（從中心指向弦的中點）
    let dx = mx - cx;
    let dy = my - cy;
    const len = Math.hypot(dx / w, dy / h) || 1;
    dx = (dx / w / len) * w;
    dy = (dy / h / len) * h;
    const k = bulge * 1.35;
    // smooth：控制點沿弦的方向多拉一點，凸起之間的接縫從尖角變成圓弧
    const cx1 = (q[0] - p[0]) * smooth * 0.6;
    const cy1 = (q[1] - p[1]) * smooth * 0.6;
    // 凹槽很淺時（深度接近 0）改成順著橢圓的切線走，整圈就是平滑的橢圓，不會變成八邊形
    const a1 = -Math.PI / 2 + (Math.PI * 2 * i) / n;
    const a2 = -Math.PI / 2 + (Math.PI * 2 * (i + 1)) / n;
    const kk = (4 / 3) * Math.tan(Math.PI / (2 * n)); // 圓弧的標準控制點長度
    const e = Math.min(Math.max(1 - bulge / 0.06, 0), 1);
    const t1: Pt = [-Math.sin(a1) * rx * kk, Math.cos(a1) * ry * kk];
    const t2: Pt = [-Math.sin(a2) * rx * kk, Math.cos(a2) * ry * kk];
    cmds.push(
      C(
        (1 - e) * (p[0] + dx * k * 0.6 + cx1) + e * (p[0] + t1[0]),
        (1 - e) * (p[1] + dy * k * 0.6 + cy1) + e * (p[1] + t1[1]),
        (1 - e) * (q[0] + dx * k * 0.6 - cx1) + e * (q[0] - t2[0]),
        (1 - e) * (q[1] + dy * k * 0.6 - cy1) + e * (q[1] - t2[1]),
        q[0],
        q[1],
      ),
    );
  }
  cmds.push(Z);
  return cmds;
}

function cylinder(w: number, h: number): PathCmd[] {
  const e = Math.min(h * 0.2, w * 0.25);
  const kx = (w / 2) * KAPPA;
  const ke = e * KAPPA;
  return [
    M(0, e),
    C(0, e - ke, w / 2 - kx, 0, w / 2, 0),
    C(w / 2 + kx, 0, w, e - ke, w, e),
    L(w, h - e),
    C(w, h - e + ke, w / 2 + kx, h, w / 2, h),
    C(w / 2 - kx, h, 0, h - e + ke, 0, h - e),
    Z,
  ];
}

function heartPath(w: number, h: number): PathCmd[] {
  const p = (x: number, y: number): [number, number] => [x * w, y * h];
  const pc = (a: [number, number], b: [number, number], c: [number, number]): PathCmd =>
    C(a[0], a[1], b[0], b[1], c[0], c[1]);
  return [
    M(...p(0.5, 0.95)),
    pc(p(0.1, 0.65), p(0, 0.45), p(0, 0.28)),
    pc(p(0, 0.1), p(0.15, 0), p(0.28, 0)),
    pc(p(0.4, 0), p(0.47, 0.08), p(0.5, 0.18)),
    pc(p(0.53, 0.08), p(0.6, 0), p(0.72, 0)),
    pc(p(0.85, 0), p(1, 0.1), p(1, 0.28)),
    pc(p(1, 0.45), p(0.9, 0.65), p(0.5, 0.95)),
    Z,
  ];
}

const rel = (w: number, h: number, pts: Pt[]): Pt[] => pts.map(([x, y]) => [x * w, y * h]);

/** 星形的「凹槽深度」(0–1) 與內徑比互換：深度越大，內徑越小（越尖） */
const innerOf = (depth: number) => 0.92 - depth * 0.8;
const depthOf = (inner: number) => (0.92 - inner) / 0.8;
const star =
  (n: number, inner: number, wobble = 0) =>
  (w: number, h: number, o: ShapeOpts) =>
    roundPolygon(
      starPoly(w, h, n, innerOf(adjOf(o, 'depth', depthOf(inner))), -Math.PI / 2, wobble),
      adjOf(o, 'round', 0),
    );
const notchLen = (o: ShapeOpts, def: number, w: number, h: number, wCap: number) =>
  o.adj?.notch !== undefined ? Math.min(o.adj.notch * h, w * 0.45) : Math.min(def * h, w * wCap);

const RAW: RawShape[] = [
  { id: 'rect', label: '方形', cat: '基本', inset: [1, 1], path: (w, h) => roundRectPath(w, h, 0) },
  {
    id: 'roundRect',
    label: '圓角',
    cat: '基本',
    inset: [1.08, 1.08],
    path: (w, h, o) => roundRectPath(w, h, o.radius ?? 28),
  },
  {
    id: 'pill',
    label: '膠囊',
    cat: '基本',
    inset: [1.45, 1.45],
    path: (w, h) => roundRectPath(w, h, Math.min(w, h) / 2),
  },
  {
    id: 'ellipse',
    label: '橢圓',
    cat: '基本',
    inset: [1.45, 1.45],
    path: (w, h) => ellipsePath(w / 2, h / 2, w / 2, h / 2),
  },
  {
    id: 'triangle',
    label: '三角形',
    cat: '基本',
    inset: [2.1, 2.1],
    dy: 0.24,
    path: (w, h, o) =>
      polyR(
        rel(w, h, [
          [0.5, 0],
          [1, 1],
          [0, 1],
        ]),
        o,
      ),
  },
  {
    id: 'diamond',
    label: '菱形',
    cat: '基本',
    inset: [2, 2],
    path: (w, h, o) =>
      polyR(
        rel(w, h, [
          [0.5, 0],
          [1, 0.5],
          [0.5, 1],
          [0, 0.5],
        ]),
        o,
      ),
  },
  {
    id: 'parallelogram',
    label: '斜切色塊',
    cat: '基本',
    inset: [1.8, 1],
    path: (w, h, o) => {
      const off = o.adj?.slant !== undefined ? o.adj.slant * w : Math.min(h * 0.45, w * 0.22);
      return polyR(
        [
          [off, 0],
          [w, 0],
          [w - off, h],
          [0, h],
        ],
        o,
      );
    },
  },
  {
    id: 'trapezoid',
    label: '梯形',
    cat: '基本',
    inset: [1.45, 1],
    path: (w, h, o) => {
      const off = adjOf(o, 'slant', 0.14) * w;
      return polyR(
        [
          [off, 0],
          [w - off, 0],
          [w, h],
          [0, h],
        ],
        o,
      );
    },
  },
  {
    id: 'pentagon',
    label: '五邊形',
    cat: '基本',
    inset: [1.55, 1.55],
    dy: 0.08,
    path: (w, h, o) =>
      polyR(
        rel(w, h, [
          [0.5, 0],
          [1, 0.38],
          [0.81, 1],
          [0.19, 1],
          [0, 0.38],
        ]),
        o,
      ),
  },
  {
    id: 'hexagon',
    label: '六邊形',
    cat: '基本',
    inset: [1.55, 1.55],
    path: (w, h, o) =>
      polyR(
        rel(w, h, [
          [0.25, 0],
          [0.75, 0],
          [1, 0.5],
          [0.75, 1],
          [0.25, 1],
          [0, 0.5],
        ]),
        o,
      ),
  },
  {
    id: 'octagon',
    label: '八邊形',
    cat: '基本',
    inset: [1.45, 1.45],
    path: (w, h, o) => {
      const c = Math.min(w, h) * 0.29;
      return polyR(
        [
          [c, 0],
          [w - c, 0],
          [w, c],
          [w, h - c],
          [w - c, h],
          [c, h],
          [0, h - c],
          [0, c],
        ],
        o,
      );
    },
  },
  {
    id: 'cross',
    label: '十字',
    cat: '基本',
    inset: [2.55, 2.55],
    path: (w, h, o) =>
      polyR(
        rel(w, h, [
          [0.3, 0],
          [0.7, 0],
          [0.7, 0.3],
          [1, 0.3],
          [1, 0.7],
          [0.7, 0.7],
          [0.7, 1],
          [0.3, 1],
          [0.3, 0.7],
          [0, 0.7],
          [0, 0.3],
          [0.3, 0.3],
        ]),
        o,
      ),
  },
  {
    id: 'snip',
    label: '剪角',
    cat: '基本',
    inset: [1.4, 1.4],
    path: (w, h, o) => {
      const c = Math.min(w, h) * adjOf(o, 'cut', 0.28);
      return polyR(
        [
          [0, 0],
          [w - c, 0],
          [w, c],
          [w, h],
          [c, h],
          [0, h - c],
        ],
        o,
      );
    },
  },
  { id: 'heart', label: '愛心', cat: '基本', inset: [1.9, 1.9], dy: -0.04, path: heartPath },
  {
    id: 'cloud',
    label: '雲朵',
    cat: '基本',
    inset: [1.75, 1.75],
    dy: -0.08,
    path: (w, h, o) =>
      scallop(w, h, Math.round(adjOf(o, 'count', 8)), adjOf(o, 'depth', 0.5) * 0.44, adjOf(o, 'smooth', 0)),
  },
  { id: 'cylinder', label: '圓柱', cat: '基本', inset: [1.1, 1.3], path: cylinder },

  {
    id: 'speech-rect',
    label: '方對話框',
    cat: '對話框',
    inset: [1, 1],
    tail: true,
    path: (w, h, o) => {
      const t = tailParams(o, w, h);
      return withTail(roundRectPoly(w, h, 0), w, h, t.xc, t.tw, t.len);
    },
  },
  {
    id: 'speech-round',
    label: '圓角對話框',
    cat: '對話框',
    inset: [1.08, 1.08],
    tail: true,
    path: (w, h, o) => {
      const t = tailParams(o, w, h);
      return withTail(roundRectPoly(w, h, o.radius ?? 36), w, h, t.xc, t.tw, t.len);
    },
  },
  {
    id: 'speech-oval',
    label: '橢圓對話框',
    cat: '對話框',
    inset: [1.45, 1.45],
    tail: true,
    path: (w, h, o) => {
      const t = tailParams(o, w, h);
      return withTail(ellipsePoly(w, h), w, h, t.xc, t.tw, t.len);
    },
  },
  {
    id: 'thought',
    label: '思考泡泡',
    cat: '對話框',
    inset: [1.75, 1.75],
    dy: -0.08,
    tail: true,
    path: (w, h, o) => {
      const left = (o.tail ?? 'bottom-left') === 'bottom-left';
      const s = Math.min(w, h);
      const x1 = left ? w * 0.14 : w * 0.86;
      const x2 = left ? w * 0.04 : w * 0.96;
      return [
        ...scallop(
          w,
          h,
          Math.round(adjOf(o, 'count', 8)),
          adjOf(o, 'depth', 0.5) * 0.44,
          adjOf(o, 'smooth', 0),
        ),
        ...ellipsePath(x1, h + s * 0.12, s * 0.09, s * 0.075),
        ...ellipsePath(x2, h + s * 0.3, s * 0.05, s * 0.04),
      ];
    },
  },
  { id: 'burst-bubble', label: '爆炸對話框', cat: '對話框', inset: [1.8, 1.8], path: star(14, 0.72, 0.12) },

  { id: 'star4', label: '四角星', cat: '星形', inset: [4.1, 4.1], path: star(4, 0.34) },
  { id: 'star5', label: '五角星', cat: '星形', inset: [2.75, 2.75], dy: 0.02, path: star(5, 0.4) },
  { id: 'star6', label: '六角星', cat: '星形', inset: [2, 2], path: star(6, 0.58) },
  { id: 'star8', label: '八角星', cat: '星形', inset: [1.45, 1.45], path: star(8, 0.72) },
  { id: 'burst', label: '爆炸', cat: '星形', inset: [2.05, 2.05], dy: -0.02, path: star(12, 0.7, 0.14) },
  {
    id: 'badge',
    label: '波浪印章',
    cat: '星形',
    inset: [1.45, 1.45],
    path: (w, h, o) => scallop(w, h, Math.round(adjOf(o, 'count', 18)), adjOf(o, 'depth', 0.35) * 0.2),
  },

  {
    id: 'banner',
    label: '橫幅',
    cat: '標籤箭頭',
    inset: [1.3, 1],
    path: (w, h, o) => {
      const n = notchLen(o, 0.4, w, h, 0.12);
      return polyR(
        [
          [0, 0],
          [w, 0],
          [w - n, h / 2],
          [w, h],
          [0, h],
          [n, h / 2],
        ],
        o,
      );
    },
  },
  {
    id: 'tag',
    label: '標籤',
    cat: '標籤箭頭',
    inset: [1.7, 1],
    path: (w, h, o) => {
      const n = notchLen(o, 0.5, w, h, 0.2);
      return polyR(
        [
          [n, 0],
          [w, 0],
          [w, h],
          [n, h],
          [0, h / 2],
        ],
        o,
      );
    },
  },
  {
    id: 'arrow-right',
    label: '粗箭頭',
    cat: '標籤箭頭',
    inset: [1.55, 1.75],
    path: (w, h, o) => {
      const hd = notchLen(o, 0.55, w, h, 0.3);
      return polyR(
        [
          [0, h * 0.2],
          [w - hd, h * 0.2],
          [w - hd, 0],
          [w, h / 2],
          [w - hd, h],
          [w - hd, h * 0.8],
          [0, h * 0.8],
        ],
        o,
      );
    },
  },
  {
    id: 'chevron',
    label: 'V 形',
    cat: '標籤箭頭',
    inset: [2, 1.1],
    path: (w, h, o) => {
      const off = notchLen(o, 0.5, w, h, 0.25);
      return polyR(
        [
          [0, 0],
          [w - off, 0],
          [w, h / 2],
          [w - off, h],
          [0, h],
          [off, h / 2],
        ],
        o,
      );
    },
  },
  {
    id: 'step',
    label: '步驟條',
    cat: '標籤箭頭',
    inset: [1.8, 1.1],
    path: (w, h, o) => {
      const off = notchLen(o, 0.5, w, h, 0.25);
      return polyR(
        [
          [0, 0],
          [w - off, 0],
          [w, h / 2],
          [w - off, h],
          [0, h],
        ],
        o,
      );
    },
  },
  {
    id: 'doc',
    label: '文件',
    cat: '標籤箭頭',
    inset: [1, 1.2],
    dy: -0.07,
    path: (w, h) => [
      M(0, 0),
      L(w, 0),
      L(w, h * 0.86),
      C(w * 0.75, h * 0.72, w * 0.7, h * 1.02, w * 0.5, h * 0.9),
      C(w * 0.3, h * 0.78, w * 0.2, h * 1.02, 0, h * 0.9),
      Z,
    ],
  },
];

// ---- 可調整的項目（像 Office 圖形上的黃色調整點，這裡做成滑桿）----
const ROUND: AdjDef = { key: 'round', label: '角的圓滑', min: 0, max: 1, step: 0.05, def: 0 };
const TAIL_ADJ: AdjDef[] = [
  { key: 'tailPos', label: '尾巴位置', min: 0.05, max: 0.95, step: 0.05, def: 0.28 },
  { key: 'tailLen', label: '尾巴長度', min: 0.1, max: 0.8, step: 0.05, def: 0.3 },
  { key: 'tailWidth', label: '尾巴寬度', min: 0.08, max: 0.4, step: 0.02, def: 0.2 },
];
const CLOUD_ADJ: AdjDef[] = [
  { key: 'count', label: '凸起數量', min: 5, max: 14, step: 1, def: 8 },
  { key: 'depth', label: '凹槽深度', min: 0, max: 1, step: 0.05, def: 0.5 },
  { key: 'smooth', label: '凹槽圓滑', min: 0, max: 1, step: 0.05, def: 0 },
];
const starAdj = (inner: number): AdjDef[] => [
  {
    key: 'depth',
    label: '凹槽深度',
    min: 0,
    max: 1,
    step: 0.025,
    def: Math.round(depthOf(inner) * 1000) / 1000,
  },
  ROUND,
];
const notch = (label: string, def: number): AdjDef => ({
  key: 'notch',
  label,
  min: 0.1,
  max: 0.9,
  step: 0.05,
  def,
});
const ADJUST: Partial<Record<BoxShape, AdjDef[]>> = {
  triangle: [ROUND],
  diamond: [ROUND],
  parallelogram: [{ key: 'slant', label: '斜度', min: 0.05, max: 0.45, step: 0.01, def: 0.22 }, ROUND],
  trapezoid: [{ key: 'slant', label: '斜度', min: 0, max: 0.4, step: 0.01, def: 0.14 }, ROUND],
  pentagon: [ROUND],
  hexagon: [ROUND],
  octagon: [ROUND],
  cross: [ROUND],
  snip: [{ key: 'cut', label: '剪角大小', min: 0.05, max: 0.5, step: 0.01, def: 0.28 }, ROUND],
  cloud: CLOUD_ADJ,
  thought: CLOUD_ADJ,
  'speech-rect': TAIL_ADJ,
  'speech-round': TAIL_ADJ,
  'speech-oval': TAIL_ADJ,
  'burst-bubble': starAdj(0.72),
  star4: starAdj(0.34),
  star5: starAdj(0.4),
  star6: starAdj(0.58),
  star8: starAdj(0.72),
  burst: starAdj(0.7),
  badge: [
    { key: 'count', label: '波浪數量', min: 10, max: 30, step: 1, def: 18 },
    { key: 'depth', label: '波浪深度', min: 0, max: 1, step: 0.05, def: 0.35 },
  ],
  banner: [notch('缺口大小', 0.4), ROUND],
  tag: [notch('尖角大小', 0.5), ROUND],
  'arrow-right': [notch('箭頭大小', 0.55), ROUND],
  chevron: [notch('缺口大小', 0.5), ROUND],
  step: [notch('尖角大小', 0.5), ROUND],
};

export const SHAPES: ShapeDef[] = RAW.map((r) => ({ ...r, adjust: ADJUST[r.id] ?? [] }));

export const SHAPE_CATS = ['基本', '對話框', '星形', '標籤箭頭'] as const;
export const shapeDef = (id: BoxShape): ShapeDef => SHAPES.find((s) => s.id === id) ?? SHAPES[0]!;
export const shapePath = (id: BoxShape, w: number, h: number, o: ShapeOpts = {}): PathCmd[] =>
  shapeDef(id).path(w, h, o);

// ---- 文字放得進圖形：依調整值重算外框大小 ----
/** 把路徑攤平成多邊形（貝茲曲線取樣），只取第一個子路徑 */
export function flattenPath(cmds: PathCmd[]): Pt[] {
  const pts: Pt[] = [];
  let cur: Pt = [0, 0];
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
    } else break;
  }
  return pts;
}
export function pointInPolygon(poly: Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const hasAdj = (o: ShapeOpts) => !!o.adj && Object.keys(o.adj).length > 0;
const fitCache = new Map<string, { kx: number; ky: number; dy: number }>();

/**
 * 圖形外框相對於文字區的倍數。沒調過（或沒有可調整項目）用表裡的值，所以舊字卡的大小完全不變；
 * 調過之後把路徑取樣，二分搜尋「文字區（四角＋四邊中點）剛好都在圖形內」的最小倍數。
 * aspect：文字區的寬高比。
 */
export function fitInset(id: BoxShape, o: ShapeOpts, aspect: number): { kx: number; ky: number; dy: number } {
  const def = shapeDef(id);
  const base = { kx: def.inset[0], ky: def.inset[1], dy: def.dy ?? 0 };
  if (!hasAdj(o) || def.adjust.length === 0) return base;
  const key = `${id}|${JSON.stringify(o.adj, Object.keys(o.adj!).sort())}|${o.tail ?? ''}|${Math.round((o.radius ?? 0) / 4)}|${Math.round(aspect * 10)}`;
  const hit = fitCache.get(key);
  if (hit) return hit;
  const H = 200;
  const fits = (s: number) => {
    const kx = Math.max(base.kx * s, 1);
    const ky = Math.max(base.ky * s, 1);
    // 外框的長寬比 = 文字區長寬比 × (kx / ky)；路徑依這個外框重新生成（有些圖形的形狀跟長寬比有關）
    const W = H * Math.min(Math.max(aspect * (kx / ky), 0.2), 12);
    const poly = flattenPath(def.path(W, H, o));
    const tw = W / kx;
    const th = H / ky;
    const cx = W / 2;
    const cy = H / 2 + base.dy * H;
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
      if (!pointInPolygon(poly, cx + ((dx * tw) / 2) * 0.97, cy + ((dy * th) / 2) * 0.97)) return false;
    return true;
  };
  let lo = 0.5;
  let hi = 3.2;
  if (!fits(hi)) return base; // 怎麼放都放不進（極端調整值）：維持原本大小
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  const out = { kx: Math.max(base.kx * hi, 1), ky: Math.max(base.ky * hi, 1), dy: base.dy };
  fitCache.set(key, out);
  if (fitCache.size > 300) fitCache.delete(fitCache.keys().next().value!);
  return out;
}
