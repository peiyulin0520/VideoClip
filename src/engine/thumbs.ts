import type { Asset } from '../model/types';
import { getMedia } from '../storage/media';
import { setAssetThumbs } from '../store/projectStore';
import { proxyKey } from './assetUrls';
import { canDecodeThumbs, mediabunnyThumbs, videoThumbs } from './probe';

// 時間軸縮圖：每 2 秒一張（最多 60 張），依時間顯示不同畫面。
// 匯入時只先取幾張（快），之後在背景補滿；iPhone 的大檔／HEVC 原檔解不動，改用「預覽用輕量影片」解。
// 播放時預覽播放器也會依播到的位置逐格補（最後手段）。

export const THUMB_SECONDS = 2;
export const MAX_THUMBS = 60;

/** 這支影片要幾張縮圖 */
export function thumbCount(duration: number): number {
  return Math.min(Math.max(Math.ceil(duration / THUMB_SECONDS), 1), MAX_THUMBS);
}

/** 素材第 srcT 秒對到第幾張縮圖（總共 n 張）；超出範圍夾住 */
export function thumbIndex(n: number, srcT: number, duration: number): number {
  if (n <= 1 || duration <= 0) return 0;
  return Math.min(Math.max(Math.floor((srcT / duration) * n), 0), n - 1);
}

/** 素材第 srcT 秒的縮圖；那一格是空的就找最近的一張有的；全部都沒有回傳 undefined */
export function thumbFor(thumbs: string[], srcT: number, duration: number): string | undefined {
  if (thumbs.length === 0) return undefined;
  const i = thumbIndex(thumbs.length, srcT, duration);
  if (thumbs[i]) return thumbs[i];
  for (let d = 1; d < thumbs.length; d++) {
    const a = thumbs[i - d];
    if (a) return a;
    const b = thumbs[i + d];
    if (b) return b;
  }
  return undefined;
}

/**
 * 一條縮圖帶（修剪面板、特效時間面板用）：從素材的 t0 到 t1 秒平均挑 k 張（沒有的用最近的）。
 * 縮圖有幾十張時整條帶不能每張都畫（會變成一條一條的細縫），挑幾張就好。
 */
export function thumbStrip(thumbs: string[], duration: number, t0: number, t1: number, k: number): string[] {
  if (thumbs.length === 0) return [];
  if (duration <= 0) return [thumbs[0]!];
  const out: string[] = [];
  for (let i = 0; i < k; i++) {
    const url = thumbFor(thumbs, t0 + ((i + 0.5) / k) * (t1 - t0), duration);
    if (url) out.push(url);
  }
  return out;
}

/** 這個素材的縮圖還沒補滿（影片才需要）；匯入、補滿之後 thumbsFull 是 true */
export function needsThumbs(a: Asset): boolean {
  return a.kind === 'video' && a.duration > 0 && !a.thumbsFull;
}

/** 把現有的縮圖攤成 n 張（每一格先用時間上最近的舊縮圖頂著，之後再被真的換掉） */
export function expandThumbs(thumbs: string[], n: number): string[] {
  if (thumbs.length === 0 || thumbs.length === n) return thumbs.slice();
  return Array.from(
    { length: n },
    (_, j) => thumbs[Math.min(Math.floor(((j + 0.5) / n) * thumbs.length), thumbs.length - 1)]!,
  );
}

// ---------- 背景補縮圖（一次一支，不擋剪輯） ----------

type Job = { projectId: string; asset: Asset };
const queue: Job[] = [];
const queued = new Set<string>();
let running = false;

/** 測試用：直接換掉取縮圖的函式 */
type Maker = (file: Blob, duration: number, count: number) => Promise<string[]>;
let maker: Maker | null = null;
export function __setThumbMaker(fn: Maker | null) {
  maker = fn;
}

/** 選一個解得動的檔：輕量影片做好了就用它；沒有就用原檔（要不會把手機記憶體吃光） */
async function sourceFor(projectId: string, a: Asset): Promise<Blob | null> {
  if (a.proxy?.status === 'ready') return getMedia(projectId, proxyKey(a.id), a.proxy.mime ?? 'video/mp4');
  if (!canDecodeThumbs(a.width, a.height, a.size) && a.proxy?.status !== 'none') return null; // 等輕量影片
  return getMedia(projectId, a.id, a.mime);
}

async function runOne({ projectId, asset }: Job) {
  try {
    const file = await sourceFor(projectId, asset);
    if (!file) return;
    const n = thumbCount(asset.duration);
    let thumbs = await (maker ?? mediabunnyThumbs)(file, asset.duration, n);
    if (thumbs.length !== n && !maker) {
      // WebCodecs 解不了：用隱藏的 <video> 試試（iPhone 沒有手勢時常常載不到，那就算了）
      const url = URL.createObjectURL(file);
      try {
        thumbs = await videoThumbs(url, asset.duration, n);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    if (thumbs.length === n) setAssetThumbs(asset.id, thumbs, true);
  } catch (e) {
    console.warn('[thumbs] 補縮圖失敗，照用現有的', e);
  }
}

async function drain() {
  if (running) return;
  running = true;
  try {
    for (let job = queue.shift(); job; job = queue.shift()) {
      await runOne(job);
      queued.delete(job.asset.id);
    }
  } finally {
    running = false;
  }
}

/** 還沒補滿縮圖的影片排進背景佇列（可以重複呼叫；輕量影片剛做好時也呼叫一次，改用它解） */
export function enqueueThumbs(projectId: string, assets: Asset[]): void {
  for (const a of assets) {
    if (!needsThumbs(a) || a.unsaved || queued.has(a.id)) continue;
    queued.add(a.id);
    queue.push({ projectId, asset: a });
  }
  void drain();
}
