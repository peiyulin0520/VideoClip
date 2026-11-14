import type { Asset, Crop, Transform, VideoItem } from '../model/types';
import { createOverlayClip } from '../model/defaults';
import { isNoCrop } from './crop';
import { croppedSource, fittedSize } from './geometry';

// 多格版型（拍貼機、膠卷、拍立得、分割、九宮格）。
// 一個版型＝一張「外框」PNG（有色的外框，格子的地方是透明的洞）蓋在最上層＋每一格各一個疊加影片／照片（放在外框下面，
// 裁成剛好填滿那個洞）。這樣預覽、匯出都不用新的物件種類，每一格還是普通的疊加物件（可以個別裁切、調整、換素材）。

export type Rect = { x: number; y: number; w: number; h: number };
export type LayoutId =
  'booth-strip' | 'booth-2x2' | 'film-h' | 'film-v' | 'polaroid' | 'split-2' | 'split-3' | 'grid-9';

export type FrameColor = { id: string; name: string; color: string };
export const FRAME_COLORS: FrameColor[] = [
  { id: 'white', name: '白', color: '#ffffff' },
  { id: 'black', name: '黑', color: '#141414' },
  { id: 'pink', name: '粉', color: '#ffc9dc' },
  { id: 'cream', name: '奶茶', color: '#e8d3b8' },
];

/** 版型附的文字（位置是畫面像素的中心點；字級以 1080 寬為基準）；建立版型時變成跟著版型走的字卡 */
export type LayoutText = {
  x: number;
  y: number;
  text: string;
  size: number;
  fontId: string;
  bold: boolean;
  letterSpacing: number;
};

export type LayoutDef = {
  id: LayoutId;
  name: string;
  hint: string;
  cells: number;
  /** 預設要附的文字（拍貼機的 PHOTO BOOTH＋日期、膠卷的底片號碼…）；沒有就不附 */
  texts?: (b: ReturnType<LayoutDef['build']>, W: number, today: string) => LayoutText[];
  /** 依畫面大小算出格子的位置（px）與外框要畫的形狀（panel：實心的外框範圍；holes：膠卷的齒孔） */
  build: (W: number, H: number) => { windows: Rect[]; panels: Rect[]; holes: Rect[]; radius: number };
};

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** 把一排格子（欄 × 列）排進某個範圍，格子之間留 gap */
function gridIn(area: Rect, cols: number, rows: number, gap: number, cellAspect?: number): Rect[] {
  const w = (area.w - gap * (cols - 1)) / cols;
  const h = cellAspect ? w / cellAspect : (area.h - gap * (rows - 1)) / rows;
  const out: Rect[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) out.push(rect(area.x + c * (w + gap), area.y + r * (h + gap), w, h));
  return out;
}

/** 膠卷的齒孔：沿著一條帶子每隔一段一個小圓角方塊 */
function sprockets(band: Rect, horizontal: boolean, size: number): Rect[] {
  const out: Rect[] = [];
  const pitch = size * 2.2;
  const len = horizontal ? band.w : band.h;
  const n = Math.max(Math.floor((len - size) / pitch), 1);
  const used = n * pitch - (pitch - size);
  const start = (len - used) / 2;
  for (let i = 0; i < n; i++) {
    const o = start + i * pitch;
    out.push(
      horizontal
        ? rect(band.x + o, band.y + (band.h - size * 0.7) / 2, size, size * 0.7)
        : rect(band.x + (band.w - size * 0.7) / 2, band.y + o, size * 0.7, size),
    );
  }
  return out;
}

