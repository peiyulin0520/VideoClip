import type { Asset, VideoItem } from '../model/types';
import { coverCrop, cellTransform, type Rect } from './layouts';

// 動態模板「三格故事」（我們自己設計的時間表，總長預設 8 秒）：
//   0.0–1.6  開場影片在畫面中間（16:9，上下留黑）
//   1.6–2.2  上下撐開成滿版
//   2.2–2.8  第 1 格從上面滑進來（佔上 1/3）
//   2.8–3.4  第 2 格從右邊滑進來（中間 1/3）
//   3.4–4.0  第 3 格從下面滑進來（下 1/3）
//   3.4–T-0.6 標題在正中間，每 0.18 秒換一種字體（輪播 3 秒後固定第一種），下面一行小的手寫副標
//   T-1.6–T-0.6 畫面漸漸染成暖橘色；最後 0.6 秒閃光洗白（跟下一段銜接）

export const STORY_SECONDS = 8;
export const STORY_CYCLE_FONTS = [
  'noto-serif-tc',
  'noto-sans-tc',
  'jason-handwriting-1',
  'jf-openhuninn',
  'chocolate-classical',
];
export const STORY_SUB_FONT = 'jason-handwriting-1';

const MONTHS = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];
/** 預設標題＝目前月份的英文 */
export const monthTitle = (d: Date = new Date()): string => MONTHS[d.getMonth()]!;

type FRect = { x: number; y: number; w: number; h: number };
export type StoryPart = {
  /** 相對於模板開始的秒數 */
  start: number;
  /** 最長持續到這裡（模板結束）；實際長度還要看素材有多長 */
  until: number;
  cell: FRect;
  anim: NonNullable<VideoItem['cellAnim']>;
  /** 沒有播放時顯示色塊 */
  sound: boolean;
};

/** 4 個畫面（開場＋三格）的位置與時間；W、H 是專案畫面大小 */
export function storyParts(W: number, H: number, total = STORY_SECONDS): StoryPart[] {
  const bandH = Math.min((W * 9) / 16 / H, 1);
  const band: FRect = { x: 0, y: (1 - bandH) / 2, w: 1, h: bandH };
  const full: FRect = { x: 0, y: 0, w: 1, h: 1 };
  const third = 1 / 3;
  const slide = 0.6;
  return [
    { start: 0, until: Math.min(4, total), cell: full, anim: { from: band, t0: 1.6, t1: 2.2 }, sound: true },
    {
      start: 2.2,
      until: total,
      cell: { x: 0, y: 0, w: 1, h: third },
      anim: { from: { x: 0, y: -third, w: 1, h: third }, t0: 0, t1: slide },
      sound: false,
    },
    {
      start: 2.8,
      until: total,
      cell: { x: 0, y: third, w: 1, h: third },
      anim: { from: { x: 1, y: third, w: 1, h: third }, t0: 0, t1: slide },
      sound: false,
    },
    {
      start: 3.4,
      until: total,
      cell: { x: 0, y: 2 * third, w: 1, h: third },
      anim: { from: { x: 0, y: 1, w: 1, h: third }, t0: 0, t1: slide },
      sound: false,
    },
  ];
}

const easeOut = (p: number) => 1 - (1 - p) ** 3;

/** 動態格子在片段開始後 local 秒時的範圍（比例） */
export function animatedRect(cell: FRect, anim: NonNullable<VideoItem['cellAnim']>, local: number): FRect {
  const p = anim.t1 > anim.t0 ? Math.min(Math.max((local - anim.t0) / (anim.t1 - anim.t0), 0), 1) : 1;
  const e = easeOut(p);
  const f = anim.from;
  return {
    x: f.x + (cell.x - f.x) * e,
    y: f.y + (cell.y - f.y) * e,
    w: f.w + (cell.w - f.w) * e,
    h: f.h + (cell.h - f.h) * e,
  };
}

/** 格子這一刻的裁切與位置（還沒套整組的變形）：格子大小有變（開場撐開）時每一刻重算，只有位置移動就用原本的裁切 */
export function animatedCell(
  item: VideoItem,
  asset: Pick<Asset, 'width' | 'height'>,
  local: number,
  W: number,
  H: number,
) {
  const r = animatedRect(item.cell!, item.cellAnim!, local);
  const win: Rect = { x: r.x * W, y: r.y * H, w: r.w * W, h: r.h * H };
  const sameSize =
    Math.abs(item.cellAnim!.from.w - item.cell!.w) < 1e-6 &&
    Math.abs(item.cellAnim!.from.h - item.cell!.h) < 1e-6;
  const crop = sameSize ? item.crop : coverCrop(asset, win);
  return { crop, transform: cellTransform(asset, crop, win, W, H) };
}

/** 結尾的暖色染色與閃光：local＝模板開始後的秒數。回傳兩層顏色的透明度（暖色層、白色層） */
export function storyTint(local: number, total: number): { warm: number; white: number } {
  const ramp = (a: number, b: number, v: number) => Math.min(Math.max((v - a) / (b - a), 0), 1);
  const warm = 0.55 * ramp(total - 1.6, total - 0.6, local) + 0.35 * ramp(total - 0.6, total, local);
  const white = 0.9 * ramp(total - 0.6, total, local) ** 1.6;
  return { warm, white };
}

/** 字體輪播：開始後 local 秒用哪個字體 */
export function cycleFont(
  cycle: { fonts: string[]; interval: number; until: number },
  local: number,
): string {
  if (cycle.fonts.length === 0) return 'system';
  if (local >= cycle.until || local < 0) return cycle.fonts[0]!;
  return cycle.fonts[Math.floor(local / cycle.interval) % cycle.fonts.length]!;
}
