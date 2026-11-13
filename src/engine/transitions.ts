import type { Item, TransitionKind, VideoItem } from '../model/types';

// 轉場（兩個緊接的片段 A、B 之間）。效果以「接縫」為中心的一小段時間（duration 秒）：
// 前半 A 還在、B 提前出現；後半 B 在、A 延長（用素材在出點之後／入點之前的畫面，沒有就停在邊緣那一格），
// 所以兩段真的重疊，才做得出疊化、捲簾、分割這類需要兩段同時出現的效果。時間軸上的片段長度、位置都不變。
// 每種轉場是一個純函式 transitionFrame(kind, p) → 這一刻 A、B 各自怎麼畫（位移、縮放、透明度、裁切範圍、模糊）
// ＋要蓋的顏色層；預覽、匯出、選單上的 A→B 小動畫都用它。

export type TransitionCat = '基本' | '相機動作' | '特效' | '故障';
export type TransitionDef = { id: TransitionKind; name: string; code: string; cat: TransitionCat };

export const TRANSITIONS: TransitionDef[] = [
  { id: 'dissolve', name: '疊化', code: '疊', cat: '基本' },
  { id: 'blackflash', name: '閃黑', code: '黑', cat: '基本' },
  { id: 'whiteflash', name: '閃白', code: '白', cat: '基本' },
  { id: 'overexpose', name: '過曝', code: '曝', cat: '基本' },
  { id: 'zoomDissolve', name: '放大疊化', code: '放', cat: '基本' },
  { id: 'moveL', name: '左移', code: '左', cat: '基本' },
  { id: 'moveR', name: '右移', code: '右', cat: '基本' },
  { id: 'moveU', name: '上移', code: '上', cat: '基本' },
  { id: 'moveD', name: '下移', code: '下', cat: '基本' },
  { id: 'rollDown', name: '捲簾放下', code: '捲', cat: '基本' },
  { id: 'rollUp', name: '捲簾收合', code: '收', cat: '基本' },
  { id: 'circleOut', name: '中心擴散', code: '擴', cat: '基本' },
  { id: 'topOut', name: '上部擴散', code: '頂', cat: '基本' },
  { id: 'bottomOut', name: '下部擴散', code: '底', cat: '基本' },
  { id: 'blur', name: '模糊轉場', code: '糊', cat: '基本' },
  { id: 'defocus', name: '虛焦轉場', code: '焦', cat: '基本' },
  { id: 'fastL', name: '極速左移', code: '速', cat: '相機動作' },
  { id: 'fastR', name: '極速右移', code: '疾', cat: '相機動作' },
  { id: 'slideL', name: '向左滑動', code: '滑', cat: '相機動作' },
  { id: 'slideR', name: '向右滑動', code: '划', cat: '相機動作' },
  { id: 'slideU', name: '向上滑動', code: '升', cat: '相機動作' },
  { id: 'slideD', name: '向下滑動', code: '降', cat: '相機動作' },
  { id: 'zoomIn', name: '縮放進', code: '進', cat: '相機動作' },
  { id: 'zoomOut', name: '縮放出', code: '出', cat: '相機動作' },
  { id: 'flash', name: '暖色閃光', code: '閃', cat: '特效' },
  { id: 'filmUp', name: '膠片上移', code: '膠', cat: '特效' },
  { id: 'filmLeft', name: '膠片左移', code: '片', cat: '特效' },
  { id: 'grid4', name: '四宮格', code: '四', cat: '特效' },
  { id: 'grid9', name: '九宮格', code: '九', cat: '特效' },
  { id: 'glitch1', name: '干擾', code: '擾', cat: '故障' },
  { id: 'glitch2', name: '故障 1', code: '障', cat: '故障' },
  { id: 'glitch3', name: '故障 2', code: '亂', cat: '故障' },
];
export const TRANSITION_CATS: TransitionCat[] = ['基本', '相機動作', '特效', '故障'];
export const DEFAULT_TRANSITION_DURATION = 0.5;
export const MIN_TRANSITION = 0.2;
export const MAX_TRANSITION = 2;
export const transitionCode = (k: TransitionKind): string =>
  TRANSITIONS.find((x) => x.id === k)?.code ?? '轉';
