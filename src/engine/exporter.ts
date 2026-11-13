import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
  type StreamTargetChunk,
  type Target,
} from 'mediabunny';
import type { Asset, Project, VideoItem } from '../model/types';
import { getMedia } from '../storage/media';
import { animBitmapAt } from './animImage';
import { fadeSpans } from './audio';
import { Compositor } from './compositor';
import { buildScene, sceneItems } from './scene';
import { preloadMasks } from './maskBitmap';
import { sourceTimeClamped, totalDuration } from './timeline';

// 匯出整支影片（PLAN §2.4）：不播放，一格一格依時間走——
// 影片用 Mediabunny 解碼指定時間的那一格，畫面走跟預覽同一套 buildScene＋Compositor（輸出解析度），
// 每一格交給 WebCodecs 編碼；聲音用 OfflineAudioContext 依時間軸一次混好再編碼；封裝成 MP4（H.264＋AAC）。
// 這支手機編不出 AAC → 先輸出無聲 MP4 並明講；編不出 H.264（沙盒 Chromium）→ WebM（VP9＋Opus），只給測試用。

export type ExportQuality = 'standard' | 'high';
export type ExportOptions = {
  /** 只給測試用：強制輸出 WebM（VP9＋Opus）——沙盒的 Chromium 編不出 AAC，要測聲音只能走這條 */
  preferWebm?: boolean;
  /** 長邊像素：1920（1080p）或 1280（720p） */
  longSide: 1920 | 1280;
  fps: 30 | 60;
  quality: ExportQuality;
};
export type ExportPhase = '準備' | '聲音' | '畫面' | '收尾';
export type ExportProgress = { fraction: number; phase: ExportPhase; frame: number; frames: number };

export type ExportResult = {
  file: File;
  mime: string;
  ext: 'mp4' | 'webm';
  width: number;
  height: number;
  fps: number;
  duration: number;
  hasAudio: boolean;
  videoCodec: string;
  audioCodec: string | null;
  warnings: string[];
  /** 用完（存好、分享完、關掉面板）呼叫：刪掉暫存檔 */
  dispose: () => Promise<void>;
};

export class ExportCancelled extends Error {
  constructor() {
    super('已取消匯出');
    this.name = 'ExportCancelled';
  }
}

// ---------- 純計算（有單元測試） ----------

/** 輸出尺寸：長邊縮到 longSide（不放大），偶數 */
export function outputSize(
  project: Pick<Project, 'width' | 'height'>,
  longSide: number,
): { width: number; height: number } {
  const k = Math.min(longSide / Math.max(project.width, project.height, 1), 1);
  const even = (n: number) => Math.max(Math.round((n * k) / 2) * 2, 2);
  return { width: even(project.width), height: even(project.height) };
}

/** 影片位元率（bps）：1080×1920、30fps 標準 8 Mbps／高 14 Mbps，依像素與更新率調整 */
export function videoBitrate(width: number, height: number, fps: number, quality: ExportQuality): number {
  const base = quality === 'high' ? 14_000_000 : 8_000_000;
  const pixels = (width * height) / (1080 * 1920);
  const rate = fps > 30 ? 1.5 : 1;
  return Math.max(Math.round(base * Math.min(Math.max(pixels, 0.25), 2) * rate), 1_000_000);
}
export const AUDIO_BITRATE = 192_000;

/** 預估檔案大小（bytes），畫面上先告訴使用者 */
export function estimateBytes(project: Project, o: ExportOptions): number {
  const { width, height } = outputSize(project, o.longSide);
  const bits = videoBitrate(width, height, o.fps, o.quality) + AUDIO_BITRATE;
  return Math.round((bits * totalDuration(project)) / 8);
}

export type Capabilities = { avc: boolean; aac: boolean; vp9: boolean; opus: boolean };
export type FormatChoice = {
  container: 'mp4' | 'webm';
  videoCodec: 'avc' | 'vp9';
  /** null＝輸出沒有聲音 */
  audioCodec: 'aac' | 'opus' | null;
  warnings: string[];
};

