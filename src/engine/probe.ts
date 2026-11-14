import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import type { Asset } from '../model/types';
import { decodeAnimBlob } from './animImage';
import { computeWave } from './wave';

export type MediaKind = 'video' | 'image' | 'audio';

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|3gp|avi)$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|caf|aif|aiff)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i;

export function mediaKindOf(file: File): MediaKind | null {
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  if (AUDIO_EXT.test(file.name)) return 'audio';
  if (VIDEO_EXT.test(file.name)) return 'video';
  if (IMAGE_EXT.test(file.name)) return 'image';
  return null;
}

type Probed = Pick<Asset, 'duration' | 'width' | 'height' | 'hasAudio' | 'codec' | 'hdr'>;

/** 讀影片長度、尺寸、有沒有音軌（Mediabunny 直接讀容器，不需要瀏覽器能解碼） */
async function probeVideoContainer(file: File): Promise<Probed | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const [duration, v, a] = await Promise.all([
      input.computeDuration(),
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
    ]);
    if (!v) return null;
    // 編碼與 HDR：給「要不要做預覽用輕量影片」判斷；讀不到不影響匯入
    const [codec, hdr] = await Promise.all([
      v.getCodec().catch(() => null),
      v.hasHighDynamicRange().catch(() => false),
    ]);
    return {
      duration,
      width: v.displayWidth,
      height: v.displayHeight,
      hasAudio: !!a,
      ...(codec ? { codec } : {}),
      ...(hdr ? { hdr: true } : {}),
    };
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

function waitFor(el: HTMLMediaElement, ok: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      clearTimeout(timer);
      el.removeEventListener(ok, onOk);
      el.removeEventListener('error', onErr);
      resolve(v);
    };
    const onOk = () => done(true);
    const onErr = () => done(false);
    const timer = setTimeout(() => done(false), ms);
    el.addEventListener(ok, onOk, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });
}

/** 備用：用 <video> 讀 metadata（Mediabunny 不認得的容器）。無法判斷音軌時假設有。 */
async function probeVideoElement(url: string): Promise<Probed | null> {
  const v = document.createElement('video');
  v.preload = 'metadata';
  v.muted = true;
  v.src = url;
  const ok = await waitFor(v, 'loadedmetadata', 8000);
  const out =
    ok && isFinite(v.duration)
      ? { duration: v.duration, width: v.videoWidth, height: v.videoHeight, hasAudio: true }
      : null;
  v.removeAttribute('src');
  v.load();
  return out;
}

const THUMB_H = 160;

function canvasFor(w: number, h: number) {
  const c = document.createElement('canvas');
  const scale = THUMB_H / Math.max(h, 1);
  c.width = Math.max(Math.round(w * scale), 1);
  c.height = THUMB_H;
  return c;
}

/**
 * 用 Mediabunny（WebCodecs）直接從容器解碼幾格縮圖，不靠 <video> 的 loadeddata——
 * iPhone Safari 沒有使用者手勢時，隱藏的 <video> 常常不載入畫面，舊方法會拿不到縮圖。
 * 瀏覽器不能解碼這個格式時回傳空陣列（由呼叫端改用 <video> 方法）。
 */
/** 解析度或檔案太大就不用 WebCodecs 解碼縮圖（iPhone 4K HEVC 解碼會吃光記憶體），交給播放器之後補 */
export const THUMB_DECODE_MAX_SIDE = 1920;
export const THUMB_DECODE_MAX_BYTES = 150 * 1024 * 1024;
export function canDecodeThumbs(width: number, height: number, bytes: number): boolean {
  return Math.max(width, height) <= THUMB_DECODE_MAX_SIDE && bytes <= THUMB_DECODE_MAX_BYTES;
}

export async function mediabunnyThumbs(file: Blob, duration: number, count: number): Promise<string[]> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const out: string[] = [];
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return out;
    const tw = Math.max(Math.round((THUMB_H * track.displayWidth) / Math.max(track.displayHeight, 1)), 1);
    const sink = new CanvasSink(track, { width: tw, height: THUMB_H, fit: 'fill' });
    const times = Array.from({ length: count }, (_, i) =>
      Math.min(((i + 0.5) / count) * duration, Math.max(duration - 0.05, 0)),
    );
    let last: string | null = null;
    for await (const wrapped of sink.canvasesAtTimestamps(times)) {
      if (wrapped) {
        const c = canvasFor(wrapped.canvas.width, wrapped.canvas.height);
        c.getContext('2d')!.drawImage(wrapped.canvas, 0, 0, c.width, c.height);
        last = c.toDataURL('image/jpeg', 0.6);
      }
      if (last) out.push(last); // 某一格拿不到就沿用前一格
      await new Promise((r) => setTimeout(r, 0)); // 讓出一下，頁面有機會回收記憶體
    }
  } catch {
    /* 解碼失敗：交給備用方法 */
  } finally {
    input.dispose();
  }
  return out.length === count ? out : [];
}

