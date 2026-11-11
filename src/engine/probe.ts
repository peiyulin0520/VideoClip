import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import type { Asset } from '../model/types';

export type MediaKind = 'video' | 'image';

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|3gp|avi)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i;

export function mediaKindOf(file: File): MediaKind | null {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  if (VIDEO_EXT.test(file.name)) return 'video';
  if (IMAGE_EXT.test(file.name)) return 'image';
  return null;
}

type Probed = Pick<Asset, 'duration' | 'width' | 'height' | 'hasAudio'>;

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
    return { duration, width: v.displayWidth, height: v.displayHeight, hasAudio: !!a };
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

async function videoThumbs(url: string, duration: number, count: number): Promise<string[]> {
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

export async function probeMedia(file: File, kind: MediaKind): Promise<ProbeResult> {
  const url = URL.createObjectURL(file);
  try {
    if (kind === 'image') {
      const info = await imageInfo(file, url);
      if (!info) return { ok: false, reason: '這個瀏覽器讀不了這張圖片' };
      return {
        ok: true,
        info: { kind, duration: 0, width: info.w, height: info.h, hasAudio: false, thumbs: [info.thumb] },
      };
    }
    const meta = (await probeVideoContainer(file)) ?? (await probeVideoElement(url));
    if (!meta || !(meta.duration > 0)) return { ok: false, reason: '讀不到影片資訊' };
    const thumbs = await videoThumbs(url, meta.duration, Math.min(Math.max(Math.ceil(meta.duration), 1), 8));
    return { ok: true, info: { kind, ...meta, thumbs } };
  } finally {
    URL.revokeObjectURL(url);
  }
}