/** 依這個瀏覽器能編的格式決定封裝。編不出 AAC 要輸出無聲 MP4 並明講，不能偷偷失敗。 */
export function chooseFormat(c: Capabilities, wantsAudio: boolean, preferWebm = false): FormatChoice | null {
  if (c.avc && !(preferWebm && c.vp9)) {
    const warnings: string[] = [];
    if (wantsAudio && !c.aac)
      warnings.push(
        '這支手機的瀏覽器編不出 AAC 聲音，匯出的影片沒有聲音。要有聲音，可以在 Instagram 發佈時再加音樂。',
      );
    return { container: 'mp4', videoCodec: 'avc', audioCodec: c.aac ? 'aac' : null, warnings };
  }
  if (c.vp9) {
    const warnings = ['這個瀏覽器編不出 H.264，輸出的是 WebM（Instagram 和相簿可能不能直接用）。'];
    if (wantsAudio && !c.opus) warnings.push('也編不出聲音，匯出的影片沒有聲音。');
    return { container: 'webm', videoCodec: 'vp9', audioCodec: c.opus ? 'opus' : null, warnings };
  }
  return null;
}

async function detect(width: number, height: number, bitrate: number): Promise<Capabilities> {
  const safe = (p: Promise<boolean>) => p.catch(() => false);
  const [avc, vp9, aac, opus] = await Promise.all([
    safe(canEncodeVideo('avc', { width, height, bitrate })),
    safe(canEncodeVideo('vp9', { width, height, bitrate })),
    safe(canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000, bitrate: AUDIO_BITRATE })),
    safe(canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: 48000, bitrate: AUDIO_BITRATE })),
  ]);
  return { avc, vp9, aac, opus };
}

// ---------- 影片畫面來源 ----------

type FrameCanvas = HTMLCanvasElement | OffscreenCanvas;

/** 一個影片素材的「取某個時間那一格」。優先用 Mediabunny（WebCodecs）精準取格；解不了才用 <video> 慢慢 seek。 */
class VideoFrames {
  private constructor(
    private input: Input | null,
    private sink: CanvasSink | null,
    private video: HTMLVideoElement | null,
    private url: string | null,
  ) {}

  static async open(file: Blob, maxSide: number): Promise<VideoFrames> {
    try {
      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
      const track = await input.getPrimaryVideoTrack();
      if (track && (await track.canDecode())) {
        const k = Math.min(maxSide / Math.max(track.displayWidth, track.displayHeight, 1), 1);
        const sink = new CanvasSink(track, {
          width: Math.max(Math.round(track.displayWidth * k), 2),
          height: Math.max(Math.round(track.displayHeight * k), 2),
          fit: 'fill',
          poolSize: 2,
        });
        return new VideoFrames(input, sink, null, null);
      }
      input.dispose();
    } catch {
      /* 改用 <video> */
    }
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    await new Promise<void>((ok, bad) => {
      v.addEventListener('loadeddata', () => ok(), { once: true });
      v.addEventListener('error', () => bad(new Error('這支影片這個瀏覽器讀不了')), { once: true });
    });
    return new VideoFrames(null, null, v, url);
  }

  async frameAt(t: number): Promise<{ source: FrameCanvas | HTMLVideoElement; w: number; h: number } | null> {
    if (this.sink) {
      const wrapped = await this.sink.getCanvas(Math.max(t, 0));
      return wrapped ? { source: wrapped.canvas, w: wrapped.canvas.width, h: wrapped.canvas.height } : null;
    }
    const v = this.video!;
    const target = Math.min(Math.max(t, 0), Math.max(v.duration - 0.01, 0));
    if (Math.abs(v.currentTime - target) > 0.001) {
      v.currentTime = target;
      await new Promise<void>((ok) => v.addEventListener('seeked', () => ok(), { once: true }));
    }
    return { source: v, w: v.videoWidth, h: v.videoHeight };
  }

  dispose() {
    this.input?.dispose();
    if (this.video) {
      this.video.removeAttribute('src');
      this.video.load();
    }
    if (this.url) URL.revokeObjectURL(this.url);
  }
}

// ---------- 聲音混音 ----------

/** 影片物件要不要出聲：素材有音軌、軌道沒靜音沒隱藏、音量 > 0 */
export function audibleItems(project: Project): { item: VideoItem; asset: Asset }[] {
  const out: { item: VideoItem; asset: Asset }[] = [];
  for (const track of project.tracks) {
    if (track.kind === 'text' || track.muted || track.hidden) continue;
    for (const it of track.items) {
      if ((it.type !== 'video' && it.type !== 'audio') || it.volume <= 0) continue; // 影片與背景音樂
      const asset = project.assets.find((a) => a.id === it.assetId);
      if (asset?.hasAudio) out.push({ item: it, asset });
    }
  }
  return out;
}

