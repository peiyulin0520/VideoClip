import type { Decoration, DecorationKind } from '../model/types';

// 字卡裝飾：每種裝飾是一個函式 (墨跡矩形, 設定) → 繪圖指令（純計算，可單元測試）。
// 座標單位 px（已乘上縮放）；基準是「文字墨跡邊界」，不是字型度量。見 docs/TEXT_CARDS.md §3。

export type Rect = { x: number; y: number; w: number; h: number };
export type PathCmd =
  | ['M', number, number]
  | ['L', number, number]
  | ['C', number, number, number, number, number, number]
  | ['Z'];
export type Op = {
  type: 'stroke' | 'fill';
  cmds: PathCmd[];
  width?: number; // stroke 線寬 px
  dash?: number[]; // px；點點用 [0, 間距] 配圓頭
  alpha?: number;
};

export type DecoKindDef = {
  kind: DecorationKind;
  label: string;
  width: number;
  color: string;
  /** 有線寬可以調 */
  hasWidth: boolean;
  /** 有「大小」可以調 */
  hasScale: boolean;
  /** 距離滑桿的名稱（螢光筆是上下位置） */
  gapLabel: string;
};
const BASE: Omit<DecoKindDef, 'kind' | 'label' | 'width' | 'color'> = {
  hasWidth: true,
  hasScale: false,
  gapLabel: '與文字距離',
};
export const DECORATION_KINDS: DecoKindDef[] = (
  [
    { kind: 'tail-loop', label: '尾端圈圈', width: 0.15, color: '#E2006E' },
    { kind: 'wave-underline', label: '波浪底線', width: 0.07, color: '#ff4d8d' },
    { kind: 'dashed-underline', label: '虛線', width: 0.06, color: '#4dd0ff' },
    { kind: 'dotted-underline', label: '點點線', width: 0.09, color: '#ffd23f' },
    { kind: 'double-line', label: '雙底線', width: 0.05, color: '#ff4d8d' },
    { kind: 'marker', label: '螢光筆', width: 1, color: '#ffe14d' },
    { kind: 'scribble-circle', label: '手繪圈住', width: 0.07, color: '#ff4d8d' },
    { kind: 'arrow-curve', label: '彎箭頭', width: 0.07, color: '#ffd23f' },
    { kind: 'sparkles', label: '星星', width: 1, color: '#ffd23f' },
    { kind: 'hearts', label: '愛心', width: 1, color: '#ff4d8d' },
    { kind: 'slashes', label: '斜線', width: 0.08, color: '#ffffff' },
    { kind: 'check', label: '打勾', width: 0.12, color: '#7CFC6A' },
    { kind: 'corner-brackets', label: '角括號', width: 0.06, color: '#ffffff' },
  ] as Pick<DecoKindDef, 'kind' | 'label' | 'width' | 'color'>[]
).map((k) => ({
  ...BASE,
  ...k,
  ...(k.kind === 'marker' ? { hasWidth: false, gapLabel: '上下位置' } : {}),
  ...(k.kind === 'sparkles' || k.kind === 'hearts' ? { hasWidth: false, hasScale: true } : {}),
  ...(k.kind === 'check' || k.kind === 'arrow-curve' ? { hasScale: true } : {}),
}));

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

/** 尾端圈圈：路徑照 docs/TEXT_CARDS.md §3.1（u：墨跡寬 0–1；v：墨跡高，0＝墨跡底部、往下為正） */
const TAIL: [number, number][][] = [
  [[-0.02, 0.42]],
  [
    [0.15, 0.42],
    [0.35, 0.42],
    [0.47, 0.42],
  ],
  [
    [0.6, 0.42],
    [0.75, 0.3],
    [0.92, 0.3],
  ],
  [
    [1.05, 0.3],
    [1.17, 0.4],
    [1.175, 0.63],
  ],
  [
    [1.18, 0.85],
    [1.02, 1.13],
    [0.9, 1.13],
  ],
  [
    [0.8, 1.13],
    [0.77, 0.95],
    [0.84, 0.86],
  ],
  [
    [0.9, 0.72],
    [0.98, 0.62],
    [1.06, 0.62],
  ],
  [
    [1.14, 0.62],
    [1.22, 0.78],
    [1.285, 0.89],
  ],
];

