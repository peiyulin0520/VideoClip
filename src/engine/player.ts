import type { Asset, Project, Track, VideoItem } from '../model/types';
import { AudioOut, isIOSDevice } from './audio';
import { Compositor } from './compositor';
import { VideoPool } from './mediaPool';
import { captureThumb } from './probe';
import { buildScene } from './scene';
import { mainTrack, sourceTimeAt, totalDuration } from './timeline';

type Deps = {
  getProject: () => Project | null;
  urlFor: (assetId: string) => string | undefined;
  /** 素材沒有縮圖時，播放器拿到畫面後順手擷取一張（iPhone 匯入時可能產生不出來） */
  onThumb?: (assetId: string, thumbs: string[]) => void;
  /** iPhone 擋住了出聲播放（要使用者再按一次播放） */
  onAudioBlocked?: () => void;
};
type Listener = (t: number, playing: boolean) => void;

/** 影片和時鐘差超過這個秒數才硬跳（會頓一下）；小的差距用 playbackRate 慢慢追 */
const IOS = isIOSDevice();
const HARD_DRIFT = 0.5;
const SOFT_DRIFT = 0.04;
const PREFETCH_S = 1.0;
const POOL_SIZE = 6;

/** 播放中對時：diff = 該在的位置 − 影片目前位置（正的＝影片落後） */
export function driftPlan(diff: number, speed: number, soft = true): { seek: boolean; rate: number } {
  const a = Math.abs(diff);
  if (a > HARD_DRIFT) return { seek: true, rate: speed };
  // soft=false（iPhone）：不微調播放速度——改 playbackRate 會讓 Safari 的解碼卡一下，小差距就讓它去
  if (soft && a > SOFT_DRIFT)
    return { seek: false, rate: speed * (1 + Math.max(-0.15, Math.min(0.15, diff * 0.5))) };
  return { seek: false, rate: speed };
}

/** 預覽畫面的內部解析度：長邊 960（1:1 也是 960） */
export function previewSize(p: Pick<Project, 'width' | 'height'>): { width: number; height: number } {
  const k = 960 / Math.max(p.width, p.height);
  return { width: Math.round(p.width * k), height: Math.round(p.height * k) };
}

/**
 * 預覽播放引擎。時間由時鐘驅動；每個 t 算出要畫的圖層（主軌＋疊加＋文字…），
 * 影片物件各用一個 <video>（VideoPool），再交給 Pixi 合成到 canvas。
 * 即將開始的片段/疊加會提前載入並停在起點，切換時不會黑畫面。
 */
export class Player {
  private t = 0;
  private playing = false;
  private raf = 0;
  private renderRaf = 0;
  private wallStart = 0;
  private tStart = 0;
  private listeners = new Set<Listener>();
  private images = new Map<string, HTMLImageElement>();
  private thumbTried = new Set<string>();
  /** 除錯／測試用：播放時每秒畫了幾格、每格畫面合成花多久 */
  private statFrames = 0;
  private statSince = 0;
  private statMs = 0;
  private statFps = 0;
  private statAvgMs = 0;
  private statBuild = 0;
  private statComp = 0;
  private statUpload = 0;
  private accBuild = 0;
  private accComp = 0;
  private accUpload = 0;
  private seg = { build: 0, comp: 0, upload: 0 };
  private videoInfo = '';

  private constructor(
    readonly compositor: Compositor,
    private pool: VideoPool,
    private deps: Deps,
    readonly audio: AudioOut = new AudioOut(),
  ) {}

  static async create(opts: { host: HTMLElement; canvas: HTMLCanvasElement } & Deps): Promise<Player> {
    const p = opts.getProject();
    const size = p ? previewSize(p) : { width: 540, height: 960 };
    const compositor = await Compositor.create({ ...size, canvas: opts.canvas });
    let player: Player | null = null;
    const pool = new VideoPool(opts.host, POOL_SIZE, () => player?.scheduleRender());
    player = new Player(compositor, pool, opts);
    return player;
  }

