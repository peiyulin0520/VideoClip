import type { Adjust, Item } from '../model/types';

// 調色：11 項調整＋色調組合（預設）。這個檔案是「參考實作」——跟著色器（gradeFilter.ts）一模一樣的算式（JS 版），
// 用途：單元測試、色調組合卡片的縮圖（CPU 對小縮圖算一次）。改算式時兩邊要一起改。
// 全部在 0～1 的 RGB 上算、最後夾住；不做 sRGB↔線性轉換（手機效能與一致性優先），曝光用近似。

export const ADJUST_KEYS = [
  'exposure',
  'contrast',
  'highlights',
  'shadows',
  'blacks',
  'brightness',
  'saturation',
  'vibrance',
  'temperature',
  'tint',
  'fade',
] as const;
export type AdjustKey = (typeof ADJUST_KEYS)[number];

export const ZERO_ADJUST: Adjust = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  blacks: 0,
  brightness: 0,
  saturation: 0,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  fade: 0,
};

/** 滑桿上顯示的名稱與範圍（fade 只有 0～1） */
export const ADJUST_LABELS: Record<AdjustKey, { label: string; min: number }> = {
  exposure: { label: '曝光', min: -1 },
  contrast: { label: '對比', min: -1 },
  highlights: { label: '高光', min: -1 },
  shadows: { label: '陰影', min: -1 },
  blacks: { label: '黑點', min: -1 },
  brightness: { label: '亮度', min: -1 },
  saturation: { label: '飽和度', min: -1 },
  vibrance: { label: '鮮艷度', min: -1 },
  temperature: { label: '色溫', min: -1 },
  tint: { label: '色調', min: -1 },
  fade: { label: '褪色', min: 0 },
};

/** 補成完整的 11 項（沒寫的是 0） */
export const fullAdjust = (a?: Partial<Adjust>): Adjust => ({ ...ZERO_ADJUST, ...a });
/** 全部都是 0（或沒有）＝不用調色、不用加濾鏡 */
export const isNeutral = (a?: Partial<Adjust>): boolean => !a || ADJUST_KEYS.every((k) => !a[k]);

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** 一個顏色（0～1）調完色之後的顏色；順序：曝光、色溫、色調、對比、高光、陰影、黑點、亮度、飽和度、鮮艷度、褪色 */
export function gradeRGB(rgb: [number, number, number], adj?: Partial<Adjust>): [number, number, number] {
  if (isNeutral(adj)) return rgb;
  const a = fullAdjust(adj);
  let [r, g, b] = rgb;
  // 曝光：±2 格光圈
  const ex = 2 ** (a.exposure * 2);
  r *= ex;
  g *= ex;
  b *= ex;
  // 色溫（冷↔暖）、色調（綠↔洋紅）
  r *= (1 + 0.3 * a.temperature) * (1 + 0.12 * a.tint);
  g *= 1 - 0.18 * a.tint;
  b *= (1 - 0.3 * a.temperature) * (1 + 0.12 * a.tint);
  r = clamp01(r);
  g = clamp01(g);
  b = clamp01(b);
  // 對比：以中灰為軸
  const ck = a.contrast >= 0 ? 1 + a.contrast : Math.max(1 + a.contrast, 0.2);
  r = clamp01((r - 0.5) * ck + 0.5);
  g = clamp01((g - 0.5) * ck + 0.5);
  b = clamp01((b - 0.5) * ck + 0.5);
  // 高光、陰影：只動亮部／暗部
  const y = luma(r, g, b);
  const wH = smoothstep(0.5, 1.0, y);
  const wS = 1 - smoothstep(0.0, 0.5, y);
  const hl = (x: number) => x + a.highlights * 0.35 * wH * (a.highlights < 0 ? x : 1 - x);
  const sh = (x: number) => x + a.shadows * 0.35 * wS * (a.shadows < 0 ? x : 1 - x);
  r = clamp01(sh(hl(r)));
  g = clamp01(sh(hl(g)));
  b = clamp01(sh(hl(b)));
  // 黑點：正＝黑色變灰（霧面）、負＝黑色更黑
  const bk = (x: number) => {
    if (a.blacks >= 0) return a.blacks * 0.25 + x * (1 - a.blacks * 0.25);
    const m = -a.blacks * 0.15;
    return Math.max(0, (x - m) / (1 - m));
  };
  r = clamp01(bk(r));
  g = clamp01(bk(g));
  b = clamp01(bk(b));
  // 亮度：中間調為主（gamma）
  const gam = 1 / (1 + a.brightness * 0.6);
  r = r ** gam;
  g = g ** gam;
  b = b ** gam;
  // 飽和度：跟灰之間內插
  const y2 = luma(r, g, b);
  const sat = 1 + a.saturation;
  r = y2 + (r - y2) * sat;
  g = y2 + (g - y2) * sat;
  b = y2 + (b - y2) * sat;
  r = clamp01(r);
  g = clamp01(g);
  b = clamp01(b);
  // 鮮艷度：越不飽和的顏色加越多，已經很飽和的（含膚色）少加
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  const vib = 1 + a.vibrance * (1 - spread);
  const y3 = luma(r, g, b);
  r = y3 + (r - y3) * vib;
  g = y3 + (g - y3) * vib;
  b = y3 + (b - y3) * vib;
  // 褪色：整體往灰靠、對比變低、暗部抬起
  const f = clamp01(a.fade);
  const fd = (x: number) => x + (0.5 + (x - 0.5) * 0.7 - x) * f + f * 0.04 * (1 - x);
  r = clamp01(fd(clamp01(r)));
  g = clamp01(fd(clamp01(g)));
  b = clamp01(fd(clamp01(b)));
  return [r, g, b];
}