function tailLoop(ink: Rect, lw: number): Op[] {
  const bottom = ink.y + ink.h;
  // 字很長（w/h > 5.3）時圈圈不要被拉扁：圈圈（u > 0.75）改成以字高為基準的固定大小、貼著字右緣，
  // 前面的直線段把剩下的寬度拉長補上。w/h = 5.3 時和等比縮放完全一樣，所以接起來是連續的。
  const long = ink.w / ink.h > 5.3;
  const loopW = 5.3 * ink.h;
  const mx = (u: number) =>
    long
      ? u > 0.75
        ? ink.x + ink.w + (u - 1) * loopW
        : ink.x + (u * (ink.w - 0.25 * loopW)) / 0.75
      : ink.x + u * ink.w;
  const my = (v: number) => bottom + v * ink.h;
  const cmds: PathCmd[] = [M(mx(TAIL[0]![0]![0]), my(TAIL[0]![0]![1]))];
  for (const seg of TAIL.slice(1)) {
    const [a, b, c] = seg as [[number, number], [number, number], [number, number]];
    cmds.push(C(mx(a[0]), my(a[1]), mx(b[0]), my(b[1]), mx(c[0]), my(c[1])));
  }
  return [{ type: 'stroke', cmds, width: lw }];
}

function line(x1: number, y1: number, x2: number, y2: number): PathCmd[] {
  return [M(x1, y1), L(x2, y2)];
}

function star(cx: number, cy: number, r: number): PathCmd[] {
  const k = r * 0.28;
  return [
    M(cx, cy - r),
    L(cx + k, cy - k),
    L(cx + r, cy),
    L(cx + k, cy + k),
    L(cx, cy + r),
    L(cx - k, cy + k),
    L(cx - r, cy),
    L(cx - k, cy - k),
    ['Z'],
  ];
}

function heart(cx: number, cy: number, s: number): PathCmd[] {
  return [
    M(cx, cy + s * 0.9),
    C(cx - s * 1.3, cy + s * 0.1, cx - s * 0.9, cy - s * 0.9, cx, cy - s * 0.35),
    C(cx + s * 0.9, cy - s * 0.9, cx + s * 1.3, cy + s * 0.1, cx, cy + s * 0.9),
    ['Z'],
  ];
}

