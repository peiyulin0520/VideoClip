import type { Item, TransitionKind, VideoItem } from '../model/types';

// 轉場（兩個緊接的片段之間）。不需要前一個片段多出來的素材：效果以「接縫」為中心的一小段時間（duration 秒），
// 前一半在前一個片段、後一半在後一個片段，用蓋一層顏色（淡入淡出、黑場、白閃、暖光）或移動／縮放畫面（推、升、縮）做出來。

export const TRANSITIONS: { id: TransitionKind; name: string; code: string }[] = [
  { id: 'fade', name: '淡入淡出', code: '淡' },
  { id: 'black', name: '黑場', code: '黑' },
  { id: 'white', name: '白閃', code: '白' },
  { id: 'flash', name: '暖色閃光', code: '閃' },
  { id: 'push', name: '左推', code: '推' },
  { id: 'rise', name: '上推', code: '升' },
  { id: 'zoom', name: '縮放', code: '縮' },
];
export const TRANSITION_DURATIONS = [0.3, 0.5, 0.8, 1.2];
export const DEFAULT_TRANSITION_DURATION = 0.5;
export const transitionCode = (k: TransitionKind): string => TRANSITIONS.find((x) => x.id === k)!.code;
export const transitionName = (k: TransitionKind): string => TRANSITIONS.find((x) => x.id === k)!.name;

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

export type TransitionLook = {
  /** 前一個片段（p<0.5）或後一個片段（p≥0.5）的偏移（佔畫面寬、高的比例）、放大倍數、透明度 */
  dx: number;
  dy: number;
  scale: number;
  opacity: number;
  /** 蓋在最上面的一層：顏色、透明度（0–1）；沒有就是 null */
  cover: { kind: 'solid' | 'flash'; color: string; alpha: number } | null;
};

const tri = (p: number) => Math.sin(Math.PI * p); // 0 → 1 → 0，接縫處最大

/** p＝轉場進度 0–1；回傳「這一刻畫面上的片段」該怎麼畫（p<0.5 是前一個片段，之後是後一個片段） */
export function transitionLook(kind: TransitionKind, p: number): TransitionLook {
  const first = p < 0.5;
  const u = first ? p * 2 : (p - 0.5) * 2; // 這一半的進度 0–1
  const base: TransitionLook = { dx: 0, dy: 0, scale: 1, opacity: 1, cover: null };
  switch (kind) {
    case 'fade':
      return { ...base, cover: { kind: 'solid', color: '#000000', alpha: tri(p) } };
    case 'black':
      return { ...base, cover: { kind: 'solid', color: '#000000', alpha: Math.min(1, tri(p) * 2.4) } };
    case 'white':
      return {
        ...base,
        cover: { kind: 'solid', color: '#ffffff', alpha: Math.min(1, tri(p) ** 1.5 * 1.15) },
      };
    case 'flash':
      return { ...base, cover: { kind: 'flash', color: '#ffb457', alpha: Math.min(1, tri(p) ** 1.3 * 1.1) } };
    case 'push': // 前一個往左滑出去，後一個從右邊滑進來
      return { ...base, dx: first ? -u : 1 - u };
    case 'rise': // 前一個往上滑出去，後一個從下面升上來
      return { ...base, dy: first ? -u : 1 - u };
    case 'zoom': // 前一個放大並淡出，後一個從放大縮回來並淡入
      return first
        ? { ...base, scale: 1 + 0.6 * u, opacity: 1 - u }
        : { ...base, scale: 1 + 0.6 * (1 - u), opacity: u };
  }
}

/** 把轉場套到一個圖層的方框（畫面像素）：位移、以畫面中心為準放大、透明度相乘 */
export function applyLook<T extends { cx: number; cy: number; w: number; h: number }>(
  box: T,
  look: TransitionLook,
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
