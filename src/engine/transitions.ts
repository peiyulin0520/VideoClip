import type { EffectKind, Item, TransitionKind, VideoItem } from '../model/types';

// 轉場（兩個緊接的片段 A、B 之間）。效果以「接縫」為中心的一小段時間（duration 秒）：
// 前半 A 還在、B 提前出現；後半 B 在、A 延長（用素材在出點之後／入點之前的畫面，沒有就停在邊緣那一格），
// 所以兩段真的重疊，才做得出疊化、捲簾、分割這類需要兩段同時出現的效果。時間軸上的片段長度、位置都不變。
// 每種轉場是一個純函式 transitionFrame(kind, p) → 這一刻 A、B 各自怎麼畫（位移、縮放、透明度、裁切範圍、模糊）
// ＋要蓋的顏色層；預覽、匯出、選單上的 A→B 小動畫都用它。

export type TransitionCat = '基本' | '相機動作' | '特效' | '故障';
export type TransitionDef = { id: TransitionKind; name: string; code: string; cat: TransitionCat };

export const TRANSITIONS: TransitionDef[] = [
  { id: 'dissolve', name: '疊化', code: '溶', cat: '基本' },
  { id: 'blackflash', name: '閃黑', code: '閃', cat: '基本' },
  { id: 'whiteflash', name: '閃白', code: '閃', cat: '基本' },
  { id: 'overexpose', name: '過曝', code: '閃', cat: '基本' },
  { id: 'zoomDissolve', name: '放大疊化', code: '溶', cat: '基本' },
  { id: 'moveL', name: '左移', code: '左', cat: '基本' },
  { id: 'moveR', name: '右移', code: '右', cat: '基本' },
  { id: 'moveU', name: '上移', code: '上', cat: '基本' },
  { id: 'moveD', name: '下移', code: '下', cat: '基本' },
  { id: 'rollDown', name: '捲簾放下', code: '下', cat: '基本' },
  { id: 'rollUp', name: '捲簾收合', code: '上', cat: '基本' },
  { id: 'circleOut', name: '中心擴散', code: '擴', cat: '基本' },
  { id: 'topOut', name: '上部擴散', code: '擴', cat: '基本' },
  { id: 'bottomOut', name: '下部擴散', code: '擴', cat: '基本' },
  { id: 'blur', name: '模糊轉場', code: '溶', cat: '基本' },
  { id: 'defocus', name: '虛焦轉場', code: '溶', cat: '基本' },
  { id: 'fastL', name: '極速左移', code: '左', cat: '相機動作' },
  { id: 'fastR', name: '極速右移', code: '右', cat: '相機動作' },
  { id: 'slideL', name: '向左滑動', code: '左', cat: '相機動作' },
  { id: 'slideR', name: '向右滑動', code: '右', cat: '相機動作' },
  { id: 'slideU', name: '向上滑動', code: '上', cat: '相機動作' },
  { id: 'slideD', name: '向下滑動', code: '下', cat: '相機動作' },
  { id: 'zoomIn', name: '縮放進', code: '縮', cat: '相機動作' },
  { id: 'zoomOut', name: '縮放出', code: '縮', cat: '相機動作' },
  { id: 'flash', name: '暖色閃光', code: '閃', cat: '特效' },
  { id: 'filmUp', name: '膠片上移', code: '上', cat: '特效' },
  { id: 'filmLeft', name: '膠片左移', code: '左', cat: '特效' },
  { id: 'grid4', name: '四宮格', code: '格', cat: '特效' },
  { id: 'grid9', name: '九宮格', code: '格', cat: '特效' },
  { id: 'glitch1', name: '干擾', code: '亂', cat: '故障' },
  { id: 'glitch2', name: '故障 1', code: '亂', cat: '故障' },
  { id: 'glitch3', name: '故障 2', code: '亂', cat: '故障' },
];
export const TRANSITION_CATS: TransitionCat[] = ['基本', '相機動作', '特效', '故障'];
export const DEFAULT_TRANSITION_DURATION = 0.5;
export const DEFAULT_EFFECT_DURATION = 0.8;
export const MIN_EFFECT = 0.2;
export const MIN_TRANSITION = 0.2;
export const MAX_TRANSITION = 2;
export const TYPEWRITER_CODE = '打';
/** 代表字：表示這個特效是哪一種「類型」（不同特效可以同一個字），時間軸上用它辨識 */
export const transitionCode = (k: EffectKind): string =>
  k === 'typewriter' ? TYPEWRITER_CODE : (TRANSITIONS.find((x) => x.id === k)?.code ?? '轉');
