import { decompressFrames, parseGIF } from 'gifuct-js';

// 會動的圖片（GIF、動態 WebP，例如 GIPHY 貼圖）：解成一格一格的 ImageBitmap，之後依「物件開始後經過的時間」取格，
// 預覽和單格輸出（匯出）取到的是同一格，暫停、拖時間軸也能準確定格。

export type AnimData = {
  frames: ImageBitmap[];
  /** 每一格要停多久（秒） */
  delays: number[];
  duration: number;
  width: number;
  height: number;
};

const MAX_FRAMES = 150;
const MAX_BYTES = 96 * 1024 * 1024; // 解開後的所有格子加起來不能超過（貼圖通常只有幾 MB）
const MIN_DELAY = 0.02;
const DEFAULT_DELAY = 0.1;

export function hasImageDecoder(): boolean {
  return typeof (globalThis as { ImageDecoder?: unknown }).ImageDecoder === 'function';
}

/** 看檔案開頭的幾個 byte 判斷是 GIF 還是 WebP（有些來源沒給正確的 mime） */
export async function sniffImageType(blob: Blob): Promise<'image/gif' | 'image/webp' | null> {
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const s = (from: number, len: number) => String.fromCharCode(...b.slice(from, from + len));
  if (s(0, 4) === 'GIF8') return 'image/gif';
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return 'image/webp';
  return null;
}

/** 這個時間點（物件開始後經過的秒數）要顯示第幾格；會循環播放 */
export function frameIndexAt(delays: number[], local: number): number {
  if (delays.length <= 1) return 0;
  const total = delays.reduce((s, d) => s + d, 0);
  if (!(total > 0)) return 0;
  const t = ((local % total) + total) % total;
  let acc = 0;
  for (let i = 0; i < delays.length; i++) {
    acc += delays[i]!;
    if (t < acc) return i;
  }
  return delays.length - 1;
}

async function decodeWithImageDecoder(blob: Blob, type: string): Promise<AnimData | null> {
  const dec = new ImageDecoder({ data: await blob.arrayBuffer(), type });
  const frames: ImageBitmap[] = [];
  const delays: number[] = [];
  try {
    await dec.tracks.ready;
    const count = dec.tracks.selectedTrack?.frameCount ?? 1;
    if (count <= 1 || count > MAX_FRAMES) return null;
    let width = 0;
    let height = 0;
    for (let i = 0; i < count; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      try {
        width = image.displayWidth;
        height = image.displayHeight;
        if (width * height * 4 * count > MAX_BYTES) return null;
        frames.push(await createImageBitmap(image));
        const d = (image.duration ?? 0) / 1e6;
        delays.push(d > 0 ? Math.max(d, MIN_DELAY) : DEFAULT_DELAY);
      } finally {
        image.close();
      }
    }
    return { frames, delays, duration: delays.reduce((s, d) => s + d, 0), width, height };
  } catch (e) {
    frames.forEach((f) => f.close());
    throw e;
  } finally {
    dec.close();
  }
}

/** 沒有 ImageDecoder 的瀏覽器：GIF 用 gifuct-js 解，自己處理「前一格怎麼清掉」（disposal） */
async function decodeGif(blob: Blob): Promise<AnimData | null> {
  const gif = parseGIF(await blob.arrayBuffer());
  const list = decompressFrames(gif, true);
  const W = gif.lsd.width;
  const H = gif.lsd.height;
  if (list.length <= 1 || list.length > MAX_FRAMES || W * H * 4 * list.length > MAX_BYTES) return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const patchCv = document.createElement('canvas');
  const patchCtx = patchCv.getContext('2d')!;
  const frames: ImageBitmap[] = [];
  const delays: number[] = [];
  let restore: ImageData | null = null;
  for (const f of list) {
    if (f.disposalType === 3) restore = ctx.getImageData(0, 0, W, H);
    patchCv.width = f.dims.width;
    patchCv.height = f.dims.height;
    patchCtx.putImageData(new ImageData(new Uint8ClampedArray(f.patch), f.dims.width, f.dims.height), 0, 0);
    ctx.drawImage(patchCv, f.dims.left, f.dims.top);
    frames.push(await createImageBitmap(canvas));
    delays.push(f.delay > 0 ? Math.max(f.delay / 1000, MIN_DELAY) : DEFAULT_DELAY);
    if (f.disposalType === 2) ctx.clearRect(f.dims.left, f.dims.top, f.dims.width, f.dims.height);
    else if (f.disposalType === 3 && restore) ctx.putImageData(restore, 0, 0);
  }
  return { frames, delays, duration: delays.reduce((s, d) => s + d, 0), width: W, height: H };
}

/** 解成一格一格。不是動圖、太大、這個瀏覽器解不了 → null（呼叫端就當一般照片）。 */
export async function decodeAnimBlob(blob: Blob): Promise<AnimData | null> {
  const type = await sniffImageType(blob);
  if (!type) return null;
  if (hasImageDecoder()) {
    try {
      return await decodeWithImageDecoder(blob, type);
    } catch {
      /* ImageDecoder 解不了這個檔，GIF 還有備用的 */
    }
  }
  if (type === 'image/gif') {
    try {
      return await decodeGif(blob);
    } catch {
      return null;
    }
  }
  return null;
}

// ---- 快取：每個素材只解一次 ----
const pending = new Map<string, Promise<AnimData | null>>();
const done = new Map<string, AnimData | null>();

/** 已經解好的（同步取）；還沒解好是 undefined，不是動圖是 null */
export function peekAnim(key: string): AnimData | null | undefined {
  return done.get(key);
}

export function loadAnim(key: string, getBlob: () => Promise<Blob>): Promise<AnimData | null> {
  let p = pending.get(key);
  if (!p) {
    p = getBlob()
      .then(decodeAnimBlob)
      .catch(() => null)
      .then((d) => {
        done.set(key, d);
        return d;
      });
    pending.set(key, p);
  }
  return p;
}

/** 單格輸出用：這個物件開始後 local 秒那一格 */
export async function animBitmapAt(
  key: string,
  getBlob: () => Promise<Blob>,
  local: number,
): Promise<ImageBitmap | null> {
  const d = await loadAnim(key, getBlob);
  return d ? (d.frames[frameIndexAt(d.delays, local)] ?? null) : null;
}

export const fetchBlob = (url: string) => async () => (await fetch(url)).blob();