/** 用 OfflineAudioContext 依時間軸把所有影片的聲音混成一個立體聲 AudioBuffer；沒有任何聲音回傳 null */
async function mixAudio(
  project: Project,
  getFile: (asset: Asset) => Promise<Blob>,
  signal: AbortSignal | undefined,
): Promise<AudioBuffer | null> {
  const items = audibleItems(project);
  if (items.length === 0) return null;
  const total = totalDuration(project);
  const sr = 48000;
  const ctx = new OfflineAudioContext(2, Math.max(Math.ceil(total * sr), sr), sr);
  let any = false;
  for (const { item, asset } of items) {
    if (signal?.aborted) throw new ExportCancelled();
    const input = new Input({ source: new BlobSource(await getFile(asset)), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) continue;
      const sink = new AudioBufferSink(track);
      // 這個物件自己一個音量節點：音量、淡入淡出都在這裡（時間單位是時間軸秒數）
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      const { fi, fo } = fadeSpans(item.duration, item.fadeIn, item.fadeOut);
      const endAt = item.start + item.duration;
      gain.gain.setValueAtTime(fi > 0 ? 0 : item.volume, item.start);
      if (fi > 0) gain.gain.linearRampToValueAtTime(item.volume, item.start + fi);
      if (fo > 0) {
        gain.gain.setValueAtTime(item.volume, endAt - fo);
        gain.gain.linearRampToValueAtTime(0, endAt);
      }
      const srcStart = item.trimIn;
      const srcEnd = item.trimIn + item.duration * item.speed;
      for await (const wb of sink.buffers(srcStart, srcEnd)) {
        const from = Math.max(wb.timestamp, srcStart);
        const to = Math.min(wb.timestamp + wb.buffer.duration, srcEnd);
        if (to - from < 1e-4) continue;
        const node = ctx.createBufferSource();
        node.buffer = wb.buffer;
        node.playbackRate.value = item.speed;
        node.connect(gain);
        node.start(item.start + (from - srcStart) / item.speed, from - wb.timestamp, to - from);
        any = true;
      }
    } finally {
      input.dispose();
    }
  }
  if (!any) return null;
  return ctx.startRendering();
}

// ---------- 輸出目標（寫到 OPFS 暫存檔，不整支放記憶體） ----------

