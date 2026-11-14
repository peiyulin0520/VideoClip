import type { Adjust, Item, Keyframe, Project, Transform } from '../model/types';
import { transformAbout } from './groupTransform';

// 定位（關鍵影格）：位置、大小、旋轉、透明度、色調，兩個定位之間線性漸變。
// 所有「這個時間點物件長什麼樣」的地方（預覽、單格輸出、整支匯出、選取框）都走 withTime / timeResolved。

export const ZERO_ADJUST: Adjust = { brightness: 0, saturation: 0, temperature: 0, tint: 0 };
export const ADJUST_KEYS = ['brightness', 'saturation', 'temperature', 'tint'] as const;
/** 同一個時間（±1/60 秒）的定位視為同一個 */
export const KEYFRAME_EPS = 1 / 60;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export const hasKeyframes = (it: Item): boolean => (it.keyframes?.length ?? 0) > 0;

/** 物件本身的色調補成完整的四項 */
export const fullAdjust = (a?: Partial<Adjust>): Adjust => ({ ...ZERO_ADJUST, ...a });
export const isZeroAdjust = (a?: Partial<Adjust>): boolean => !a || ADJUST_KEYS.every((k) => !a[k]);

/** 找「前一個、後一個」定位與兩者之間的比例 */
function around(kfs: Keyframe[], local: number): { a: Keyframe; b: Keyframe; k: number } {
  if (local <= kfs[0]!.t) return { a: kfs[0]!, b: kfs[0]!, k: 0 };
  const last = kfs[kfs.length - 1]!;
  if (local >= last.t) return { a: last, b: last, k: 0 };
  let i = 0;
  while (i < kfs.length - 2 && local >= kfs[i + 1]!.t) i++;
  const a = kfs[i]!;
  const b = kfs[i + 1]!;
  return { a, b, k: b.t - a.t > 1e-9 ? (local - a.t) / (b.t - a.t) : 0 };
}

/** 這個時間（專案秒）的 transform：沒有定位＝物件本身的；有＝依前後定位線性內插 */
export function transformAt(item: Item, t: number): Transform {
  const kfs = item.keyframes;
  if (!kfs || kfs.length === 0) return item.transform;
  const { a, b, k } = around(kfs, t - item.start);
  return {
    x: lerp(a.x, b.x, k),
    y: lerp(a.y, b.y, k),
    scale: lerp(a.scale, b.scale, k),
    rotation: lerp(a.rotation, b.rotation, k),
    opacity: lerp(a.opacity, b.opacity, k),
  };
}

/** 這個時間的色調（完整四項）；全部是 0 就是 undefined（合成器不用加濾鏡） */
export function adjustAt(item: Item, t: number): Adjust | undefined {
  const base = fullAdjust(item.adjust);
  const kfs = item.keyframes;
  if (!kfs || kfs.length === 0 || kfs.every((x) => !x.adjust)) return isZeroAdjust(base) ? undefined : base;
  const { a, b, k } = around(kfs, t - item.start);
  const out = { ...ZERO_ADJUST };
  for (const key of ADJUST_KEYS)
    out[key] = lerp(a.adjust?.[key] ?? base[key], b.adjust?.[key] ?? base[key], k);
  return isZeroAdjust(out) ? undefined : out;
}

/** 這個時間的物件（transform、色調換成內插後的值）；沒有定位也沒有色調時原樣回傳 */
export function withTime<T extends Item>(item: T, t: number): T {
  if (!hasKeyframes(item)) return item;
  const adj = adjustAt(item, t);
  return { ...item, transform: transformAt(item, t), adjust: adj };
}

/**
 * 整個專案換成「這個時間」的樣子（沒有任何定位就原樣回傳，不複製）。
 * 版型：定位打在外框上＝整組一起動——外框換成這個時間的位置，各格用「從外框原本的位置到這個時間的位置」的相對變化跟著動。
 */
export function timeResolved(project: Project, t: number): Project {
  if (!project.tracks.some((tr) => tr.items.some(hasKeyframes))) return project;
  const frames = new Map<string, { base: Transform; now: Transform; adj?: Adjust }>();
  for (const tr of project.tracks)
    for (const it of tr.items)
      if (it.type !== 'text' && it.type !== 'audio' && it.group && hasKeyframes(it) && !it.cell)
        frames.set(it.group, { base: it.transform, now: transformAt(it, t), adj: adjustAt(it, t) });
  const W = project.width;
  const H = project.height;
  const resolve = (it: Item): Item => {
    const g = it.type !== 'text' && it.type !== 'audio' ? it.group : undefined;
    const f = g ? frames.get(g) : undefined;
    if (f && !hasKeyframes(it))
      return {
        ...it,
        transform: { ...transformAbout(it.transform, f.base, f.now, W, H), opacity: f.now.opacity },
        adjust: f.adj,
      };
    return withTime(it, t);
  };
  const touched = (it: Item) =>
    hasKeyframes(it) || (it.type !== 'text' && it.type !== 'audio' && !!it.group && frames.has(it.group));
  return {
    ...project,
    tracks: project.tracks.map((tr) =>
      tr.items.some(touched) ? { ...tr, items: tr.items.map((it) => (touched(it) ? resolve(it) : it)) } : tr,
    ),
  };
}