/** 從已經有畫面的 <video> 擷取一張縮圖（預覽播放器的備用方案） */
export function captureThumb(v: HTMLVideoElement): string | null {
  if (v.videoWidth <= 0 || v.videoHeight <= 0 || v.readyState < 2) return null;
  try {
    const c = canvasFor(v.videoWidth, v.videoHeight);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.6);
  } catch {
    return null;
  }
}

export async function videoThumbs(url: string, duration: number, count: number): Promise<string[]> {
  const v = document.createElement('video');
  v.preload = 'auto';
  v.muted = true;
  v.playsInline = true;
  v.src = url;
  const out: string[] = [];
  try {
    if (!(await waitFor(v, 'loadeddata', 8000))) return out;
    const c = canvasFor(v.videoWidth, v.videoHeight);
    const ctx = c.getContext('2d')!;
    for (let i = 0; i < count; i++) {
      const t = Math.min(((i + 0.5) / count) * duration, Math.max(duration - 0.05, 0));
      v.currentTime = t;
      if (!(await waitFor(v, 'seeked', 4000))) break;
      ctx.drawImage(v, 0, 0, c.width, c.height);
      out.push(c.toDataURL('image/jpeg', 0.6));
    }
  } finally {
    v.removeAttribute('src');
    v.load();
  }
  return out;
}

async function imageInfo(file: File, url: string): Promise<{ w: number; h: number; thumb: string } | null> {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const c = canvasFor(img.naturalWidth, img.naturalHeight);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  void file;
  return { w: img.naturalWidth, h: img.naturalHeight, thumb: c.toDataURL('image/jpeg', 0.7) };
}

export type ProbeResult =
  { ok: true; info: Omit<Asset, 'id' | 'name' | 'mime' | 'size'> } | { ok: false; reason: string };

/** 音樂檔：長度、波形。Mediabunny 讀不了的格式再用 <audio> 讀長度（沒有波形）。 */
async function probeAudio(file: File, url: string): Promise<ProbeResult> {
  let duration = 0;
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    if (await input.getPrimaryAudioTrack()) duration = await input.computeDuration();
  } catch {
    /* 換 <audio> 試試 */
  } finally {
    input.dispose();
  }
  if (!(duration > 0)) {
    const a = document.createElement('audio');
    a.preload = 'metadata';
    a.src = url;
    if (await waitFor(a, 'loadedmetadata', 8000)) duration = a.duration;
    a.removeAttribute('src');
    a.load();
  }
  if (!(duration > 0) || !isFinite(duration)) return { ok: false, reason: '這個瀏覽器讀不了這個聲音檔' };
  const wave = await computeWave(file, duration);
  return {
    ok: true,
    info: {
      kind: 'audio',
      duration,
      width: 0,
      height: 0,
      hasAudio: true,
      thumbs: [],
      ...(wave ? { wave } : {}),
    },
  };
}

export async function probeMedia(file: File, kind: MediaKind): Promise<ProbeResult> {
  const url = URL.createObjectURL(file);
  try {
    if (kind === 'audio') return await probeAudio(file, url);
    if (kind === 'image') {
      const info = await imageInfo(file, url);
      if (!info) return { ok: false, reason: '這個瀏覽器讀不了這張圖片' };
      // GIF／動態 WebP：解一次看有幾格（超過上限或解不了就當一般照片）；解出來的格子立刻釋放，播放時才依需要再解
      let anim: Asset['anim'];
      if (file.size <= 12 * 1024 * 1024) {
        const d = await decodeAnimBlob(file).catch(() => null);
        if (d) {
          anim = { frames: d.frames.length, duration: d.duration };
          d.frames.forEach((f) => f.close());
        }
      }
      return {
        ok: true,
        info: {
          kind,
          duration: 0,
          width: info.w,
          height: info.h,
          hasAudio: false,
          thumbs: [info.thumb],
          ...(anim ? { anim } : {}),
        },
      };
    }
    const meta = (await probeVideoContainer(file)) ?? (await probeVideoElement(url));
    if (!meta || !(meta.duration > 0)) return { ok: false, reason: '讀不到影片資訊' };
    const count = Math.min(Math.max(Math.ceil(meta.duration), 1), 8);
    // 縮圖失敗絕對不能讓匯入失敗：任何錯誤都當作「沒有縮圖」，之後預覽播放器拿到畫面時會補
    let thumbs: string[] = [];
    try {
      if (canDecodeThumbs(meta.width, meta.height, file.size))
        thumbs = await mediabunnyThumbs(file, meta.duration, count);
      if (thumbs.length === 0) thumbs = await videoThumbs(url, meta.duration, count);
    } catch (e) {
      console.warn('[import] 縮圖失敗，之後補', e);
      thumbs = [];
    }
    return { ok: true, info: { kind, ...meta, thumbs } };
  } finally {
    URL.revokeObjectURL(url);
  }
}