export const transitionName = (k: EffectKind): string =>
  k === 'typewriter' ? '打字' : (TRANSITIONS.find((x) => x.id === k)?.name ?? '轉場');

/** 舊版（2026-11-13 之前）的轉場名稱 → 新名稱 */
export const LEGACY_TRANSITIONS: Record<string, TransitionKind> = {
  fade: 'dissolve',
  black: 'blackflash',
  white: 'whiteflash',
  push: 'moveL',
  rise: 'moveU',
  zoom: 'zoomIn',
};

/**
 * 一個片段進場轉場的位置：接縫時間 cut；before＝佔前一個片段結尾幾秒、after＝佔這個片段開頭幾秒（d＝兩者相加），前一個片段。
 * 兩邊各自限制在兩個片段的長度內；沒有分別設定（舊資料）就對稱、各取一半。
 */
export type TransitionSpan = { cut: number; d: number; before: number; after: number; prev: Item };

const EPS = 0.03;

/** 轉場只在「同一類」之間：字卡接字卡，影像（影片、照片）、貼圖接影像、貼圖；音樂沒有轉場 */
export const sameFamily = (a: Item, b: Item): boolean =>
  a.type !== 'audio' && b.type !== 'audio' && (a.type === 'text') === (b.type === 'text');

/** 轉場的前後分配（秒）：沒有分別設定就各一半；不超過兩個片段各自的長度 */
export function splitTransition(
  tr: { duration: number; before?: number; after?: number },
  prevDur: number,
  curDur: number,
): { before: number; after: number } {
  if (tr.before === undefined && tr.after === undefined) {
    const h = Math.min(tr.duration / 2, prevDur, curDur);
    return { before: h, after: h };
  }
  return {
    before: Math.min(tr.before ?? tr.duration / 2, prevDur),
    after: Math.min(tr.after ?? tr.duration / 2, curDur),
  };
}

/** 這個片段前面緊接著另一個同類片段（同一軌，接縫誤差 30ms 內）才算有轉場 */
export function transitionSpan(items: Item[], it: Item): TransitionSpan | null {
  if (it.type === 'audio' || !it.transitionIn) return null;
  const prev = items.find(
    (x) => x !== it && sameFamily(x, it) && Math.abs(x.start + x.duration - it.start) < EPS,
  );
  if (!prev) return null;
  const { before, after } = splitTransition(it.transitionIn, prev.duration, it.duration);
  const d = before + after;
  return d > 0.05 ? { cut: it.start, d, before, after, prev } : null;
}

// ---------- 轉場時的聲音 ----------

export type TransitionAudioMode = NonNullable<NonNullable<Item['transitionIn']>['audio']>;

/** 六種轉場聲音（名稱簡短）：預設交叉淡化 */
export const TRANSITION_AUDIO: { id: TransitionAudioMode; name: string; hint: string }[] = [
  { id: 'cross', name: '交叉淡化', hint: '前一段聲音漸弱、後一段漸強，中間兩段都聽得到' },
  { id: 'cut', name: '直接切換', hint: '不淡化，在你選的那一刻直接換成後一段的聲音' },
  { id: 'custom', name: '自訂起迄', hint: '前一段標聲音迄、後一段標聲音起，中間可以沒聲音' },
  { id: 'prev', name: '只要前段', hint: '轉場期間只聽前一段，轉場結束才換後一段' },
  { id: 'next', name: '只要後段', hint: '轉場一開始就換成後一段的聲音' },
  { id: 'mute', name: '靜音', hint: '轉場期間沒有聲音' },
];

/**
 * 轉場裡前一段（a）、後一段（b）的聲音倍數（0–1）。t＝時間軸秒數。
 * 前一段在轉場開始前一定是 1、後一段在轉場結束後一定是 1（custom 的後段起點可以晚於轉場結束）。
 */
export function seamGains(
  tr: NonNullable<Item['transitionIn']>,
  span: Pick<TransitionSpan, 'cut' | 'before' | 'after' | 'd'>,
  t: number,
): { a: number; b: number } {
  const start = span.cut - span.before;
  const end = span.cut + span.after;
  switch (tr.audio ?? 'cross') {
    case 'cross': {
      const p = Math.min(Math.max((t - start) / span.d, 0), 1);
      return { a: Math.cos((p * Math.PI) / 2), b: Math.sin((p * Math.PI) / 2) };
    }
    case 'cut': {
      const at = span.cut + (tr.audioCut ?? 0);
      return t < at ? { a: 1, b: 0 } : { a: 0, b: 1 };
    }
    case 'custom':
      return {
        a: t < span.cut + (tr.audioOutA ?? 0) ? 1 : 0,
        b: t >= span.cut + (tr.audioInB ?? 0) ? 1 : 0,
      };
    case 'prev':
      return t < end ? { a: 1, b: 0 } : { a: 0, b: 1 };
    case 'next':
      return t < start ? { a: 1, b: 0 } : { a: 0, b: 1 };
    case 'mute':
      return { a: t < start ? 1 : 0, b: t >= end ? 1 : 0 };
  }
}

