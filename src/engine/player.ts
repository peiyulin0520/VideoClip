import type { Asset, Project, Track, VideoItem } from '../model/types';
import { frameIndexAt, loadAnim, peekAnim } from './animImage';
import { AudioOut, fadeGain, isIOSDevice } from './audio';
import { Compositor } from './compositor';
import { stageLayout } from './stage';
import { VideoPool } from './mediaPool';
import { expandThumbs, thumbCount, thumbIndex } from './thumbs';
import { activeTransition, earlyOf, transitionAudioGain, transitionSpan } from './transitions';
import { showPlaceholders } from './placeholder';
import { driftPlan, videoSyncPlan } from './videoSync';
import { captureThumb } from './probe';
import { buildScene, canTransition } from './scene';
import { previewSizeFor } from './previewQuality';
import { thumbOf } from './labels';
import { onMaskReady } from './maskBitmap';
import { audioRetained } from './audioRanges';
import { baseMediaTrack, sourceTimeAt, sourceTimeClamped, totalDuration } from './timeline';

type Deps = {
  getProject: () => Project | null;
  urlFor: (assetId: string) => string | undefined;
  /** 素材沒有縮圖時，播放器拿到畫面後順手擷取一張（iPhone 匯入時可能產生不出來） */
  onThumb?: (assetId: string, thumbs: string[]) => void;
  /** iPhone 擋住了出聲播放（要使用者再按一次播放） */
  onAudioBlocked?: () => void;
  /** 播放了幾秒，同時有 2 支以上影片，平均每秒不到 20 格：建議改用流暢預覽（只通知一次） */
  onSlow?: () => void;
  /** 流暢預覽（畫布小一半） */
  smooth?: boolean;
  /** 同時要播的影片超過影片池上限，多的格子先改畫縮圖（只通知一次） */
  onPoolFull?: () => void;
};
type Listener = (t: number, playing: boolean) => void;

/** 影片和時鐘差超過這個秒數才硬跳（會頓一下）；小的差距用 playbackRate 慢慢追 */
const IOS = isIOSDevice();
const PREFETCH_S = 1.0;
/** 有轉場的片段多提前這麼多秒開始準備（要同時解兩支影片，來不及會卡） */
const PREFETCH_TRANSITION_S = 2.5;
/** 轉場的 B 提早這麼多秒開始（靜音）播放暖機 */
const WARM_S = 1.2;
const POOL_SIZE = 6;
const MUSIC_POOL_SIZE = 3;

export { driftPlan };