  get time() {
    return this.t;
  }
  get isPlaying() {
    return this.playing;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const l of this.listeners) l(this.t, this.playing);
  }

  private total(): number {
    const p = this.deps.getProject();
    return p ? totalDuration(p) : 0;
  }

  seek(t: number) {
    this.t = Math.min(Math.max(t, 0), this.total());
    if (this.playing) {
      this.wallStart = performance.now();
      this.tStart = this.t;
    }
    this.render(this.t);
    this.emit();
  }

  /** 只更新畫面到 t 秒，不移動播放頭（修剪時預覽邊緣畫格用） */
  peek(t: number) {
    if (!this.playing) this.render(Math.min(Math.max(t, 0), this.total()));
  }

  play() {
    const total = this.total();
    if (total <= 0 || this.playing) return;
    if (this.t >= total - 0.01) this.t = 0;
    this.audio.unlock(); // 要在使用者點擊當下：解鎖聲音、設成「播放」類別（靜音模式也有聲音）
    this.playing = true;
    this.statSince = 0;
    this.statFrames = 0;
    this.statMs = 0;
    this.wallStart = performance.now();
    this.tStart = this.t;
    this.render(this.t); // 目前要播的影片在這裡同步 play()（還在點擊裡）
    this.pool.unlock(); // 其他停著等著的影片也趁現在解鎖
    this.emit();
    this.raf = requestAnimationFrame(this.tick);
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.render(this.t);
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  /** 專案內容改變後呼叫：修正播放頭並重新對畫面 */
  refresh() {
    const total = this.total();
    if (this.t > total) this.t = total;
    this.render(this.t);
    this.emit();
  }

  scheduleRender() {
    if (this.playing || this.renderRaf) return;
    this.renderRaf = requestAnimationFrame(() => {
      this.renderRaf = 0;
      if (!this.playing) this.render(this.t);
    });
  }

  private tick = () => {
    if (!this.playing) return;
    const total = this.total();
    const t = this.tStart + (performance.now() - this.wallStart) / 1000;
    if (t >= total) {
      this.t = total;
      this.playing = false;
      this.render(total);
      this.emit();
      return;
    }
    this.t = t;
    const r0 = performance.now();
    this.render(t);
    this.recordStats(r0);
    this.emit();
    this.raf = requestAnimationFrame(this.tick);
  };

  private recordStats(renderStart: number) {
    const now = performance.now();
    this.statMs += now - renderStart;
    this.accBuild += this.seg.build;
    this.accComp += this.seg.comp;
    this.accUpload += this.seg.upload;
    this.statFrames++;
    if (this.statSince === 0) this.statSince = now;
    if (now - this.statSince >= 1000) {
      this.statFps = (this.statFrames * 1000) / (now - this.statSince);
      this.statAvgMs = this.statMs / this.statFrames;
      this.statBuild = this.accBuild / this.statFrames;
      this.statComp = this.accComp / this.statFrames;
      this.statUpload = this.accUpload / this.statFrames;
      this.accBuild = this.accComp = this.accUpload = 0;
      this.statFrames = 0;
      this.statMs = 0;
      this.statSince = now;
    }
  }

  /** 最近一秒的播放畫格數與每格各段花的毫秒（算場景／影片上傳／整個合成）、掉格數、目前影片資訊 */
  stats(): {
    fps: number;
    renderMs: number;
    buildMs: number;
    compMs: number;
    uploadMs: number;
    dropped: number;
    video: string;
  } {
    let dropped = 0;
    for (const v of this.pool.els) {
      if (v.paused) continue;
      dropped += v.getVideoPlaybackQuality?.().droppedVideoFrames ?? 0;
    }
    return {
      fps: this.statFps,
      renderMs: this.statAvgMs,
      buildMs: this.statBuild,
      compMs: this.statComp,
      uploadMs: this.statUpload,
      dropped,
      video: this.videoInfo,
    };
  }

  private imageFor(assetId: string): HTMLImageElement | null {
    let img = this.images.get(assetId);
    if (!img) {
      const url = this.deps.urlFor(assetId);
      if (!url) return null;
      img = new Image();
      img.onload = () => this.scheduleRender();
      img.src = url;
      this.images.set(assetId, img);
    }
    return img;
  }

  private syncVideo(el: HTMLVideoElement, item: VideoItem, asset: Asset, track: Track, t: number) {
    const s = sourceTimeAt(item, t);
    this.audio.apply(el, item.volume, !!track.muted || !asset.hasAudio);
    if (this.playing) {
      const plan = driftPlan(s - el.currentTime, item.speed, !IOS);
      if (plan.seek) el.currentTime = s;
      if (el.playbackRate !== plan.rate) el.playbackRate = plan.rate;
      if (el.paused)
        el.play().catch((e: unknown) => {
          // 沒有出聲播放的許可（iPhone）：停下來請使用者再按一次播放（那一下點擊就能解鎖）
          if (e instanceof DOMException && e.name === 'NotAllowedError' && !el.muted) this.blocked();
        });
    } else {
      if (el.playbackRate !== item.speed) el.playbackRate = item.speed;
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - s) > 0.02) el.currentTime = s;
    }
  }

  private blocked() {
    if (!this.playing) return;
    this.pause();
    this.deps.onAudioBlocked?.();
  }

  private render(t: number) {
    const p = this.deps.getProject();
    const { compositor: comp } = this;
    if (!p) {
      comp.render([]);
      return;
    }
    const used = new Set<HTMLVideoElement>();

    const t0 = performance.now();
    const scene = buildScene(p, t, comp.width, comp.height, (item, asset, track) => {
      const url = this.deps.urlFor(asset.id);
      if (!url) return null;
      if (item.type === 'image') {
        const img = this.imageFor(asset.id);
        if (!img) return null;
        return {
          source: img,
          ready: img.complete && img.naturalWidth > 0,
          srcW: img.naturalWidth || asset.width,
          srcH: img.naturalHeight || asset.height,
        };
      }
      const el = this.pool.acquire(item.id, asset.id, url, used);
      if (!el) return null; // 同時疊的影片超過上限，多的不畫
      used.add(el);
      this.syncVideo(el, item, asset, track, t);
      this.maybeCaptureThumb(el, asset);
      if (track.kind === 'main' && el.videoWidth)
        this.videoInfo = `${el.videoWidth}×${el.videoHeight} ${asset.codec ?? ''}${asset.hdr ? ' HDR' : ''}｜預覽檔：${asset.proxy?.status ?? '無'}`;
      return {
        source: el,
        ready: el.readyState >= 2 && !el.seeking && el.videoWidth > 0,
        srcW: el.videoWidth || asset.width,
        srcH: el.videoHeight || asset.height,
      };
    });

    // 預載：下一個主軌片段、1 秒內要開始的疊加影片
    for (const { item, asset } of this.upcoming(p, t)) {
      const url = this.deps.urlFor(asset.id);
      if (!url) continue;
      const el = this.pool.acquire(item.id, asset.id, url, used);
      if (!el) continue;
      used.add(el);
      if (el.dataset.primed !== '1') {
        el.currentTime = item.trimIn;
        el.dataset.primed = '1';
      }
      if (!el.paused) el.pause();
    }
    this.pool.pauseAllExcept(used);
    const t1 = performance.now();
    comp.render(scene);
    const t2 = performance.now();
    this.seg = { build: t1 - t0, comp: t2 - t1, upload: comp.takeUploadMs() };
  }

  private maybeCaptureThumb(el: HTMLVideoElement, asset: Asset) {
    if (!this.deps.onThumb || asset.thumbs.length > 0 || this.thumbTried.has(asset.id)) return;
    if (el.seeking || el.readyState < 2) return;
    const url = captureThumb(el);
    if (!url) return;
    this.thumbTried.add(asset.id);
    // render() 進行中不要改 store，等這一輪結束
    queueMicrotask(() => this.deps.onThumb?.(asset.id, [url]));
  }

  private upcoming(p: Project, t: number): { item: VideoItem; asset: Asset }[] {
    const out: { item: VideoItem; asset: Asset }[] = [];
    const push = (item: VideoItem) => {
      if (item.type !== 'video') return;
      const asset = p.assets.find((a) => a.id === item.assetId);
      if (asset) out.push({ item, asset });
    };
    for (const track of p.tracks) {
      if (track.hidden) continue;
      const items = track.items;
      if (track.kind === 'main') {
        const cur = (items as VideoItem[]).findIndex((x) => t < x.start + x.duration);
        const next = items[cur + 1] as VideoItem | undefined;
        if (cur >= 0 && next) push(next);
      } else if (track.kind === 'overlay') {
        for (const it of items as VideoItem[]) if (it.start > t && it.start <= t + PREFETCH_S) push(it);
      }
    }
    return out;
  }

  /** 預覽主軌目前的片段 id（測試用） */
  currentMainItemId(): string | undefined {
    const p = this.deps.getProject();
    if (!p) return undefined;
    return mainTrack(p).items.find((x) => this.t < x.start + x.duration)?.id;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.renderRaf);
    this.playing = false;
    this.listeners.clear();
    this.pool.destroy();
    this.audio.destroy();
    this.compositor.destroy();
  }
}