/** 這個片段在 t 秒因為「前後轉場」該乘上多少聲音倍數（沒有轉場＝1）。同一軌的 items 要完整給 */
export function transitionAudioGain(items: Item[], item: Item, t: number): number {
  if (item.type === 'audio' || !items.some((x) => x.transitionIn)) return 1;
  let g = 1;
  for (const b of items) {
    if (!b.transitionIn) continue;
    const span = transitionSpan(items, b);
    if (!span) continue;
    if (b.id === item.id) g *= seamGains(b.transitionIn, span, t).b;
    else if (span.prev.id === item.id) g *= seamGains(b.transitionIn, span, t).a;
  }
  return g;
}

/**
 * 轉場讓這個片段的聲音多出來／要調整音量的時間範圍：{ before＝開頭之前多放幾秒（B）, after＝結尾之後多放幾秒（A）, windows＝音量要逐格調整的時間範圍 }。
 * 匯出混音用（預覽是即時算 transitionAudioGain）。
 */
export function seamAudioExtent(
  items: Item[],
  item: Item,
): { before: number; after: number; windows: [number, number][] } {
  let before = 0;
  let after = 0;
  const windows: [number, number][] = [];
  if (item.type === 'audio') return { before, after, windows };
  for (const b of items) {
    if (!b.transitionIn) continue;
    const span = transitionSpan(items, b);
    if (!span) continue;
    const start = span.cut - span.before;
    const end = span.cut + span.after;
    if (b.id === item.id) {
      before = Math.max(before, span.before);
      windows.push([
        start,
        Math.max(end, span.cut + (b.transitionIn.audioInB ?? 0), span.cut + (b.transitionIn.audioCut ?? 0)),
      ]);
    } else if (span.prev.id === item.id) {
      after = Math.max(after, span.after);
      windows.push([start, end]);
    }
  }
  return { before, after, windows };
}

/** 一軌上緊接在一起的同類片段（接縫處）：可以在這裡加轉場 */
export function seamsOf(items: Item[]): { prev: Item; next: Item }[] {
  const vids = items.filter((x) => x.type !== 'audio' && !x.group);
  const out: { prev: Item; next: Item }[] = [];
  for (const next of vids) {
    const prev = vids.find(
      (x) => x !== next && sameFamily(x, next) && Math.abs(x.start + x.duration - next.start) < EPS,
    );
    if (prev) out.push({ prev, next });
  }
  return out;
}

/** 目前時間 t 在這個轉場的哪裡：0＝開始、0.5＝接縫、1＝結束；不在轉場裡就是 null */
export function transitionProgress(span: TransitionSpan, t: number): number | null {
  const p = (t - (span.cut - span.before)) / span.d;
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
  a: Item | null;
  b: Item | null;
  frame: TransitionFrame;
};

/** 虛擬物件不出聲（真的在播的那一個才出聲） */
const silent = (x: Item): Item =>
  x.type === 'text' ? x : { ...x, volume: 0, fadeIn: undefined, fadeOut: undefined };

/**
 * 這個時間點、這一軌有沒有轉場正在進行；有的話回傳 A、B 要怎麼畫。
 * 後半（接縫之後）真正在播的是 B，A 是延長出來的虛擬物件（靜音）；前半反過來（B 是提前的虛擬物件，靜音）。
 */
export function activeTransition(items: Item[], t: number): ActiveTransition | null {
  for (const it of items) {
    if (it.type === 'audio' || !it.transitionIn) continue;
    const span = transitionSpan(items, it);
    if (!span) continue;
    const p = transitionProgress(span, t);
    if (p === null) continue;
    const A = span.prev;
    const B = it;
    const second = t >= span.cut;
    let a: Item | null = A;
    let b: Item | null = B;
    if (second) {
      // A 延長到接縫後 after 秒（素材不夠長時，播放元件會停在最後一格）
      a = silent({ ...A, duration: A.duration + span.after });
    } else if (B.type === 'text') {
      b =
        t >= B.start - span.before
          ? { ...B, start: B.start - span.before, duration: B.duration + span.before }
          : null;
    } else {
      // B 提前 before 秒開始：入點往前退。退到素材開頭之前（入點不夠）的那一段，素材時間是負的，
      // 播放元件與匯出會停在第一格（sourceTimeClamped），所以 B 仍然從轉場開始就慢慢淡入，不會到接縫才突然跳出來
      b = silent({
        ...B,
        start: B.start - span.before,
        trimIn: B.trimIn - span.before * B.speed,
        duration: B.duration + span.before,
      });
    }
    return { kind: B.transitionIn!.kind, p, a, b, frame: transitionFrame(B.transitionIn!.kind, p) };
  }
  return null;
}