/** 物件開始後 local 秒有沒有定位（±1/60 秒）；回傳第幾個，沒有 -1 */
export function keyframeIndexAt(item: Item, local: number): number {
  return (item.keyframes ?? []).findIndex((k) => Math.abs(k.t - local) <= KEYFRAME_EPS);
}

export type KeyframeValues = Partial<Omit<Keyframe, 't' | 'adjust'>> & { adjust?: Partial<Adjust> };

/**
 * 在物件開始後 local 秒新增或更新一個定位：同一時間（±1/60 秒）就更新、不然插入並排序。
 * 新增的定位先用「這一刻的內插值」當底，再蓋上 values；已經有色調定位時，新增的也補上這一刻的色調（不會打斷漸變）。
 */
export function upsertKeyframe(item: Item, local: number, values: KeyframeValues): Keyframe[] {
  const kfs = (item.keyframes ?? []).map((k) => ({ ...k, adjust: k.adjust ? { ...k.adjust } : undefined }));
  const i = keyframeIndexAt(item, local);
  if (i >= 0) {
    const cur = kfs[i]!;
    const { adjust, ...rest } = values;
    Object.assign(cur, rest);
    if (adjust) cur.adjust = { ...cur.adjust, ...adjust };
    return kfs;
  }
  const now = transformAt(item, item.start + local);
  const kf: Keyframe = { t: Math.max(local, 0), ...now, ...values, adjust: undefined };
  const hadAdjust = kfs.some((k) => k.adjust) || !!values.adjust;
  if (hadAdjust)
    kf.adjust = { ...(adjustAt(item, item.start + local) ?? fullAdjust(item.adjust)), ...values.adjust };
  if (!kf.adjust) delete kf.adjust;
  return [...kfs, kf].sort((a, b) => a.t - b.t);
}

export function removeKeyframe(item: Item, index: number): Keyframe[] {
  return (item.keyframes ?? []).filter((_, i) => i !== index);
}

/** 頭端被修剪（片段開始時間往後 delta 秒、內容不動）：定位的時間跟著往前挪 */
export function shiftKeyframes(kfs: Keyframe[] | undefined, delta: number): Keyframe[] | undefined {
  return kfs && kfs.length > 0 ? kfs.map((k) => ({ ...k, t: k.t - delta })) : kfs;
}

/** 在 local 秒切成兩段：前段留 t<local 的、後段時間平移；切點兩邊各補一個內插值（兩段看起來接得起來） */
export function splitKeyframes(
  item: Item,
  local: number,
): { a: Keyframe[] | undefined; b: Keyframe[] | undefined } {
  const kfs = item.keyframes;
  if (!kfs || kfs.length === 0) return { a: undefined, b: undefined };
  const at = withTime(item, item.start + local);
  const mid: Keyframe = {
    t: local,
    ...at.transform,
    adjust: kfs.some((k) => k.adjust) ? fullAdjust(at.adjust) : undefined,
  };
  if (!mid.adjust) delete mid.adjust;
  const a = [...kfs.filter((k) => k.t < local - KEYFRAME_EPS), mid];
  const b = [
    { ...mid, t: 0 },
    ...kfs.filter((k) => k.t > local + KEYFRAME_EPS).map((k) => ({ ...k, t: k.t - local })),
  ];
  return { a, b };
}

/**
 * 色調 → Pixi ColorMatrixFilter 的 4×5 矩陣（20 個數）：亮度（乘）、飽和度、色溫（紅藍一增一減）、色調（綠↔洋紅）。
 * 全部是 0 回傳 null（不用加濾鏡）。
 */
export function adjustMatrix(a: Partial<Adjust> | undefined): number[] | null {
  if (isZeroAdjust(a)) return null;
  const { brightness: b, saturation: s, temperature: tmp, tint } = fullAdjust(a);
  // 飽和度：向亮度（灰）靠攏或遠離
  const sat = 1 + s;
  const lr = 0.2126;
  const lg = 0.7152;
  const lb = 0.0722;
  const S = [
    lr * (1 - sat) + sat,
    lg * (1 - sat),
    lb * (1 - sat),
    lr * (1 - sat),
    lg * (1 - sat) + sat,
    lb * (1 - sat),
    lr * (1 - sat),
    lg * (1 - sat),
    lb * (1 - sat) + sat,
  ];
  // 亮度、色溫、色調都是對 R、G、B 各乘一個倍數
  const kr = (1 + b) * (1 + 0.3 * tmp) * (1 + 0.12 * tint);
  const kg = (1 + b) * (1 - 0.18 * tint);
  const kb = (1 + b) * (1 - 0.3 * tmp) * (1 + 0.12 * tint);
  const m = [
    S[0]! * kr,
    S[1]! * kr,
    S[2]! * kr,
    0,
    0,
    S[3]! * kg,
    S[4]! * kg,
    S[5]! * kg,
    0,
    0,
    S[6]! * kb,
    S[7]! * kb,
    S[8]! * kb,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ];
  return m;
}