export const transitionName = (k: TransitionKind): string =>
  TRANSITIONS.find((x) => x.id === k)?.name ?? '轉場';

/** 舊版（2026-11-13 之前）的轉場名稱 → 新名稱 */
export const LEGACY_TRANSITIONS: Record<string, TransitionKind> = {
  fade: 'dissolve',
  black: 'blackflash',
  white: 'whiteflash',
  push: 'moveL',
  rise: 'moveU',
  zoom: 'zoomIn',
};

/** 一個片段進場轉場的位置：接縫時間 cut、整段長度 d（會被限制在兩個片段各自的長度內），前一個片段 */
export type TransitionSpan = { cut: number; d: number; prev: VideoItem };

const EPS = 0.03;

/** 這個片段前面緊接著另一個片段（同一軌，接縫誤差 30ms 內）才算有轉場 */
export function transitionSpan(items: Item[], it: Item): TransitionSpan | null {
  if (it.type === 'text' || it.type === 'audio' || !it.transitionIn) return null;
  const prev = items.find(
    (x): x is VideoItem =>
      x.type !== 'text' && x.type !== 'audio' && Math.abs(x.start + x.duration - it.start) < EPS,
  );
  if (!prev) return null;
  const d = Math.min(it.transitionIn.duration, 2 * Math.min(prev.duration, it.duration));
  return d > 0.05 ? { cut: it.start, d, prev } : null;
}

/** 一軌上緊接在一起的片段（接縫處）：可以在這裡加轉場 */
export function seamsOf(items: Item[]): { prev: VideoItem; next: VideoItem }[] {
  const vids = items.filter((x): x is VideoItem => x.type !== 'text' && x.type !== 'audio' && !x.group);
  const out: { prev: VideoItem; next: VideoItem }[] = [];
  for (const next of vids) {
    const prev = vids.find((x) => x !== next && Math.abs(x.start + x.duration - next.start) < EPS);
    if (prev) out.push({ prev, next });
  }
  return out;
}

/** 目前時間 t 在這個轉場的哪裡：0＝開始、0.5＝接縫、1＝結束；不在轉場裡就是 null */
export function transitionProgress(span: TransitionSpan, t: number): number | null {
  const p = (t - (span.cut - span.d / 2)) / span.d;
  return p >= 0 && p < 1 ? p : null;
}

// ---------- 每一種轉場「這一刻」的樣子 ----------

/** 裁切範圍（佔畫面寬、高的比例；圓的半徑佔畫面長邊的比例） */
export type ClipFrac =
  | { kind: 'rects'; rects: [number, number, number, number][] }
  | { kind: 'circle'; cx: number; cy: number; r: number };

export type Look = {
  /** 位移（佔畫面寬、高的比例）、以畫面中心放大的倍數、透明度 */
  dx: number;
  dy: number;
  scale: number;
  opacity: number;
  clip?: ClipFrac;
  /** 模糊程度（佔畫面短邊的比例） */
  blur?: number;
};
export type Cover = {
  kind: 'solid' | 'flash';
  color: string;
  alpha: number;
  /** 只蓋這一塊（佔畫面的比例）；沒有＝全畫面 */
  rect?: [number, number, number, number];
};
export type TransitionFrame = { a: Look; b: Look; bOnTop: boolean; covers: Cover[] };

const idle = (): Look => ({ dx: 0, dy: 0, scale: 1, opacity: 1 });
const tri = (p: number) => Math.sin(Math.PI * p); // 0 → 1 → 0，中間最大
const smooth = (p: number) => p * p * (3 - 2 * p);
const cubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);
/** 小數字雜訊（同一個 seed 永遠同一個值，預覽與匯出才會一樣） */
const rnd = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** 把 A 在 0.5 之前、B 在 0.5 之後用「硬切」呈現（顏色層蓋住切換的那一刻） */
const cut = (p: number): { a: Look; b: Look } => ({
  a: { ...idle(), opacity: p < 0.5 ? 1 : 0 },
  b: { ...idle(), opacity: p < 0.5 ? 0 : 1 },
});

