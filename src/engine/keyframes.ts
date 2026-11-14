import type { Adjust, Item, Keyframe, Project, Transform } from '../model/types';
import { ADJUST_KEYS, effectiveFull, fullAdjust, isNeutral as isZeroAdjust, ZERO_ADJUST } from './grade';
import { transformAbout } from './groupTransform';

export { ADJUST_KEYS, fullAdjust, ZERO_ADJUST };

// 定位（關鍵影格）：位置、大小、旋轉、透明度、色調，兩個定位之間線性漸變。
// 所有「這個時間點物件長什麼樣」的地方（預覽、單格輸出、整支匯出、選取框）都走 withTime / timeResolved。

/** 同一個時間（±1/60 秒）的定位視為同一個 */
export const KEYFRAME_EPS = 1 / 60;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export const hasKeyframes = (it: Item): boolean => (it.keyframes?.length ?? 0) > 0;

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

/** 有任何定位自己指定了色調組合（含 null＝原色）嗎：有的話調色走「實際調色值內插」 */
export const usesKeyframeLook = (it: Item): boolean => !!it.keyframes?.some((k) => k.look !== undefined);

/** 一個定位的實際調色值（完整 11 項）＝（定位的色調組合，沒寫用物件的）×強度＋（定位的手動調整，沒寫的項目用物件的） */
function keyframeEffective(item: Item, k: Keyframe): Adjust {
  return effectiveFull(k.look === undefined ? item.look : k.look, {
    ...fullAdjust(item.adjust),
    ...k.adjust,
  });
}

/**
 * 這個時間的「手動調整」（完整 11 項，不含色調組合）；全部是 0 就是 undefined。
 * 色調面板的滑桿顯示的是這個。
 */
export function manualAdjustAt(item: Item, t: number): Adjust | undefined {
  const base = fullAdjust(item.adjust);
  const kfs = item.keyframes;
  if (!kfs || kfs.length === 0 || kfs.every((x) => !x.adjust)) return isZeroAdjust(base) ? undefined : base;
  const { a, b, k } = around(kfs, t - item.start);
  const out = { ...ZERO_ADJUST };
  for (const key of ADJUST_KEYS)
    out[key] = lerp(a.adjust?.[key] ?? base[key], b.adjust?.[key] ?? base[key], k);
  return isZeroAdjust(out) ? undefined : out;
}

/**
 * 這個時間要送進濾鏡的色調（完整 11 項）；全部是 0 就是 undefined（合成器不用加濾鏡）。
 * 沒有定位指定色調組合：只有手動調整的內插（物件本身的色調組合由 scene 再加上去）。
 * 有定位指定色調組合：兩邊定位的「實際調色值」逐項內插（已經包含色調組合，withTime 會把 look 清掉）。
 */
export function adjustAt(item: Item, t: number): Adjust | undefined {
  const kfs = item.keyframes;
  if (!kfs || kfs.length === 0 || !usesKeyframeLook(item)) return manualAdjustAt(item, t);
  const { a, b, k } = around(kfs, t - item.start);
  const ea = keyframeEffective(item, a);
  const eb = a === b ? ea : keyframeEffective(item, b);
  const out = { ...ZERO_ADJUST };
  for (const key of ADJUST_KEYS) out[key] = lerp(ea[key], eb[key], k);
  return isZeroAdjust(out) ? undefined : out;
}

/** 這個時間的物件（transform、色調換成內插後的值）；沒有定位時原樣回傳 */
export function withTime<T extends Item>(item: T, t: number): T {
  if (!hasKeyframes(item)) return item;
  const adj = adjustAt(item, t);
  const out = { ...item, transform: transformAt(item, t), adjust: adj };
  if (usesKeyframeLook(item)) out.look = undefined; // 色調組合已經算進 adjust
  return out;
}

/**
 * 整個專案換成「這個時間」的樣子（沒有任何定位就原樣回傳，不複製）。
 * 版型：定位打在外框上＝整組一起動——外框換成這個時間的位置，各格用「從外框原本的位置到這個時間的位置」的相對變化跟著動。
 */