async function openTarget(): Promise<{
  target: Target;
  finish: (mime: string, name: string) => Promise<File>;
  dispose: () => Promise<void>;
}> {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('exports', { create: true });
    const entry = `export-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const fh = await dir.getFileHandle(entry, { create: true });
    const writable = await fh.createWritable();
    const target = new StreamTarget(writable as unknown as WritableStream<StreamTargetChunk>);
    const dispose = () => dir.removeEntry(entry).catch(() => {});
    return {
      target,
      finish: async (mime, name) => new File([await fh.getFile()], name, { type: mime }),
      dispose,
    };
  } catch {
    const target = new BufferTarget();
    return {
      target,
      finish: async (mime, name) => new File([target.buffer ?? new ArrayBuffer(0)], name, { type: mime }),
      dispose: async () => {},
    };
  }
}

/** 啟動時清掉上次沒清乾淨的暫存檔（匯出到一半關掉網頁） */
export async function cleanupExportTemp(): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('exports', { recursive: true });
  } catch {
    /* 沒有就算了 */
  }
}

// ---------- 主流程 ----------

export async function exportProject(
  project: Project,
  options: ExportOptions,
  hooks: {
    onProgress?: (p: ExportProgress) => void;
    signal?: AbortSignal;
    /** 取素材原檔（預設從儲存空間讀；測試可以換掉） */
    getFile?: (asset: Asset) => Promise<Blob>;
  } = {},
): Promise<ExportResult> {
  const { signal } = hooks;
  const getFile = hooks.getFile ?? ((a: Asset) => getMedia(project.id, a.id, a.mime));
  const check = () => {
    if (signal?.aborted) throw new ExportCancelled();
  };
  const total = totalDuration(project);
  if (total <= 0) throw new Error('還沒有內容可以匯出');
  const { width, height } = outputSize(project, options.longSide);
  const fps = options.fps;
  const frames = Math.max(Math.round(total * fps), 1);
  const vBitrate = videoBitrate(width, height, fps, options.quality);
  const progress = (phase: ExportPhase, frame: number, fraction: number) =>
    hooks.onProgress?.({ phase, frame, frames, fraction });

  progress('準備', 0, 0);
  const wantsAudio = audibleItems(project).length > 0;
  const choice = chooseFormat(await detect(width, height, vBitrate), wantsAudio, options.preferWebm);
  if (!choice) throw new Error('這個瀏覽器不能輸出影片（編不出 H.264 也編不出 VP9）');
  const warnings = [...choice.warnings];

  // 1. 聲音：先混好（失敗只影響聲音，不讓整個匯出失敗）
  let audio: AudioBuffer | null = null;
  if (choice.audioCodec) {
    progress('聲音', 0, 0.02);
    try {
      audio = await mixAudio(project, getFile, signal);
    } catch (e) {
      if (e instanceof ExportCancelled) throw e;
      console.warn('[export] 混音失敗，輸出無聲影片', e);
      warnings.push('聲音處理失敗，匯出的影片沒有聲音。');
    }
  }
  check();

  const ext = choice.container;
  const mime = ext === 'mp4' ? 'video/mp4' : 'video/webm';
  const name = `${(project.name || 'VideoClip').replace(/[\\/:*?"<>|]/g, '_')}.${ext}`;
  const out = await openTarget();
  await preloadMasks(project); // 筆刷／橡皮擦畫的遮罩要先解好
  const comp = await Compositor.create({ width, height });
  const frameSources = new Map<string, VideoFrames>();
  const images = new Map<string, HTMLImageElement>();
  let output: Output | null = null;
  try {
    const videoSource = new CanvasSource(comp.canvas, {
      codec: choice.videoCodec,
      bitrate: vBitrate,
      keyFrameInterval: 2,
    });
    output = new Output({
      format: ext === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
      target: out.target,
    });
    output.addVideoTrack(videoSource, { frameRate: fps });
    let audioSource: AudioBufferSource | null = null;
    if (audio && choice.audioCodec) {
      audioSource = new AudioBufferSource({ codec: choice.audioCodec, bitrate: AUDIO_BITRATE });
      output.addAudioTrack(audioSource);
    }
    await output.start();
    if (audioSource && audio) {
      await audioSource.add(audio);
      audioSource.close();
    }

    // 2. 畫面：一格一格
    for (let i = 0; i < frames; i++) {
      check();
      const t = i / fps;
      const prepared = new Map<
        string,
        { source: FrameCanvas | HTMLVideoElement | HTMLImageElement | ImageBitmap; w: number; h: number }
      >();
      await Promise.all(
        sceneItems(project, t).map(async ({ item }) => {
          if (item.type === 'text') return;
          const asset = project.assets.find((a) => a.id === item.assetId);
          if (!asset) return;
          if (item.type === 'image') {
            if (asset.anim) {
              const bmp = await animBitmapAt(asset.id, async () => getFile(asset), t - item.start);
              if (bmp) return void prepared.set(item.id, { source: bmp, w: bmp.width, h: bmp.height });
            }
            let img = images.get(asset.id);
            if (!img) {
              img = new Image();
              const url = URL.createObjectURL(await getFile(asset));
              img.src = url;
              await img.decode();
              images.set(asset.id, img);
            }
            return void prepared.set(item.id, { source: img, w: img.naturalWidth, h: img.naturalHeight });
          }
          let vf = frameSources.get(asset.id);
          if (!vf) {
            vf = await VideoFrames.open(await getFile(asset), Math.round(Math.max(width, height) * 1.5));
            frameSources.set(asset.id, vf);
          }
          const f = await vf.frameAt(sourceTimeClamped(item, t, asset));
          if (f) prepared.set(item.id, { source: f.source, w: f.w, h: f.h });
        }),
      );
      const scene = buildScene(project, t, width, height, (item, asset) => {
        const p = prepared.get(item.id);
        return p
          ? {
              source: p.source as HTMLVideoElement | HTMLImageElement | ImageBitmap,
              ready: true,
              srcW: p.w || asset.width,
              srcH: p.h || asset.height,
            }
          : null;
      });
      comp.render(scene);
      await videoSource.add(t, 1 / fps);
      if (i % 3 === 0 || i === frames - 1) {
        const f = (i + 1) / frames;
        progress('畫面', i + 1, 0.05 + f * 0.9);
      }
    }
    videoSource.close();
    check();
    progress('收尾', frames, 0.97);
    await output.finalize();
    const file = await out.finish(mime, name);
    progress('收尾', frames, 1);
    return {
      file,
      mime,
      ext,
      width,
      height,
      fps,
      duration: total,
      hasAudio: !!audioSource,
      videoCodec: choice.videoCodec,
      audioCodec: audioSource ? choice.audioCodec : null,
      warnings,
      dispose: out.dispose,
    };
  } catch (e) {
    await output?.cancel().catch(() => {});
    await out.dispose();
    throw e;
  } finally {
    comp.destroy();
    frameSources.forEach((f) => f.dispose());
    images.forEach((img) => URL.revokeObjectURL(img.src));
  }
}
