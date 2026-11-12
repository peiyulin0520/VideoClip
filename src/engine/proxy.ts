import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_MEDIUM,
  WebMOutputFormat,
  canEncodeVideo,
} from 'mediabunny';

// 預覽用輕量影片（proxy）。iPhone 拍的影片常常是 4K／HEVC／HDR，Safari 每播一格都要在 CPU 上做色彩轉換與搬運
// （實測每秒只畫得出約 3 格）。匯入後在背景另外做一份 H.264、長邊 960、SDR 的小檔，預覽播放用它；匯出用原檔。

/** proxy 的長邊（跟預覽畫面的內部解析度一樣） */
export const PROXY_SIDE = 960;
/** 原檔長邊超過這個就做 proxy */
export const PROXY_MIN_SIDE = 1280;

/** 要不要做 proxy：太大、HDR、或不是 H.264（iPhone 的 HEVC）都做；已經夠輕的原檔直接播 */
export function needsProxy(info: {
  width: number;
  height: number;
  codec?: string | null;
  hdr?: boolean;
}): boolean {
  if (info.hdr) return true;
  if (Math.max(info.width, info.height) > PROXY_MIN_SIDE) return true;
  if (info.codec && info.codec !== 'avc' && info.codec !== 'vp8' && info.codec !== 'vp9') return true;
  return false;
}

/** proxy 的尺寸：長邊縮到 PROXY_SIDE，偶數 */
export function proxySize(width: number, height: number): { width: number; height: number } {
  const k = Math.min(PROXY_SIDE / Math.max(width, height, 1), 1);
  const even = (n: number) => Math.max(Math.round((n * k) / 2) * 2, 2);
  return { width: even(width), height: even(height) };
}

export type ProxyResult =
  { status: 'none' } | { status: 'ready'; blob: Blob; mime: string; width: number; height: number };

/**
 * 讀原檔、判斷要不要做、做出 proxy。回傳 none＝不需要；丟錯＝做不出來（呼叫端標成 failed、照用原檔）。
 * onProgress：0–1。signal：取消。
 */
export async function makeProxy(
  file: Blob,
  opts: { onProgress?: (f: number) => void; signal?: AbortSignal } = {},
): Promise<ProxyResult> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return { status: 'none' };
    const [codec, hdr] = await Promise.all([
      track.getCodec().catch(() => null),
      track.hasHighDynamicRange().catch(() => false),
    ]);
    const w = track.displayWidth;
    const h = track.displayHeight;
    if (!needsProxy({ width: w, height: h, codec, hdr })) return { status: 'none' };
    const size = proxySize(w, h);

    // 優先 H.264（mp4，iPhone 一定能播）；編不出來才用 VP9（webm，Chromium）
    const useAvc = await canEncodeVideo('avc', { ...size, quality: QUALITY_MEDIUM }).catch(() => false);
    const useVp9 =
      !useAvc && (await canEncodeVideo('vp9', { ...size, quality: QUALITY_MEDIUM }).catch(() => false));
    if (!useAvc && !useVp9) throw new Error('這個瀏覽器編不出預覽用影片');

    const target = new BufferTarget();
    const output = new Output({
      format: useAvc ? new Mp4OutputFormat() : new WebMOutputFormat(),
      target,
    });
    // HDR 要轉成 SDR：每一格畫到 canvas 再交給編碼器（canvas 輸出是 sRGB）
    let canvas: OffscreenCanvas | null = null;
    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: {
        ...size,
        fit: 'fill',
        frameRate: 30,
        codec: useAvc ? 'avc' : 'vp9',
        quality: QUALITY_MEDIUM,
        forceTranscode: true,
        ...(hdr
          ? {
              process: (sample) => {
                if (!canvas || canvas.width !== sample.displayWidth || canvas.height !== sample.displayHeight)
                  canvas = new OffscreenCanvas(sample.displayWidth, sample.displayHeight);
                sample.draw(canvas.getContext('2d')!, 0, 0, canvas.width, canvas.height);
                return canvas;
              },
            }
          : {}),
      },
    });
    if (!conversion.isValid) throw new Error('預覽用影片的設定不可用');
    conversion.onProgress = (f) => opts.onProgress?.(f);
    opts.signal?.addEventListener('abort', () => void conversion.cancel(), { once: true });
    await conversion.execute();
    const buf = target.buffer;
    if (!buf || buf.byteLength === 0) throw new Error('預覽用影片是空的');
    const mime = useAvc ? 'video/mp4' : 'video/webm';
    return { status: 'ready', blob: new Blob([buf], { type: mime }), mime, ...size };
  } finally {
    input.dispose();
  }
}