const RAW_LAYOUTS: LayoutDef[] = [
  {
    id: 'booth-strip',
    name: '拍貼機直條',
    hint: '4 格直條，下面留白可以寫日期',
    cells: 4,
    texts(b, W, today) {
      const p = b.panels[0]!;
      const bottom = b.windows[b.windows.length - 1]!;
      const y = (bottom.y + bottom.h + p.y + p.h) / 2;
      return [
        {
          x: p.x + p.w / 2,
          y,
          text: `PHOTO BOOTH\n${today}`,
          size: Math.round((p.w / W) * 1080 * 0.085),
          fontId: 'system',
          bold: true,
          letterSpacing: 0.08,
        },
      ];
    },
    build(W, H) {
      const pw = Math.min(W * 0.56, H * 0.34);
      const ph = Math.min(H * 0.92, pw * 3.0);
      const px = (W - pw) / 2;
      const py = (H - ph) / 2;
      const m = pw * 0.07;
      const bottom = ph * 0.1;
      const gap = m * 0.7;
      const area = rect(px + m, py + m, pw - 2 * m, ph - m - bottom - m * 0.2);
      const wins = gridIn(rect(area.x, area.y, area.w, area.h), 1, 4, gap);
      return { windows: wins, panels: [rect(px, py, pw, ph)], holes: [], radius: m * 0.25 };
    },
  },
  {
    id: 'booth-2x2',
    name: '拍貼機 2×2',
    hint: '4 格方形，下面留白',
    cells: 4,
    texts(b, W, today) {
      const p = b.panels[0]!;
      const bottom = b.windows[b.windows.length - 1]!;
      const y = (bottom.y + bottom.h + p.y + p.h) / 2;
      return [
        {
          x: p.x + p.w / 2,
          y,
          text: `PHOTO BOOTH\n${today}`,
          size: Math.round((p.w / W) * 1080 * 0.07),
          fontId: 'system',
          bold: true,
          letterSpacing: 0.08,
        },
      ];
    },
    build(W, H) {
      const pw = W * 0.86;
      const m = pw * 0.05;
      const gap = m * 0.8;
      const cw = (pw - 2 * m - gap) / 2;
      const ch = cw * 1.05;
      const bottom = ch * 0.38;
      const ph = m + 2 * ch + gap + bottom;
      const px = (W - pw) / 2;
      const py = (H - ph) / 2;
      const wins = gridIn(rect(px + m, py + m, pw - 2 * m, 2 * ch + gap), 2, 2, gap, cw / ch);
      return { windows: wins, panels: [rect(px, py, pw, ph)], holes: [], radius: m * 0.25 };
    },
  },
  {
    id: 'film-h',
    name: '膠卷橫向',
    hint: '黑色底片 3 格，上下有齒孔',
    cells: 3,
    texts(b, W) {
      const p = b.panels[0]!;
      const band = (b.windows[0]!.y - p.y) / 1.2;
      const size = Math.round((band / W) * 1080 * 0.42);
      return [
        {
          x: p.x + p.w * 0.2,
          y: p.y + band * 0.5,
          text: 'FILM 400',
          size,
          fontId: 'system',
          bold: true,
          letterSpacing: 0.1,
        },
        {
          x: p.x + p.w * 0.8,
          y: p.y + p.h - band * 0.5,
          text: '▶ 12A',
          size,
          fontId: 'system',
          bold: true,
          letterSpacing: 0.1,
        },
      ];
    },
    build(W, H) {
      const m = W * 0.03;
      const band = W * 0.05;
      const cw = (W - 2 * m - 2 * m * 0.6) / 3;
      const ch = cw * 1.3;
      const sh = ch + 2 * band + m * 0.4;
      const sy = (H - sh) / 2;
      const wins = gridIn(rect(m, sy + band + m * 0.2, W - 2 * m, ch), 3, 1, m * 0.6);
      const holes = [
        ...sprockets(rect(0, sy, W, band), true, band * 0.6),
        ...sprockets(rect(0, sy + sh - band, W, band), true, band * 0.6),
      ];
      return { windows: wins, panels: [rect(0, sy, W, sh)], holes, radius: m * 0.2 };
    },
  },
  {
    id: 'film-v',
    name: '膠卷直向',
    hint: '黑色底片 3 格，左右有齒孔',
    cells: 3,
    texts(b, W) {
      const p = b.panels[0]!;
      const last = b.windows[b.windows.length - 1]!;
      const y = (last.y + last.h + p.y + p.h) / 2;
      return [
        {
          x: p.x + p.w / 2,
          y,
          text: 'FILM 400 ▶ 12A',
          size: Math.round((p.w / W) * 1080 * 0.05),
          fontId: 'system',
          bold: true,
          letterSpacing: 0.08,
        },
      ];
    },
    build(W, H) {
      const band = W * 0.05;
      const m = W * 0.02;
      const gap = m * 0.7;
      // 格子 5:4 橫式；畫面不夠高（方形、橫式畫面）就縮小格子
      const ch = Math.min(W * 0.4 * 0.8, (H * 0.92 - 2 * m - 2 * gap) / 3);
      const cw = ch / 0.8;
      const sw = cw + 2 * band + m * 0.4;
      const sx = (W - sw) / 2;
      const total = 3 * ch + 2 * gap;
      const sh = total + 2 * m;
      const sy = (H - sh) / 2;
      const wins = gridIn(rect(sx + band + m * 0.2, sy + m, cw, total), 1, 3, gap);
      const holes = [
        ...sprockets(rect(sx, sy, band, sh), false, band * 0.6),
        ...sprockets(rect(sx + sw - band, sy, band, sh), false, band * 0.6),
      ];
      return { windows: wins, panels: [rect(sx, sy, sw, sh)], holes, radius: m * 0.2 };
    },
  },
  {
    id: 'polaroid',
    name: '拍立得',
    hint: '白框、下面寬邊，1 格',
    cells: 1,
    texts(b, W, today) {
      const p = b.panels[0]!;
      const w = b.windows[0]!;
      const y = (w.y + w.h + p.y + p.h) / 2;
      return [
        {
          x: p.x + p.w / 2,
          y,
          text: `memories\n${today}`,
          size: Math.round((p.w / W) * 1080 * 0.07),
          fontId: 'system',
          bold: false,
          letterSpacing: 0.04,
        },
      ];
    },
    build(W, H) {
      const pw = W * 0.8;
      const m = pw * 0.06;
      const wsz = pw - 2 * m;
      const bottom = pw * 0.22;
      const ph = m + wsz + bottom;
      const px = (W - pw) / 2;
      const py = (H - ph) / 2;
      return {
        windows: [rect(px + m, py + m, wsz, wsz)],
        panels: [rect(px, py, pw, ph)],
        holes: [],
        radius: m * 0.12,
      };
    },
  },
  {
    id: 'split-2',
    name: '上下雙格',
    hint: '畫面切成上下兩格，中間細白線',
    cells: 2,
    build(W, H) {
      const m = W * 0.015;
      const gap = W * 0.012;
      const wins = gridIn(rect(m, m, W - 2 * m, H - 2 * m), 1, 2, gap);
      return { windows: wins, panels: [rect(0, 0, W, H)], holes: [], radius: m * 0.6 };
    },
  },
  {
    id: 'split-3',
    name: '三格',
    hint: '上面 1 大格、下面 2 小格',
    cells: 3,
    build(W, H) {
      const m = W * 0.015;
      const gap = W * 0.012;
      const innerH = H - 2 * m;
      const topH = (innerH - gap) * 0.55;
      const botH = innerH - gap - topH;
      const bw = (W - 2 * m - gap) / 2;
      const wins = [
        rect(m, m, W - 2 * m, topH),
        rect(m, m + topH + gap, bw, botH),
        rect(m + bw + gap, m + topH + gap, bw, botH),
      ];
      return { windows: wins, panels: [rect(0, 0, W, H)], holes: [], radius: m * 0.6 };
    },
  },
  {
    id: 'grid-9',
    name: '九宮格',
    hint: '3×3，建議放照片',
    cells: 9,
    build(W, H) {
      const m = W * 0.02;
      const gap = W * 0.012;
      const cw = (W - 2 * m - 2 * gap) / 3;
      const total = 3 * cw + 2 * gap;
      const wins = gridIn(rect(m, (H - total) / 2, W - 2 * m, total), 3, 3, gap, 1);
      return { windows: wins, panels: [rect(0, 0, W, H)], holes: [], radius: m * 0.4 };
    },
  },
];