// ---------- 單一素材的進場／出場特效（這個素材自己的開頭、結尾，邊播邊動） ----------

export type ItemEffect = { role: 'in' | 'out'; kind: EffectKind; p: number; duration: number };

/** 進出場各佔幾秒：各自不超過素材長度，兩個加起來也不超過（出場讓給進場，縮到剩下的） */
export function effectDurations(it: Item): { in: number; out: number } {
  const len = it.duration;
  const din = it.inEffect ? Math.min(Math.max(it.inEffect.duration, 0), len) : 0;
  const dout = it.outEffect ? Math.min(Math.max(it.outEffect.duration, 0), Math.max(len - din, 0)) : 0;
  return { in: din, out: dout };
}

/** 素材自己的時間 local（開始後幾秒）落在進場或出場特效裡嗎；進度 p：進場 0→1（空→完整）、出場 0→1（完整→空） */
export function itemEffectAt(it: Item, local: number): ItemEffect | null {
  if (it.type === 'audio') return null;
  const d = effectDurations(it);
  if (it.inEffect && d.in > 0.01 && local < d.in)
    return { role: 'in', kind: it.inEffect.kind, p: clamp01(local / d.in), duration: d.in };
  if (it.outEffect && d.out > 0.01 && local >= it.duration - d.out)
    return {
      role: 'out',
      kind: it.outEffect.kind,
      p: clamp01((local - (it.duration - d.out)) / d.out),
      duration: d.out,
    };
  return null;
}

/** 這個 Look 結束時，素材已經「走掉」了嗎（看不見、被裁光、移出畫面） */
function isGone(l: Look): boolean {
  if (l.opacity < 0.05 || l.scale < 0.05 || Math.abs(l.dx) >= 0.65 || Math.abs(l.dy) >= 0.65) return true;
  const c = l.clip;
  if (!c) return false;
  if (c.kind === 'circle') return c.r <= 0.001;
  return c.rects.every(([, , w, h]) => w * h <= 1e-6);
}
/**
 * 進出場特效這一刻的樣子（單一素材：前面或後面是「空」）。
 * 進場：轉場裡 B 一開始看不到的（捲簾放下、擴散、左移…），直接用 B 的動作；B 一開始就看得到（疊化、放大疊化…）
 * 就改用 A 的動作倒著放（A 會離開，倒著放就是進來）；兩個都不行就用 B 的動作加上淡入。
 * 出場：對稱——A 會自己離開的直接用 A；不會的（疊化、捲簾放下…）把 B 的進場倒著放；再不行用 A 加淡出。
 * 「打字」不是轉場，畫面不變（字數另外算）。
 */
export function effectFrame(fx: ItemEffect): { look: Look; covers: Cover[] } {
  if (fx.kind === 'typewriter') return { look: idle(), covers: [] };
  const k = fx.kind;
  const f = transitionFrame(k, fx.p);
  const r = transitionFrame(k, 1 - fx.p);
  const bGone0 = isGone(transitionFrame(k, 0).b); // B 一開始看不到
  const aGone1 = isGone(transitionFrame(k, 1).a); // A 最後走掉
  if (fx.role === 'in') {
    if (bGone0) return { look: f.b, covers: f.covers };
    if (aGone1) return { look: r.a, covers: r.covers };
    return { look: { ...f.b, opacity: f.b.opacity * fx.p }, covers: f.covers };
  }
  if (aGone1) return { look: f.a, covers: f.covers };
  if (bGone0) return { look: r.b, covers: r.covers };
  return { look: { ...f.a, opacity: f.a.opacity * (1 - fx.p) }, covers: f.covers };
}

/** 這個時間點，轉場期間要畫的影片物件（匯出用：預先備好這些物件的畫面）；每一軌最多 A、B 兩個 */
export function transitionItemsAt(items: Item[], t: number): VideoItem[] {
  const at = activeTransition(items, t);
  if (!at) return [];
  return [at.a, at.b].filter((x): x is VideoItem => !!x && x.type !== 'text');
}