export function decorationOps(d: Decoration, ink: Rect): Op[] {
  const { x, y, w, h } = ink;
  const r = x + w;
  const b = y + h;
  const cy = y + h / 2;
  const lw = Math.max(d.width * h, 1);
  const gap = (d.gap ?? 0) * h; // 與文字的距離（px）：往外推開
  const sc = d.scale ?? 1; // 大小倍數（星星、愛心、打勾、箭頭）
  // 底線類：線的「上緣」離字底 0.32 字高 + gap；線變粗時往下長，不會往上碰到字
  const under = (extra = 0) => b + h * 0.32 + gap + lw / 2 + extra;
  switch (d.kind) {
    case 'tail-loop':
      return tailLoop({ ...ink, y: ink.y + gap }, lw); // 整條往下移 gap
    case 'wave-underline': {
      const amp = h * 0.08;
      const y0 = under(amp);
      const wl = h * 0.55;
      const x0 = x - h * 0.05;
      const x1 = r + h * 0.05;
      const n = Math.max(Math.ceil(((x1 - x0) / wl) * 8), 8);
      const cmds: PathCmd[] = [];
      for (let i = 0; i <= n; i++) {
        const px = x0 + ((x1 - x0) * i) / n;
        const py = y0 + Math.sin(((px - x0) / wl) * Math.PI * 2) * amp;
        cmds.push(i === 0 ? M(px, py) : L(px, py));
      }
      return [{ type: 'stroke', cmds, width: lw }];
    }
    case 'dashed-underline':
      return [{ type: 'stroke', cmds: line(x, under(), r, under()), width: lw, dash: [lw * 2.4, lw * 1.6] }];
    case 'dotted-underline':
      return [{ type: 'stroke', cmds: line(x, under(), r, under()), width: lw, dash: [0, lw * 2] }];
    case 'double-line':
      return [
        { type: 'stroke', cmds: line(x, under(), r, under()), width: lw },
        { type: 'stroke', cmds: line(x, under(lw * 2.4), r, under(lw * 2.4)), width: lw },
      ];
    case 'marker': {
      // 斜、不規則邊的半透明色塊，畫在字後面；gap＝上下位置（正＝往下、負＝往上）
      const t = y + h * 0.4 + gap;
      const bt = b + h * 0.06 + gap;
      return [
        {
          type: 'fill',
          alpha: 0.65,
          cmds: [
            M(x - h * 0.12, t + h * 0.04),
            L(r + h * 0.1, t - h * 0.03),
            L(r + h * 0.14, bt - h * 0.05),
            L(x - h * 0.08, bt + h * 0.03),
            ['Z'],
          ],
        },
      ];
    }
    case 'scribble-circle': {
      // 橢圓、頭尾不閉合、稍微超出；半徑慢慢變大（螺旋），像手繪
      const rx = w / 2 + h * 0.55 + gap;
      const ry = h * 0.78 + gap;
      const cx = x + w / 2;
      const cmds: PathCmd[] = [];
      const steps = 56;
      const a0 = (-160 * Math.PI) / 180;
      const sweep = (350 * Math.PI) / 180;
      for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const a = a0 + sweep * f;
        const grow = 1 + 0.07 * f;
        const px = cx + Math.cos(a) * rx * grow;
        const py = cy + Math.sin(a) * ry * grow;
        cmds.push(i === 0 ? M(px, py) : L(px, py));
      }
      return [{ type: 'stroke', cmds, width: lw }];
    }
    case 'arrow-curve': {
      const ex = r + h * 0.3 + gap;
      const ey = cy + h * 0.1;
      const sx = ex + h * 1.0 * sc;
      const sy = ey - h * 1.1 * sc;
      const c2x = ex + h * 1.1 * sc;
      const c2y = ey + h * 0.4 * sc;
      const ang = Math.atan2(ey - c2y, ex - c2x);
      const hl = h * 0.35 * sc;
      const head = (da: number): PathCmd[] =>
        line(ex, ey, ex - Math.cos(ang + da) * hl, ey - Math.sin(ang + da) * hl);
      return [
        {
          type: 'stroke',
          cmds: [M(sx, sy), C(sx + h * 0.2 * sc, sy + h * 0.3 * sc, c2x, c2y, ex, ey)],
          width: lw,
        },
        { type: 'stroke', cmds: [...head(0.5), ...head(-0.5)], width: lw },
      ];
    }
    case 'sparkles':
      return [
        { type: 'fill', cmds: star(r + h * 0.15 + gap, y - h * 0.15 - gap, h * 0.4 * sc) },
        { type: 'fill', cmds: star(x - h * 0.25 - gap, y + h * 0.15, h * 0.26 * sc) },
        { type: 'fill', cmds: star(r + h * 0.45 + gap, b - h * 0.1 + gap * 0.5, h * 0.22 * sc) },
      ];
    case 'hearts':
      return [
        { type: 'fill', cmds: heart(x - (h * 0.55 * sc + gap), cy - h * 0.1, h * 0.28 * sc) },
        { type: 'fill', cmds: heart(r + (h * 0.55 * sc + gap), cy + h * 0.1, h * 0.28 * sc) },
      ];
    case 'slashes':
      return [
        {
          type: 'stroke',
          cmds: line(x - h * 0.7 - gap, y - h * 0.05, x - h * 0.3 - gap, b + h * 0.05),
          width: lw,
        },
        {
          type: 'stroke',
          cmds: line(r + h * 0.3 + gap, b + h * 0.05, r + h * 0.7 + gap, y - h * 0.05),
          width: lw,
        },
      ];
    case 'check': {
      // 以勾的右上端為錨點，往左下畫；scale 放大整個勾，gap 往左推開
      const ax = x - h * 0.25 - gap;
      const ay = cy - h * 0.38;
      return [
        {
          type: 'stroke',
          cmds: [M(ax - h * 0.8 * sc, ay + h * 0.4 * sc), L(ax - h * 0.5 * sc, ay + h * 0.7 * sc), L(ax, ay)],
          width: lw,
        },
      ];
    }
    case 'corner-brackets': {
      const m = h * 0.28 + gap;
      const arm = h * 0.4;
      const [l, t, rr, bb] = [x - m, y - m, r + m, b + m];
      return [
        {
          type: 'stroke',
          cmds: [
            M(l, t + arm),
            L(l, t),
            L(l + arm, t),
            M(rr - arm, t),
            L(rr, t),
            L(rr, t + arm),
            M(rr, bb - arm),
            L(rr, bb),
            L(rr - arm, bb),
            M(l + arm, bb),
            L(l, bb),
            L(l, bb - arm),
          ],
          width: lw,
        },
      ];
    }
  }
}