export function timeResolved(project: Project, t: number): Project {
  if (!project.tracks.some((tr) => tr.items.some(hasKeyframes))) return project;
  const frames = new Map<string, { base: Transform; now: Transform; adj?: Adjust; clearLook: boolean }>();
  for (const tr of project.tracks)
    for (const it of tr.items)
      if (it.type !== 'text' && it.type !== 'audio' && it.group && hasKeyframes(it) && !it.cell)
        frames.set(it.group, {
          base: it.transform,
          now: transformAt(it, t),
          adj: adjustAt(it, t),
          clearLook: usesKeyframeLook(it),
        });
  const W = project.width;
  const H = project.height;
  const resolve = (it: Item): Item => {
    const g = it.type !== 'audio' ? it.group : undefined;
    const f = g ? frames.get(g) : undefined;
    if (f && !hasKeyframes(it))
      return {
        ...it,
        transform: { ...transformAbout(it.transform, f.base, f.now, W, H), opacity: f.now.opacity },
        adjust: f.adj,
        ...(f.clearLook ? { look: undefined } : {}),
      };
    return withTime(it, t);
  };
  const touched = (it: Item) =>
    hasKeyframes(it) || (it.type !== 'audio' && !!it.group && frames.has(it.group));
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

/** 播放線碰到的定位（菱形）：local 秒前後 tolSec 內最近的那個，回傳第幾個；沒有 -1 */
export function keyframeNear(item: Item, local: number, tolSec: number): number {
  let best = -1;
  let bestD = Infinity;
  (item.keyframes ?? []).forEach((k, i) => {
    const d = Math.abs(k.t - local);
    if (d <= Math.max(tolSec, KEYFRAME_EPS) && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

export type KeyframeValues = Partial<Omit<Keyframe, 't' | 'adjust'>> & { adjust?: Partial<Adjust> };

/**
 * 在物件開始後 local 秒新增或更新一個定位：同一時間（±1/60 秒）就更新、不然插入並排序。
 * 新增的定位先用「這一刻的內插值」當底，再蓋上 values；已經有色調定位時，新增的也補上這一刻的色調（不會打斷漸變）。
 * 如果有定位指定了色調組合：新增的定位把這一刻的「實際調色值」直接存進 adjust、look 設成 null（不再加一次組合）。
 */
export function upsertKeyframe(item: Item, local: number, values: KeyframeValues): Keyframe[] {
  const kfs = (item.keyframes ?? []).map((k) => ({ ...k, adjust: k.adjust ? { ...k.adjust } : undefined }));
  const i = keyframeIndexAt(item, local);
  if (i >= 0) {
    const cur = kfs[i]!;
    const { adjust, ...rest } = values;
    Object.assign(cur, rest);
    if (adjust) cur.adjust = { ...cur.adjust, ...adjust };
    if (!cur.adjust) delete cur.adjust;
    return kfs;
  }
  const now = transformAt(item, item.start + local);
  const { adjust: vAdjust, look: vLook, ...vRest } = values;
  const kf: Keyframe = { t: Math.max(local, 0), ...now, ...vRest };
  const baked = usesKeyframeLook(item);
  const hadAdjust = kfs.some((k) => k.adjust) || !!vAdjust;
  if (baked) {
    // 這一刻的實際調色值（含兩邊定位的色調組合）存進 adjust；要設定新色調組合時，底是手動調整
    if (vLook !== undefined) {
      kf.look = vLook;
      kf.adjust = { ...(manualAdjustAt(item, item.start + local) ?? {}), ...vAdjust };
    } else {
      kf.look = null;
      kf.adjust = { ...(adjustAt(item, item.start + local) ?? {}), ...vAdjust };
    }
  } else {
    if (vLook !== undefined) kf.look = vLook;
    if (hadAdjust)
      kf.adjust = { ...(manualAdjustAt(item, item.start + local) ?? fullAdjust(item.adjust)), ...vAdjust };
  }
  if (!kf.adjust || Object.keys(kf.adjust).length === 0) delete kf.adjust;
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
  const baked = usesKeyframeLook(item);
  const mid: Keyframe = {
    t: local,
    ...at.transform,
    adjust: baked || kfs.some((k) => k.adjust) ? fullAdjust(at.adjust) : undefined,
    ...(baked ? { look: null } : {}),
  };
  if (!mid.adjust) delete mid.adjust;
  const a = [...kfs.filter((k) => k.t < local - KEYFRAME_EPS), mid];
  const b = [
    { ...mid, t: 0 },
    ...kfs.filter((k) => k.t > local + KEYFRAME_EPS).map((k) => ({ ...k, t: k.t - local })),
  ];
  return { a, b };
}