function move(dx: number, dy: number, e: number, blur = 0): TransitionFrame {
  return {
    a: { ...idle(), dx: dx * e, dy: dy * e, blur },
    b: { ...idle(), dx: -dx * (1 - e), dy: -dy * (1 - e), blur },
    bOnTop: true,
    covers: [],
  };
}

const GRID4 = [0, 3, 1, 2];
const GRID9 = [4, 0, 8, 2, 6, 1, 7, 3, 5];

function grid(n: 2 | 3, order: number[], p: number): ClipFrac {
  const rects: [number, number, number, number][] = [];
  const total = n * n;
  order.forEach((cell, k) => {
    if (p >= (k + 0.5) / (total + 0.5)) rects.push([(cell % n) / n, Math.floor(cell / n) / n, 1 / n, 1 / n]);
  });
  return { kind: 'rects', rects };
}

/** p：轉場進度 0（只有 A）→ 1（只有 B） */
export function transitionFrame(kind: TransitionKind, p0: number): TransitionFrame {
  const p = clamp01(p0);
  const e = smooth(p);
  switch (kind) {
    case 'dissolve':
      return { a: idle(), b: { ...idle(), opacity: p }, bOnTop: true, covers: [] };
    case 'blackflash':
      return {
        ...cut(p),
        bOnTop: true,
        covers: [{ kind: 'solid', color: '#000000', alpha: Math.min(1, tri(p) * 2.4) }],
      };
    case 'whiteflash':
      return {
        ...cut(p),
        bOnTop: true,
        covers: [{ kind: 'solid', color: '#ffffff', alpha: Math.min(1, tri(p) ** 1.5 * 1.3) }],
      };
    case 'overexpose':
      return {
        ...cut(p),
        bOnTop: true,
        covers: [{ kind: 'solid', color: '#fffbe8', alpha: Math.min(1, tri(p) * 1.8) }],
      };
    case 'flash':
      return {
        ...cut(p),
        bOnTop: true,
        covers: [{ kind: 'flash', color: '#ffb457', alpha: Math.min(1, tri(p) ** 1.2 * 1.2) }],
      };
    case 'zoomDissolve':
      return { a: { ...idle(), scale: 1 + 0.35 * e, opacity: 1 - p }, b: idle(), bOnTop: false, covers: [] };
    case 'moveL':
      return move(-1, 0, e);
    case 'moveR':
      return move(1, 0, e);
    case 'moveU':
      return move(0, -1, e);
    case 'moveD':
      return move(0, 1, e);
    case 'fastL':
      return move(-1, 0, cubic(p), 0.03 * tri(p));
    case 'fastR':
      return move(1, 0, cubic(p), 0.03 * tri(p));
    case 'slideL':
      return move(-0.7, 0, e, 0.012 * tri(p));
    case 'slideR':
      return move(0.7, 0, e, 0.012 * tri(p));
    case 'slideU':
      return move(0, -0.7, e, 0.012 * tri(p));
    case 'slideD':
      return move(0, 0.7, e, 0.012 * tri(p));
    case 'rollDown': {
      // B 像捲簾一樣從上面放下來蓋住 A；放下的邊緣一條暗線
      return {
        a: idle(),
        b: { ...idle(), clip: { kind: 'rects', rects: [[0, 0, 1, e]] } },
        bOnTop: true,
        covers: [
          {
            kind: 'solid',
            color: '#000000',
            alpha: 0.55 * tri(Math.min(p * 1.1, 1)),
            rect: [0, Math.max(e - 0.012, 0), 1, 0.012],
          },
        ],
      };
    }
    case 'rollUp':
      // A 像捲簾一樣往上收起來，露出下面的 B
      return {
        a: { ...idle(), clip: { kind: 'rects', rects: [[0, 0, 1, 1 - e]] } },
        b: idle(),
        bOnTop: false,
        covers: [
          {
            kind: 'solid',
            color: '#000000',
            alpha: 0.55 * tri(Math.min(p * 1.1, 1)),
            rect: [0, Math.max(1 - e - 0.012, 0), 1, 0.012],
          },
        ],
      };
    case 'circleOut':
      return {
        a: idle(),
        b: { ...idle(), clip: { kind: 'circle', cx: 0.5, cy: 0.5, r: e * 0.78 } },
        bOnTop: true,
        covers: [],
      };
    case 'topOut':
      return {
        a: idle(),
        b: { ...idle(), clip: { kind: 'circle', cx: 0.5, cy: 0, r: e * 1.25 } },
        bOnTop: true,
        covers: [],
      };
    case 'bottomOut':
      return {
        a: idle(),
        b: { ...idle(), clip: { kind: 'circle', cx: 0.5, cy: 1, r: e * 1.25 } },
        bOnTop: true,
        covers: [],
      };
    case 'blur':
      return {
        a: { ...idle(), blur: 0.04 * p, opacity: 1 - p },
        b: { ...idle(), blur: 0.04 * (1 - p) },
        bOnTop: false,
        covers: [],
      };
    case 'defocus':
      return {
        a: { ...idle(), blur: 0.05 * p, scale: 1 + 0.12 * p, opacity: 1 - p },
        b: { ...idle(), blur: 0.05 * (1 - p), scale: 1.12 - 0.12 * p },
        bOnTop: false,
        covers: [],
      };
    case 'zoomIn':
      return {
        a: { ...idle(), scale: 1 + e, opacity: 1 - e },
        b: { ...idle(), scale: 0.6 + 0.4 * e },
        bOnTop: false,
        covers: [],
      };
    case 'zoomOut':
      return {
        a: { ...idle(), scale: 1 - 0.5 * e, opacity: 1 - e },
        b: { ...idle(), scale: 1.5 - 0.5 * e, opacity: e },
        bOnTop: true,
        covers: [],
      };
    case 'filmUp': {
      const f = move(0, -1, e);
      const s = 0.9 * tri(p);
      f.covers = [
        { kind: 'solid', color: '#000000', alpha: s, rect: [0, 0, 0.07, 1] },
        { kind: 'solid', color: '#000000', alpha: s, rect: [0.93, 0, 0.07, 1] },
      ];
      return f;
    }
    case 'filmLeft': {
      const f = move(-1, 0, e);
      const s = 0.9 * tri(p);
      f.covers = [
        { kind: 'solid', color: '#000000', alpha: s, rect: [0, 0, 1, 0.07] },
        { kind: 'solid', color: '#000000', alpha: s, rect: [0, 0.93, 1, 0.07] },
      ];
      return f;
    }
    case 'grid4':
      return { a: idle(), b: { ...idle(), clip: grid(2, GRID4, p) }, bOnTop: true, covers: [] };
    case 'grid9':
      return { a: idle(), b: { ...idle(), clip: grid(3, GRID9, p) }, bOnTop: true, covers: [] };
    case 'glitch1':
    case 'glitch2':
    case 'glitch3': {
      const lvl = kind === 'glitch1' ? 1 : kind === 'glitch2' ? 1.8 : 2.6;
      const s = tri(p);
      const step = Math.floor(p * 20); // 抖動的格數：每 1/20 的進度換一個隨機值
      const jx = (rnd(step + 1) - 0.5) * 0.08 * lvl * s;
      const base = cut(p);
      const strips = Math.round(2 + lvl * 1.5);
      const covers: Cover[] = [];
      for (let k = 0; k < strips; k++) {
        const y = rnd(step * 7 + k * 3 + 2);
        const h = 0.01 + rnd(step * 5 + k) * 0.04;
        covers.push({
          kind: 'solid',
          color: k % 2 === 0 ? '#00e5ff' : '#ff2bd6',
          alpha: 0.5 * s * (0.5 + rnd(step + k)),
          rect: [0, y, 1, h],
        });
      }
      return {
        a: { ...base.a, dx: jx, scale: 1 + (kind === 'glitch3' ? 0.04 * s * rnd(step + 9) : 0) },
        b: { ...base.b, dx: -jx, scale: 1 + (kind === 'glitch3' ? 0.04 * s * rnd(step + 5) : 0) },
        bOnTop: true,
        covers,
      };
    }
  }
}