/** 給著色器的 uniform（順序與名稱固定，見 gradeFilter.ts） */
export function gradeUniforms(adj?: Partial<Adjust>): number[] {
  const a = fullAdjust(adj);
  return ADJUST_KEYS.map((k) => a[k]);
}

// ---------- 色調組合（預設） ----------

export type LookId = 'bw' | 'bwHigh' | 'vintage' | 'fresh' | 'cool' | 'warm' | 'cinema' | 'japan' | 'vivid';
export type LookDef = { id: LookId; name: string; adjust: Partial<Adjust> };

export const LOOKS: LookDef[] = [
  { id: 'bw', name: '黑白', adjust: { contrast: 0.15, saturation: -1 } },
  {
    id: 'bwHigh',
    name: '高反差黑白',
    adjust: { contrast: 0.45, highlights: 0.1, shadows: -0.15, blacks: -0.3, saturation: -1 },
  },
  {
    id: 'vintage',
    name: '復古',
    adjust: {
      contrast: -0.1,
      highlights: -0.2,
      shadows: 0.1,
      blacks: 0.35,
      saturation: -0.25,
      temperature: 0.3,
      tint: 0.06,
      fade: 0.3,
    },
  },
  {
    id: 'fresh',
    name: '清新',
    adjust: {
      exposure: 0.12,
      contrast: -0.1,
      highlights: -0.2,
      shadows: 0.2,
      brightness: 0.05,
      saturation: -0.05,
      vibrance: 0.3,
      temperature: -0.12,
    },
  },
  {
    id: 'cool',
    name: '冷色調',
    adjust: { contrast: 0.1, saturation: -0.1, temperature: -0.45, tint: -0.05 },
  },
  {
    id: 'warm',
    name: '暖色調',
    adjust: { exposure: 0.05, shadows: 0.05, vibrance: 0.15, temperature: 0.4, tint: 0.05 },
  },
  {
    id: 'cinema',
    name: '電影感',
    adjust: { contrast: 0.25, highlights: -0.3, blacks: -0.15, saturation: -0.15, temperature: 0.05 },
  },
  {
    id: 'japan',
    name: '日系',
    adjust: {
      exposure: 0.2,
      contrast: -0.25,
      highlights: -0.15,
      shadows: 0.25,
      blacks: 0.2,
      brightness: 0.05,
      saturation: -0.25,
      temperature: -0.08,
      tint: 0.05,
      fade: 0.15,
    },
  },
  { id: 'vivid', name: '鮮豔', adjust: { contrast: 0.12, saturation: 0.15, vibrance: 0.5 } },
];

export const lookName = (id: LookId): string => LOOKS.find((l) => l.id === id)?.name ?? '';

const clampKey = (k: AdjustKey, v: number) => Math.min(Math.max(v, k === 'fade' ? 0 : -1), 1);

/** 實際調色值（完整 11 項）＝色調組合 × 強度＋手動調整（各項相加後夾住） */
export function effectiveFull(
  look: { id: LookId; amount: number } | null | undefined,
  adjust: Partial<Adjust> | undefined,
): Adjust {
  const base = fullAdjust(adjust);
  const def = look ? LOOKS.find((l) => l.id === look.id) : undefined;
  if (!def) return base;
  const amount = Math.min(Math.max(look!.amount, 0), 1);
  const out = { ...ZERO_ADJUST };
  for (const k of ADJUST_KEYS) out[k] = clampKey(k, base[k] + (def.adjust[k] ?? 0) * amount);
  return out;
}

/**
 * 實際要用的調色值＝色調組合 × 強度＋手動調整。
 * adjustNow：這個時間的手動調整（有定格時是內插後的值）。全部是 0 回傳 undefined（不用加濾鏡）。
 */
export function effectiveAdjust(
  item: Pick<Item, 'look'>,
  adjustNow: Partial<Adjust> | undefined,
): Adjust | undefined {
  const out = effectiveFull(item.look, adjustNow);
  return isNeutral(out) ? undefined : out;
}

/** 有調色（色調組合、手動調整、定格裡的調色）嗎 */
export function itemHasGrade(it: Item): boolean {
  return (
    !!it.look ||
    (!!it.adjust && Object.values(it.adjust).some(Boolean)) ||
    !!it.keyframes?.some((k) => !!k.look || (k.adjust && Object.values(k.adjust).some(Boolean)))
  );
}
