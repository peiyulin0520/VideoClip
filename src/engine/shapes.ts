import type { BoxShape } from '../model/types';
import type { PathCmd } from './decorations';

// 圖形庫（Office 簡報風格，自己用路徑實作，沒有用任何現成圖檔）。見 docs/TEXT_CARDS.md §4。
// 每個圖形：(w, h, 選項) → 路徑指令。當字塊用時，圖形大小 = 文字墨跡 + 內距，再乘上 inset，
// 讓文字（矩形）剛好放得進圖形裡面（橢圓、星形、愛心的可放文字區比外框小）。

export type ShapeOpts = { radius?: number; tail?: 'bottom-left' | 'bottom-right' };
export type ShapeDef = {
  id: BoxShape;
  label: string;
  cat: '基本' | '對話框' | '星形' | '標籤箭頭';
  /** 圖形外框 = 文字區 ×（kx, ky）；dy：文字區中心往下移圖形高度的比例 */
  inset: [number, number];
  dy?: number;
  tail?: boolean; // 有尾巴（對話框）
  path: (w: number, h: number, o: ShapeOpts) => PathCmd[];
};

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
/** 在順時針邊界的底部插入一個尖尾巴（左下或右下）；尾巴往下延伸 tailLen。順時針時底邊是由右往左走。 */
function withTail(
  raw: Pt[],
  w: number,
  h: number,
  side: 'bottom-left' | 'bottom-right',
  tailLen: number,
): PathCmd[] {
  const pts = densify(raw, Math.max(w, h) / 60);
  const x1 = side === 'bottom-left' ? w * 0.18 : w * 0.62;
  const x2 = x1 + w * 0.2;
  const tipX = side === 'bottom-left' ? w * 0.1 : w * 0.9;
  const lower = pts.map((p, i) => ({ p, i })).filter((q) => q.p[1] > h * 0.6);
  const nearest = (x: number) =>
    lower.reduce((a, b) => (Math.abs(a.p[0] - x) <= Math.abs(b.p[0] - x) ? a : b)).i;
  const iR = nearest(x2);
  const iL = nearest(x1);
  const out: Pt[] = [...pts.slice(0, iR + 1), [tipX, h + tailLen], ...pts.slice(iL)];
  return poly(out);
}

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
function scallop(w: number, h: number, n: number, bulge: number, ry0 = 0.5, rx0 = 0.5): PathCmd[] {
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
    cmds.push(
      C(p[0] + dx * k * 0.6, p[1] + dy * k * 0.6, q[0] + dx * k * 0.6, q[1] + dy * k * 0.6, q[0], q[1]),
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

export const SHAPES: ShapeDef[] = [
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
    path: (w, h) =>
      poly(
        rel(w, h, [
          [0.5, 0],
          [1, 1],
          [0, 1],
        ]),
      ),
  },
  {
    id: 'diamond',
    label: '菱形',
    cat: '基本',
    inset: [2, 2],
    path: (w, h) =>
      poly(
        rel(w, h, [
          [0.5, 0],
          [1, 0.5],
          [0.5, 1],
          [0, 0.5],
        ]),
      ),
  },
  {
    id: 'parallelogram',
    label: '斜切色塊',
    cat: '基本',
    inset: [1.8, 1],
    path: (w, h) => {
      const o = Math.min(h * 0.45, w * 0.22);
      return poly([
        [o, 0],
        [w, 0],
        [w - o, h],
        [0, h],
      ]);
    },
  },
  {
    id: 'trapezoid',
    label: '梯形',
    cat: '基本',
    inset: [1.45, 1],
    path: (w, h) => {
      const o = w * 0.14;
      return poly([
        [o, 0],
        [w - o, 0],
        [w, h],
        [0, h],
      ]);
    },
  },
  {
    id: 'pentagon',
    label: '五邊形',
    cat: '基本',
    inset: [1.55, 1.55],
    dy: 0.08,
    path: (w, h) =>
      poly(
        rel(w, h, [
          [0.5, 0],
          [1, 0.38],
          [0.81, 1],
          [0.19, 1],
          [0, 0.38],
        ]),
      ),
  },
  {
    id: 'hexagon',
    label: '六邊形',
    cat: '基本',
    inset: [1.55, 1.55],
    path: (w, h) =>
      poly(
        rel(w, h, [
          [0.25, 0],
          [0.75, 0],
          [1, 0.5],
          [0.75, 1],
          [0.25, 1],
          [0, 0.5],
        ]),
      ),
  },
  {
    id: 'octagon',
    label: '八邊形',
    cat: '基本',
    inset: [1.45, 1.45],
    path: (w, h) => {
      const c = Math.min(w, h) * 0.29;
      return poly([
        [c, 0],
        [w - c, 0],
        [w, c],
        [w, h - c],
        [w - c, h],
        [c, h],
        [0, h - c],
        [0, c],
      ]);
    },
  },
  {
    id: 'cross',
    label: '十字',
    cat: '基本',
    inset: [2.55, 2.55],
    path: (w, h) =>
      poly(
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
      ),
  },
  {
    id: 'snip',
    label: '剪角',
    cat: '基本',
    inset: [1.4, 1.4],
    path: (w, h) => {
      const c = Math.min(w, h) * 0.28;
      return poly([
        [0, 0],
        [w - c, 0],
        [w, c],
        [w, h],
        [c, h],
        [0, h - c],
      ]);
    },
  },
  { id: 'heart', label: '愛心', cat: '基本', inset: [1.9, 1.9], dy: -0.04, path: heartPath },
  {
    id: 'cloud',
    label: '雲朵',
    cat: '基本',
    inset: [1.75, 1.75],
    dy: -0.08,
    path: (w, h) => scallop(w, h, 8, 0.22, 0.5, 0.5),
  },
  { id: 'cylinder', label: '圓柱', cat: '基本', inset: [1.1, 1.3], path: cylinder },

  {
    id: 'speech-rect',
    label: '方對話框',
    cat: '對話框',
    inset: [1, 1],
    tail: true,
    path: (w, h, o) => withTail(roundRectPoly(w, h, 0), w, h, o.tail ?? 'bottom-left', Math.min(w, h) * 0.3),
  },
  {
    id: 'speech-round',
    label: '圓角對話框',
    cat: '對話框',
    inset: [1.08, 1.08],
    tail: true,
    path: (w, h, o) =>
      withTail(roundRectPoly(w, h, o.radius ?? 36), w, h, o.tail ?? 'bottom-left', Math.min(w, h) * 0.3),
  },
  {
    id: 'speech-oval',
    label: '橢圓對話框',
    cat: '對話框',
    inset: [1.45, 1.45],
    tail: true,
    path: (w, h, o) => withTail(ellipsePoly(w, h), w, h, o.tail ?? 'bottom-left', Math.min(w, h) * 0.3),
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
        ...scallop(w, h, 8, 0.22),
        ...ellipsePath(x1, h + s * 0.12, s * 0.09, s * 0.075),
        ...ellipsePath(x2, h + s * 0.3, s * 0.05, s * 0.04),
      ];
    },
  },
  {
    id: 'burst-bubble',
    label: '爆炸對話框',
    cat: '對話框',
    inset: [1.8, 1.8],
    path: (w, h) => poly(starPoly(w, h, 14, 0.72, -Math.PI / 2, 0.12)),
  },

  {
    id: 'star4',
    label: '四角星',
    cat: '星形',
    inset: [4.1, 4.1],
    path: (w, h) => poly(starPoly(w, h, 4, 0.34)),
  },
  {
    id: 'star5',
    label: '五角星',
    cat: '星形',
    inset: [2.75, 2.75],
    dy: 0.02,
    path: (w, h) => poly(starPoly(w, h, 5, 0.4)),
  },
  {
    id: 'star6',
    label: '六角星',
    cat: '星形',
    inset: [2, 2],
    path: (w, h) => poly(starPoly(w, h, 6, 0.58)),
  },
  {
    id: 'star8',
    label: '八角星',
    cat: '星形',
    inset: [1.45, 1.45],
    path: (w, h) => poly(starPoly(w, h, 8, 0.72)),
  },
  {
    id: 'burst',
    label: '爆炸',
    cat: '星形',
    inset: [2.05, 2.05],
    dy: -0.02,
    path: (w, h) => poly(starPoly(w, h, 12, 0.7, -Math.PI / 2, 0.14)),
  },
  {
    id: 'badge',
    label: '波浪印章',
    cat: '星形',
    inset: [1.45, 1.45],
    path: (w, h) => scallop(w, h, 18, 0.07),
  },

  {
    id: 'banner',
    label: '橫幅',
    cat: '標籤箭頭',
    inset: [1.3, 1],
    path: (w, h) => {
      const n = Math.min(h * 0.4, w * 0.12);
      return poly([
        [0, 0],
        [w, 0],
        [w - n, h / 2],
        [w, h],
        [0, h],
        [n, h / 2],
      ]);
    },
  },
  {
    id: 'tag',
    label: '標籤',
    cat: '標籤箭頭',
    inset: [1.7, 1],
    path: (w, h) => {
      const n = Math.min(h * 0.5, w * 0.2);
      return poly([
        [n, 0],
        [w, 0],
        [w, h],
        [n, h],
        [0, h / 2],
      ]);
    },
  },
  {
    id: 'arrow-right',
    label: '粗箭頭',
    cat: '標籤箭頭',
    inset: [1.55, 1.75],
    path: (w, h) => {
      const hd = Math.min(h * 0.55, w * 0.3);
      return poly([
        [0, h * 0.2],
        [w - hd, h * 0.2],
        [w - hd, 0],
        [w, h / 2],
        [w - hd, h],
        [w - hd, h * 0.8],
        [0, h * 0.8],
      ]);
    },
  },
  {
    id: 'chevron',
    label: 'V 形',
    cat: '標籤箭頭',
    inset: [2, 1.1],
    path: (w, h) => {
      const o = Math.min(h * 0.5, w * 0.25);
      return poly([
        [0, 0],
        [w - o, 0],
        [w, h / 2],
        [w - o, h],
        [0, h],
        [o, h / 2],
      ]);
    },
  },
  {
    id: 'step',
    label: '步驟條',
    cat: '標籤箭頭',
    inset: [1.8, 1.1],
    path: (w, h) => {
      const o = Math.min(h * 0.5, w * 0.25);
      return poly([
        [0, 0],
        [w - o, 0],
        [w, h / 2],
        [w - o, h],
        [0, h],
      ]);
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

export const SHAPE_CATS = ['基本', '對話框', '星形', '標籤箭頭'] as const;
export const shapeDef = (id: BoxShape): ShapeDef => SHAPES.find((s) => s.id === id) ?? SHAPES[0]!;
export const shapePath = (id: BoxShape, w: number, h: number, o: ShapeOpts = {}): PathCmd[] =>
  shapeDef(id).path(w, h, o);