/** 把轉場套到一個圖層的方框（畫面像素）：位移、以畫面中心放大 */
export function applyLook<T extends { cx: number; cy: number; w: number; h: number }>(
  box: T,
  look: Look,
  W: number,
  H: number,
): T {
  const k = look.scale;
  return {
    ...box,
    cx: W / 2 + (box.cx - W / 2) * k + look.dx * W,
    cy: H / 2 + (box.cy - H / 2) * k + look.dy * H,
    w: box.w * k,
    h: box.h * k,
  };
}

/** 裁切範圍換成畫面像素 */
export function clipPx(
  c: ClipFrac,
  W: number,
  H: number,
): { rects?: [number, number, number, number][]; circle?: { cx: number; cy: number; r: number } } {
  return c.kind === 'rects'
    ? {
        rects: c.rects.map(
          ([x, y, w, h]) => [x * W, y * H, w * W, h * H] as [number, number, number, number],
        ),
      }
    : { circle: { cx: c.cx * W, cy: c.cy * H, r: c.r * Math.max(W, H) } };
}

// ---------- 轉場期間：A、B 兩段各自要畫的物件（含延長／提前的虛擬物件） ----------

export type ActiveTransition = {
  kind: TransitionKind;
  p: number;
  /** 這一刻要畫的 A、B（可能是延長／提前過的虛擬物件，id 跟原本的一樣；B 還沒開始時是 null） */
  a: VideoItem | null;
  b: VideoItem | null;
  frame: TransitionFrame;
};