/** 預覽畫面的內部解析度：長邊 960（1:1 也是 960）；流暢預覽 480 */
export function previewSize(
  p: Pick<Project, 'width' | 'height'>,
  smooth = false,
  aspect?: number,
): { width: number; height: number } {
  return previewSizeFor(p, smooth, aspect);
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
  /** 播放時逐格補縮圖：每個素材補過哪幾格、上次補的時間 */
  private thumbSlots = new Map<string, Set<number>>();
  private thumbAt = new Map<string, number>();
  /** 除錯／測試用：播放時每秒畫了幾格、每格畫面合成花多久 */
  private statFrames = 0;
  private statSince = 0;
  private statMs = 0;
  private statFps = 0;
  private statAvgMs = 0;
  private statBuild = 0;
  private statComp = 0;
  private statUpload = 0;
  private statPrep = 0;
  private statDraw = 0;
  private statGpu = 0;
  private accPrep = 0;
  private accDraw = 0;
  private accGpu = 0;
  private accBuild = 0;
  private accComp = 0;
  private accUpload = 0;
  private seg = { build: 0, comp: 0, upload: 0, prep: 0, draw: 0, gpu: 0 };
  private videoInfo = '';
  /** 這一刻正在轉場的片段 id（A、B）：對時規則放寬、統計轉場掉格 */
  private transIds = new Set<string>();
  /** 每個影片物件最後一次套用的聲音倍數（測試、效能框用） */
  private gains = new Map<string, number>();
  private trans = { frames: 0, drops: 0, hardSeeks: 0, lastAt: 0, lastSeek: '' };
  /** 這個物件畫面真的出現過（影片 ready 過）：還沒出現過、又還沒準備好的，用縮圖頂著 */
  private everReady = new Set<string>();
  private transHeavyTold = false;
  private videoCount = 0;
  /** 效能框用：這一格正在解碼的每支影片（解碼後的大小、用預覽檔還是原檔）、播放中每秒格數的最低值 */
  private sources: string[] = [];
  private fpsMin = Infinity;
  private poolFullTold = false;
  offMask: (() => void) | null = null;
  private thumbImgs = new Map<string, HTMLImageElement>();
  private slowSecs = 0;
  private slowTold = false;
  /** 「看原色」：這些物件（或 'all'＝整個專案）暫時不調色（不改專案資料、不進復原紀錄） */
  private bypass: Set<string> | 'all' | null = null;
  /** 裁切模式：暫時把某個物件換成「完整畫面」來畫（不改專案資料） */
  private patch: { itemId: string; apply: (it: VideoItem) => VideoItem } | null = null;

  private constructor(
    readonly compositor: Compositor,
    private pool: VideoPool,
    private music: VideoPool,
    private deps: Deps,
    readonly audio: AudioOut = new AudioOut(),
  ) {}

  static async create(
    opts: { host: HTMLElement; canvas: HTMLCanvasElement; aspect?: number } & Deps,
  ): Promise<Player> {
    const p = opts.getProject();
    const size = p ? previewSize(p, opts.smooth, opts.aspect) : { width: 540, height: 960 };
    const lay = stageLayout(size.width, size.height, opts.aspect);
    const compositor = await Compositor.create({
      ...size,
      canvas: opts.canvas,
      canvasWidth: lay.baseW,
      canvasHeight: lay.baseH,
      offsetX: lay.offX,
      offsetY: lay.offY,
    });
    let player: Player | null = null;
    const pool = new VideoPool(opts.host, POOL_SIZE, () => player?.scheduleRender());
    const music = new VideoPool(opts.host, MUSIC_POOL_SIZE, () => {}, 'audio');
    player = new Player(compositor, pool, music, opts);
    const p2 = player;
    p2.offMask = onMaskReady(() => p2.scheduleRender());
    return player;
  }

  get time() {
    return this.t;
  }
  get isPlaying() {
    return this.playing;
  }
  /** 最近一次畫的畫面是不是全部準備好了（換預覽畫質重建引擎時，等它好了才拿掉暫存的舊畫面） */
  private settledNow = false;
  get settled() {
    return this.settledNow;
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
    this.music.unlock(); // 背景音樂的 <audio> 也一樣要在點擊裡解鎖
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
    this.accPrep += this.seg.prep;
    this.accDraw += this.seg.draw;
    this.accGpu += this.seg.gpu;
    this.statFrames++;
    if (this.statSince === 0) this.statSince = now;
    if (now - this.statSince >= 1000) {
      this.statFps = (this.statFrames * 1000) / (now - this.statSince);
      if (this.playing) this.fpsMin = Math.min(this.fpsMin, this.statFps);
      else this.fpsMin = Infinity;
      // 連續 3 秒：播放中、同時 2 支以上影片、每秒不到 20 格 → 建議流暢預覽
      if (this.playing && this.videoCount >= 2 && this.statFps < 20) this.slowSecs++;
      else this.slowSecs = 0;
      if (this.slowSecs >= 3 && !this.slowTold) {
        this.slowTold = true;
        this.deps.onSlow?.();
      }
      this.statAvgMs = this.statMs / this.statFrames;
      this.statBuild = this.accBuild / this.statFrames;
      this.statComp = this.accComp / this.statFrames;
      this.statUpload = this.accUpload / this.statFrames;
      this.statPrep = this.accPrep / this.statFrames;
      this.statDraw = this.accDraw / this.statFrames;
      this.statGpu = this.accGpu / this.statFrames;
      this.accBuild = this.accComp = this.accUpload = this.accPrep = this.accDraw = this.accGpu = 0;
      this.statFrames = 0;
      this.statMs = 0;
      this.statSince = now;
    }
  }

  /** 最近一秒的播放畫格數與每格各段花的毫秒（算場景／影片上傳／整個合成）、掉格數、目前影片資訊 */
  /** 每個影片物件目前的聲音倍數（含轉場聲音） */
  audioGains(): Record<string, number> {
    return Object.fromEntries(this.gains);
  }

  /** 效能框要看「等 GPU」那一段時打開（每格多等一次 gl.finish，會稍微拖慢） */
  setMeasureGpu(on: boolean) {
    this.compositor.measureGpu = on;
  }

  stats(): {
    fps: number;
    renderMs: number;
    buildMs: number;
    compMs: number;
    uploadMs: number;
    /** 合成再拆開：準備圖層、送出繪製（含影片貼圖上傳）、等 GPU 畫完（要開「顯示播放效能」才量） */
    prepMs: number;
    drawMs: number;
    gpuMs: number;
    /** 播放中真的重畫了幾格、因為畫面沒變而跳過幾格（累計） */
    renders: number;
    skipped: number;
    dropped: number;
    video: string;
    /** 最近一次轉場：畫了幾格、兩格間隔超過 50ms 的次數、為了追時間硬 seek 的次數 */
    transition: { frames: number; drops: number; hardSeeks: number; lastSeek: string };
    /** 目前每支在解碼的影片：解碼大小＋預覽檔／原檔 */
    sources: string[];
    /** 同時在用的影片數、影片池裡總共開著幾個解碼器 */
    decoders: number;
    pool: number;
    /** 預覽合成畫布的大小 */
    canvas: string;
    /** 這次播放中每秒格數的最低值（0＝還沒播） */
    fpsMin: number;
    /** 聲音（AudioContext）狀態 */
    audio: string;
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
      prepMs: this.statPrep,
      drawMs: this.statDraw,
      gpuMs: this.statGpu,
      renders: this.compositor.renders,
      skipped: this.compositor.skipped,
      dropped,
      video: this.videoInfo,
      transition: {
        frames: this.trans.frames,
        drops: this.trans.drops,
        hardSeeks: this.trans.hardSeeks,
        lastSeek: this.trans.lastSeek,
      },
      sources: this.sources,
      decoders: this.videoCount,
      pool: this.pool.els.length,
      canvas: `${this.compositor.width}×${this.compositor.height}`,
      fpsMin: Number.isFinite(this.fpsMin) ? this.fpsMin : 0,
      audio: this.audio.state,
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
    const s = sourceTimeClamped(item, t, asset);
    // 轉場裡的虛擬物件（提前出現的 B、延長的 A）是靜音的；聲音改用「原本的物件」＋轉場聲音倍數算，兩段才能交叉淡化
    const orig = (track.items.find((x) => x.id === item.id) as VideoItem | undefined) ?? item;
    let tg = transitionAudioGain(track.items, orig, t);
    if (this.audio.mode === 'element') tg = tg >= 0.5 ? 1 : 0; // 舊 iPhone 只能開／關
    const vol =
      orig.volume *
      fadeGain(t - orig.start, orig.duration, orig.fadeIn, orig.fadeOut) *
      (audioRetained(orig, s) ? 1 : 0) *
      tg;
    // 版型格子空檔裡的停格：沒有聲音、暫停在那一格（不 play()）
    const held = !!item.hold;
    const vol2 = held ? 0 : vol;
    this.gains.set(item.id, vol2);
    this.audio.apply(el, vol2, !!track.muted || !asset.hasAudio);
    if (held) {
      if (!el.paused) el.pause();
      if (!el.seeking && Math.abs(el.currentTime - s) > 0.05) el.currentTime = s;
      return;
    }
    if (this.playing) {
      const transitioning = this.transIds.has(item.id);
      // 後一段（B）：從暖機到轉場結束後 1 秒是保護期，不輕易硬 seek（seek 中的影片沒有畫面，轉場會黑掉）
      const span = orig.transitionIn ? transitionSpan(track.items, orig) : null;
      const protect = !!span && t >= span.cut - span.before - WARM_S && t < span.cut + span.after + 1;
      const plan = videoSyncPlan({
        target: s,
        current: el.currentTime,
        duration: asset.duration,
        speed: item.speed,
        ended: el.ended,
        seeking: el.seeking,
        soft: !IOS,
        transitioning,
        protect,
      });
      if (plan.seekTo !== undefined) {
        if (plan.hardSeek && transitioning) {
          this.trans.hardSeeks++;
          this.trans.lastSeek = `${orig.transitionIn ? '後段' : '前段'} 目標 ${s.toFixed(2)} 實際 ${el.currentTime.toFixed(2)}`;
        }
        el.currentTime = plan.seekTo;
      }
      // 素材放完了／還沒到開頭：停在那一格，不要呼叫 play()（ended 的影片 play() 會從頭播）
      if (plan.hold) {
        if (!el.paused) el.pause();
        return;
      }
      if (el.playbackRate !== plan.rate) el.playbackRate = plan.rate;
      if (el.paused)
        el.play().catch((e: unknown) => {
          // 沒有出聲播放的許可（iPhone）：停下來請使用者再按一次播放（那一下點擊就能解鎖）
          if (e instanceof DOMException && e.name === 'NotAllowedError' && !el.muted) this.blocked();
        });
    } else {
      if (el.playbackRate !== item.speed) el.playbackRate = item.speed;
      if (!el.paused) el.pause();
      // 還在 seek 的時候不要再設新的時間：iPhone 上往回拖很慢，前一個 seek 還沒完成就又設新的，
      // 會一直在 seeking、畫面一直沒準備好（預覽上只剩白框）。seeked 後重畫時會再對一次最新的時間。
      if (Math.abs(el.currentTime - s) > 0.02 && !el.seeking) el.currentTime = s;
    }
  }

  /** 背景音樂：現在這一秒有的音樂各用一個 <audio>，跟著時間軸播放／暫停／對時 */
  private syncMusic(p: Project, t: number) {
    const used = new Set<HTMLVideoElement>();
    for (const track of p.tracks) {
      if (track.kind !== 'audio' || track.hidden) continue;
      for (const it of track.items as VideoItem[]) {
        if (t < it.start || t >= it.start + it.duration) continue;
        const asset = p.assets.find((a) => a.id === it.assetId);
        const url = asset && this.deps.urlFor(asset.id);
        if (!asset || !url) continue;
        const el = this.music.acquire(it.id, asset.id, url, used);
        if (!el) continue;
        used.add(el);
        const s = it.trimIn + (t - it.start);
        const vol =
          it.volume *
          fadeGain(t - it.start, it.duration, it.fadeIn, it.fadeOut) *
          (audioRetained(it, s) ? 1 : 0);
        this.audio.apply(el, vol, !!track.muted);
        if (this.playing) {
          const plan = driftPlan(s - el.currentTime, 1, !IOS);
          if (plan.seek) el.currentTime = s;
          if (el.playbackRate !== plan.rate) el.playbackRate = plan.rate;
          if (el.paused)
            el.play().catch((e: unknown) => {
              if (e instanceof DOMException && e.name === 'NotAllowedError' && !el.muted) this.blocked();
            });
        } else {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - s) > 0.05) el.currentTime = s;
        }
      }
    }
    this.music.pauseAllExcept(used);
  }

  /** 影片池不夠用時，那個影片物件這一刻先畫素材縮圖（靜態、零成本），不要變黑 */
  private thumbFallback(item: VideoItem, asset: Asset, t: number, quiet = false) {
    if (!quiet && !this.poolFullTold) {
      this.poolFullTold = true;
      queueMicrotask(() => this.deps.onPoolFull?.());
    }
    const url = thumbOf({ ...item, trimIn: sourceTimeAt(item, t) }, asset);
    if (!url) return null;
    let img = this.thumbImgs.get(url);
    if (!img) {
      if (this.thumbImgs.size > 60) this.thumbImgs.clear();
      img = new Image();
      img.onload = () => this.scheduleRender();
      img.src = url;
      this.thumbImgs.set(url, img);
    }
    return {
      source: img,
      ready: img.complete && img.naturalWidth > 0,
      srcW: img.naturalWidth || asset.width,
      srcH: img.naturalHeight || asset.height,
    };
  }

  private blocked() {
    if (!this.playing) return;
    this.pause();
    this.deps.onAudioBlocked?.();
  }

  /**
   * 這一刻正在轉場的片段（A、B）：對時規則放寬；播放時順便統計轉場掉格（效能框）；
   * 兩支都是大檔、輕量影片還沒做好時，建議改流暢預覽（一次）。
   */
  private trackTransitions(p: Project, t: number) {
    const ids = new Set<string>();
    const heavy: Asset[] = [];
    for (const tr of p.tracks) {
      if (!canTransition(tr)) continue;
      const at = activeTransition(tr.items, t);
      if (!at) continue;
      for (const x of [at.a, at.b]) {
        if (!x || x.type === 'text') continue;
        ids.add(x.id);
        const a = p.assets.find((y) => y.id === x.assetId);
        if (
          a &&
          a.kind === 'video' &&
          a.proxy?.status !== 'ready' &&
          (Math.max(a.width, a.height) > 1920 || a.hdr)
        )
          heavy.push(a);
      }
    }
    if (this.playing && ids.size > 0) {
      const now = performance.now();
      if (this.transIds.size === 0)
        this.trans = { frames: 0, drops: 0, hardSeeks: 0, lastAt: now, lastSeek: '' };
      else if (now - this.trans.lastAt > 50) this.trans.drops++;
      this.trans.lastAt = now;
      this.trans.frames++;
      if (heavy.length >= 2 && !this.transHeavyTold) {
        this.transHeavyTold = true;
        this.deps.onSlow?.(); // 兩支大檔同時解碼：建議流暢預覽（預覽檔做好之後會更順）
      }
    }
    this.transIds = ids;
  }

  private render(t: number) {
    const p0 = this.deps.getProject();
    const p = p0 ? this.effectiveProject(p0) : p0;
    const { compositor: comp } = this;
    if (!p) {
      comp.render([]);
      this.settledNow = true;
      return;
    }
    const used = new Set<HTMLVideoElement>();
    const srcs: string[] = [];
    this.trackTransitions(p, t);

    const t0 = performance.now();
    const scene = buildScene(
      p,
      t,
      comp.width,
      comp.height,
      (item, asset, track) => {
        const url = this.deps.urlFor(asset.id);
        if (!url) return null;
        if (item.type === 'image' && asset.anim) {
          // 會動的圖片：依「物件開始後經過的時間」取第幾格（預覽、暫停、拖時間軸都準確）
          const anim = peekAnim(asset.id);
          if (anim === undefined) {
            void loadAnim(asset.id, async () => (await fetch(url)).blob()).then(() => this.scheduleRender());
          } else if (anim) {
            return {
              source: anim.frames[frameIndexAt(anim.delays, t - item.start)]!,
              ready: true,
              srcW: anim.width,
              srcH: anim.height,
            };
          }
          // 還沒解好（或解不了）：先用第一格的靜態圖
        }
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
        if (!el) return this.thumbFallback(item, asset, t); // 同時疊的影片超過上限：多的先畫縮圖
        used.add(el);
        srcs.push(
          `${el.videoWidth}×${el.videoHeight} ${asset.proxy?.status === 'ready' ? '預覽檔' : '原檔'}`,
        );
        this.syncVideo(el, item, asset, track, t);
        this.maybeCaptureThumb(el, asset);
        if (track.kind === 'media' && el.videoWidth)
          this.videoInfo = `${el.videoWidth}×${el.videoHeight} ${asset.codec ?? ''}${asset.hdr ? ' HDR' : ''}｜預覽檔：${asset.proxy?.status ?? '無'}`;
        const ready = el.readyState >= 2 && !el.seeking && el.videoWidth > 0;
        if (ready) this.everReady.add(item.id);
        // 暫停（拖時間軸、點選）時影片還沒 seek 完：先畫素材縮圖頂著，不要留舊的一格或什麼都沒有。
        // 播放中也一樣：這個物件還沒出現過畫面（例如轉場的後一段晚到）就用縮圖，不然那一塊是空的、露出下面那層
        if (!ready && (!this.playing || !this.everReady.has(item.id))) {
          const th = this.thumbFallback(item, asset, t, true);
          if (th) return th;
        }
        return {
          source: el,
          ready,
          srcW: el.videoWidth || asset.width,
          srcH: el.videoHeight || asset.height,
        };
      },
      { guardCells: !this.patch },
    );

    this.videoCount = used.size;
    this.sources = srcs;

    // 預載：下一個主軌片段、1 秒內要開始的疊加影片
    for (const { item, asset, track } of this.upcoming(p, t)) {
      const url = this.deps.urlFor(asset.id);
      if (!url) continue;
      const el = this.pool.acquire(item.id, asset.id, url, used);
      if (!el) continue;
      used.add(el);
      // 有轉場的話 B 會提前出現（入點不夠的部分停在第一格）：從轉場開始的位置往前算
      const tr = item.transitionIn;
      // 提前幾秒：跟畫面、匯出用同一個函式（沒設分配＝各一半、夾在片段長度內），不要自己另外算
      const before = tr ? earlyOf(track.items, item) : 0;
      const early: VideoItem = {
        ...item,
        start: item.start - before,
        trimIn: item.trimIn - before * item.speed,
        duration: item.duration + before,
      };
      if (tr && this.playing && t >= early.start - WARM_S) {
        // 暖機：轉場開始前 0.4 秒就靜音開始播，轉場一開始它已經在動（iPhone 的 play() 要好幾百毫秒才真的動）
        this.syncVideo(el, early, asset, track, t);
        continue;
      }
      if (el.dataset.primed !== '1') {
        // 先停在轉場開始時要的那一格，轉場一開始就不用再 seek
        el.currentTime = Math.max(early.trimIn, 0);
        el.dataset.primed = '1';
      }
      if (!el.paused) el.pause();
    }
    this.pool.pauseAllExcept(used);
    this.syncMusic(p, t);
    if (this.playing) this.audio.keepAlive();
    const t1 = performance.now();
    this.settledNow = comp.render(scene, { skipIfIdle: this.playing });
    const t2 = performance.now();
    this.seg = { build: t1 - t0, comp: t2 - t1, upload: comp.takeUploadMs(), ...comp.seg };
  }

  /**
   * 縮圖還沒補滿時（例如 iPhone 的大檔匯入時拿不到縮圖，輕量影片也還沒做好），播到哪裡就把那一格補上；
   * 每格只補一次、同一個素材最多每 0.5 秒補一張。其他格先用最近的舊縮圖頂著。
   */
  private maybeCaptureThumb(el: HTMLVideoElement, asset: Asset) {
    if (!this.deps.onThumb || asset.thumbsFull || asset.duration <= 0) return;
    if (el.seeking || el.readyState < 2) return;
    const n = thumbCount(asset.duration);
    const slot = thumbIndex(n, el.currentTime, asset.duration);
    const done = this.thumbSlots.get(asset.id) ?? new Set<number>();
    if (done.has(slot)) return;
    const now = performance.now();
    if (now - (this.thumbAt.get(asset.id) ?? -1e9) < 500) return;
    const url = captureThumb(el);
    if (!url) return;
    done.add(slot);
    this.thumbSlots.set(asset.id, done);
    this.thumbAt.set(asset.id, now);
    const next =
      asset.thumbs.length > 0 ? expandThumbs(asset.thumbs, n) : Array.from({ length: n }, () => url);
    next[slot] = url;
    // render() 進行中不要改 store，等這一輪結束
    queueMicrotask(() => this.deps.onThumb?.(asset.id, next));
  }

  private upcoming(p: Project, t: number): { item: VideoItem; asset: Asset; track: Track }[] {
    const out: { item: VideoItem; asset: Asset; track: Track }[] = [];
    for (const track of p.tracks) {
      const push = (item: VideoItem) => {
        if (item.type !== 'video') return;
        const asset = p.assets.find((a) => a.id === item.assetId);
        if (asset) out.push({ item, asset, track });
      };
      if (track.hidden) continue;
      if (track.kind !== 'media') continue;
      // 這條軌道接下來要開始的影片：目前這個片段正在播就預載下一個（無縫接下去）；
      // 目前沒有片段（在空白裡）就只預載 1 秒內要開始的
      const items = [...(track.items as VideoItem[])].sort((a, b) => a.start - b.start);
      const cur = items.some((x) => t >= x.start && t < x.start + x.duration);
      const next = items.find((x) => x.start > t);
      // 有轉場的要多提前：轉場在接縫前 before 秒開始，再加暖機的時間
      const lead = next?.transitionIn
        ? Math.max(PREFETCH_TRANSITION_S, earlyOf(items, next) + WARM_S + 0.5)
        : PREFETCH_S;
      if (next && (cur || next.start <= t + lead)) push(next);
    }
    return out;
  }

  /** 預覽時暫時改某個影片／照片物件（裁切模式顯示整張畫面）；null＝還原。會馬上重畫。 */
  setPreviewPatch(patch: { itemId: string; apply: (it: VideoItem) => VideoItem } | null) {
    this.patch = patch;
    if (!this.playing) this.render(this.t);
  }

  /** 看原色：這些物件暫時不套調色（'all'＝整個專案；null＝還原）；暫停時會馬上重畫 */
  setGradeBypass(ids: string[] | 'all' | null) {
    this.bypass = ids === 'all' ? 'all' : ids && ids.length ? new Set(ids) : null;
    if (!this.playing) this.render(this.t);
  }

  get gradeBypassed(): boolean {
    return this.bypass !== null;
  }

  private effectiveProject(p: Project): Project {
    p = showPlaceholders(p); // 還沒輸入的文字：預覽顯示半透明提示字（匯出不畫）
    const bypass = this.bypass;
    if (bypass) {
      const hit = (id: string) => bypass === 'all' || bypass.has(id);
      p = {
        ...p,
        tracks: p.tracks.map((tr) =>
          tr.items.some((x) => hit(x.id))
            ? {
                ...tr,
                items: tr.items.map((x) => {
                  if (!hit(x.id)) return x;
                  const {
                    look: _l,
                    adjust: _a,
                    ...rest
                  } = x as typeof x & { look?: unknown; adjust?: unknown };
                  void _l;
                  void _a;
                  return {
                    ...rest,
                    keyframes: x.keyframes?.map(({ adjust: _k, look: _l2, ...k }) => (void _k, void _l2, k)),
                  } as typeof x;
                }),
              }
            : tr,
        ) as Project['tracks'],
      };
    }
    const patch = this.patch;
    if (!patch) return p;
    return {
      ...p,
      tracks: p.tracks.map((tr) =>
        tr.items.some((x) => x.id === patch.itemId)
          ? {
              ...tr,
              items: tr.items.map((x) => (x.id === patch.itemId && x.type !== 'text' ? patch.apply(x) : x)),
            }
          : tr,
      ) as Project['tracks'],
    };
  }

  /** 預覽最下面那條影像軌目前的片段 id（測試用） */
  currentMainItemId(): string | undefined {
    const p = this.deps.getProject();
    if (!p) return undefined;
    const base = baseMediaTrack(p);
    return base?.items.find((x) => this.t >= x.start && this.t < x.start + x.duration)?.id;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.renderRaf);
    this.offMask?.();
    this.playing = false;
    this.listeners.clear();
    this.pool.destroy();
    this.music.destroy();
    this.audio.destroy();
    this.compositor.destroy();
  }
}