type Built = ReturnType<LayoutDef['build']>;

/** 畫面很寬或接近正方形時，版型（照直式畫面設計）可能超出畫面：整個版型以畫面中心縮小到放得下（全畫面的外框不縮） */
function fitInCanvas(b: Built, W: number, H: number): Built {
  const full = (p: Rect) => p.x <= 0.5 && p.y <= 0.5 && p.w >= W - 1 && p.h >= H - 1;
  const parts = [...b.panels.filter((p) => !full(p)), ...(b.panels.every(full) ? b.windows : [])];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of parts) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  const s = Math.min(1, (0.96 * W) / Math.max(x1 - x0, 1), (0.96 * H) / Math.max(y1 - y0, 1));
  if (s >= 0.999) return b;
  const sc = (r: Rect): Rect => ({
    x: W / 2 + (r.x - W / 2) * s,
    y: H / 2 + (r.y - H / 2) * s,
    w: r.w * s,
    h: r.h * s,
  });
  return {
    windows: b.windows.map(sc),
    holes: b.holes.map(sc),
    panels: b.panels.map((p) => (full(p) ? p : sc(p))),
    radius: b.radius * s,
  };
}

export const LAYOUTS: LayoutDef[] = RAW_LAYOUTS.map((d) => ({
  ...d,
  build: (W: number, H: number) => fitInCanvas(d.build(W, H), W, H),
}));

export const layoutById = (id: LayoutId): LayoutDef => LAYOUTS.find((l) => l.id === id)!;