/**
 * 這個時間點、這一軌有沒有轉場正在進行；有的話回傳 A、B 要怎麼畫。
 * 後半（接縫之後）真正在播的是 B，A 是延長出來的虛擬物件（靜音）；前半反過來（B 是提前的虛擬物件，靜音）。
 */
export function activeTransition(items: Item[], t: number): ActiveTransition | null {
  for (const it of items) {
    if (it.type === 'text' || it.type === 'audio' || !it.transitionIn) continue;
    const span = transitionSpan(items, it);
    if (!span) continue;
    const p = transitionProgress(span, t);
    if (p === null) continue;
    const h = span.d / 2;
    const A = span.prev;
    const B = it;
    const second = t >= span.cut;
    let a: VideoItem | null = A;
    let b: VideoItem | null = B;
    if (second) {
      // A 延長到接縫後 h 秒（素材不夠長時，播放元件會停在最後一格）
      a = { ...A, duration: A.duration + h, volume: 0, fadeIn: undefined, fadeOut: undefined };
    } else {
      // B 提前 h 秒開始：入點往前退（退不到的部分，B 還沒出現）
      const back = Math.min(h * B.speed, B.trimIn);
      const early = {
        ...B,
        start: B.start - back / B.speed,
        trimIn: B.trimIn - back,
        duration: B.duration + back / B.speed,
        volume: 0,
        fadeIn: undefined,
        fadeOut: undefined,
      };
      b = t >= early.start ? early : null;
    }
    return { kind: B.transitionIn!.kind, p, a, b, frame: transitionFrame(B.transitionIn!.kind, p) };
  }
  return null;
}

/** 這個時間點，轉場期間要畫的影片物件（匯出用：預先備好這些物件的畫面）；每一軌最多 A、B 兩個 */
export function transitionItemsAt(items: Item[], t: number): VideoItem[] {
  const at = activeTransition(items, t);
  if (!at) return [];
  return [at.a, at.b].filter((x): x is VideoItem => !!x);
}