/** 一組指令的外框（含線寬），用來決定字卡畫布要多留多少邊 */
export function opsBounds(ops: Op[]): { l: number; t: number; r: number; b: number } | null {
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (const op of ops) {
    const pad = (op.width ?? 0) / 2;
    for (const c of op.cmds) {
      for (let i = 1; i < c.length; i += 2) {
        const px = c[i] as number;
        const py = c[i + 1] as number;
        l = Math.min(l, px - pad);
        r = Math.max(r, px + pad);
        t = Math.min(t, py - pad);
        b = Math.max(b, py + pad);
      }
    }
  }
  return Number.isFinite(l) ? { l, t, r, b } : null;
}

/** 同上，但貝茲曲線用曲線上的點量（不是控制點），範圍比較貼近看得到的線條 */
export function opsExtent(ops: Op[]): { l: number; t: number; r: number; b: number } | null {
  const flat: Op[] = ops.map((op) => {
    const cmds: PathCmd[] = [];
    let cur: [number, number] = [0, 0];
    for (const c of op.cmds) {
      if (c[0] === 'M' || c[0] === 'L') {
        cur = [c[1], c[2]];
        cmds.push(c);
      } else if (c[0] === 'C') {
        const [x0, y0] = cur;
        for (let i = 1; i <= 12; i++) {
          const t = i / 12;
          const u = 1 - t;
          cmds.push([
            'L',
            u * u * u * x0 + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5],
            u * u * u * y0 + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6],
          ]);
        }
        cur = [c[5], c[6]];
      }
    }
    return { ...op, cmds };
  });
  return opsBounds(flat);
}

export function drawOps(ctx: CanvasRenderingContext2D, ops: Op[], color: string) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'transparent';
  for (const op of ops) {
    ctx.beginPath();
    for (const c of op.cmds) {
      if (c[0] === 'M') ctx.moveTo(c[1], c[2]);
      else if (c[0] === 'L') ctx.lineTo(c[1], c[2]);
      else if (c[0] === 'C') ctx.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
      else ctx.closePath();
    }
    ctx.globalAlpha = op.alpha ?? 1;
    if (op.type === 'fill') {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = op.width ?? 1;
      ctx.setLineDash(op.dash ?? []);
      ctx.stroke();
    }
  }
  ctx.restore();
}