/** 外框顏色（色碼）的亮度 0～1；版型文字用它挑深字或淺字 */
export function colorLuma(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1]!, 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}
/** 版型文字的顏色：淺色外框配深字、深色外框配淺字 */
export const inkFor = (frameColor: string): string => (colorLuma(frameColor) > 0.55 ? '#3a2e2a' : '#f6f2ea');

// ---------- 外框畫面 ----------

/** 外框畫在 ctx 上（canvas 的大小要是 W×H）：實心外框，格子和齒孔是透明的洞（evenodd） */
export function paintFrame(
  ctx: CanvasRenderingContext2D,
  def: LayoutDef,
  W: number,
  H: number,
  color: string,
  windowFill?: string,
  opacity = 1,
) {
  const b = def.build(W, H);
  const rr = (r: Rect, radius: number) => {
    ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(radius, r.w / 2, r.h / 2));
  };
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath();
  for (const p of b.panels) ctx.rect(p.x, p.y, p.w, p.h);
  for (const w of b.windows) rr(w, b.radius);
  for (const h of b.holes) rr(h, Math.min(h.w, h.h) * 0.25);
  ctx.fillStyle = color;
  ctx.globalAlpha = Math.min(Math.max(opacity, 0), 1);
  ctx.fill('evenodd');
  ctx.globalAlpha = 1;
  if (windowFill) {
    // 縮圖用：格子裡畫淡淡的灰色，看得出哪裡放照片
    ctx.beginPath();
    for (const w of b.windows) rr(w, b.radius);
    ctx.fillStyle = windowFill;
    ctx.fill();
  }
}

/** 外框 PNG（輸出給 importFiles 當照片素材）。大小跟專案畫面一樣，這樣放在畫面中央、填滿就剛好對齊。 */
export async function renderFramePng(
  def: LayoutDef,
  W: number,
  H: number,
  color: string,
  opacity = 1,
): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = Math.round(W);
  c.height = Math.round(H);
  paintFrame(c.getContext('2d')!, def, c.width, c.height, color, undefined, opacity);
  return new Promise((ok, bad) =>
    c.toBlob((b) => (b ? ok(b) : bad(new Error('外框轉成圖片失敗'))), 'image/png'),
  );
}

// ---------- 每一格的疊加物件 ----------

/**
 * 讓素材（套用 crop 後）剛好填滿一個格子：回傳 transform（位置、大小）。
 * crop 的比例跟格子一樣＝剛好填滿；不一樣＝蓋滿格子（多出來的在格子外，會被外框蓋住或露出來）。
 */
export function cellTransform(
  asset: Pick<Asset, 'width' | 'height'>,
  crop: Crop | undefined,
  win: Rect,
  W: number,
  H: number,
): Transform {
  const src = croppedSource(asset as Asset, crop);
  const base = fittedSize(src.w, src.h, W, H, 'contain');
  const scale = Math.max(win.w / base.w, win.h / base.h);
  return { x: (win.x + win.w / 2) / W, y: (win.y + win.h / 2) / H, scale, rotation: 0, opacity: 1 };
}

/** 置中裁成格子的比例（蓋滿格子的最大範圍） */
export function coverCrop(asset: Pick<Asset, 'width' | 'height'>, win: Rect): Crop | undefined {
  const k = Math.max(win.w / asset.width, win.h / asset.height);
  const cw = Math.min(win.w / (k * asset.width), 1);
  const ch = Math.min(win.h / (k * asset.height), 1);
  const crop = { l: (1 - cw) / 2, r: (1 - cw) / 2, t: (1 - ch) / 2, b: (1 - ch) / 2 };
  return isNoCrop(crop) ? undefined : crop;
}

/** 一格的疊加物件：素材置中裁好、填滿那個洞；記下格子的位置（之後在裁切模式調整範圍時，畫面還是填滿這個洞） */
export function cellItem(
  asset: Asset,
  win: Rect,
  W: number,
  H: number,
  start: number,
  duration: number,
  group: string,
): VideoItem {
  const item = createOverlayClip(asset, start);
  const crop = coverCrop(asset, win);
  item.duration = Math.max(duration, 0.2);
  if (crop) item.crop = crop;
  item.transform = cellTransform(asset, crop, win, W, H);
  item.cell = { x: win.x / W, y: win.y / H, w: win.w / W, h: win.h / H };
  item.group = group;
  return item;
}

/** 格子的像素範圍（由 item.cell 換回來） */
export const cellRect = (cell: NonNullable<VideoItem['cell']>, W: number, H: number): Rect =>
  rect(cell.x * W, cell.y * H, cell.w * W, cell.h * H);

/** 同時播放的影片超過這個數量，手機可能解不動（iPhone 同時解碼數有限） */
export const MAX_CELL_VIDEOS = 5;
