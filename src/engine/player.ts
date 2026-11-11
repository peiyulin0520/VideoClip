import type { Asset, Project, Track, VideoItem } from '../model/types';
import { Compositor } from './compositor';
import { VideoPool } from './mediaPool';
import { buildScene } from './scene';
import { mainTrack, sourceTimeAt, totalDuration } from './timeline';

type Deps = { getProject: () => Project | null; urlFor: (assetId: string) => string | undefined };
type Listener = (t: number, playing: boolean) => void;

const DRIFT = 0.3;
const PREFETCH_S = 1.0;
const POOL_SIZE = 6;

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

  private constructor(
    readonly compositor: Compositor,
    private pool: VideoPool,
    private deps: Deps,
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
    this.pool.unlock();
    this.playing = true;
    this.wallStart = performance.now();
    this.tStart = this.t;
    this.render(this.t);
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
    this.render(t);
    this.emit();
    this.raf = requestAnimationFrame(this.tick);
  };

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
    el.volume = item.volume;
    el.muted = !!track.muted || !asset.hasAudio || item.volume === 0;
    el.playbackRate = item.speed;
    if (this.playing) {
      if (Math.abs(el.currentTime - s) > DRIFT) el.currentTime = s;
      if (el.paused) void el.play().catch(() => {});
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - s) > 0.02) el.currentTime = s;
    }
  }

  private render(t: number) {
    const p = this.deps.getProject();
    const { compositor: comp } = this;
    if (!p) {
      comp.render([]);
      return;
    }
    const used = new Set<HTMLVideoElement>();

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
    comp.render(scene);
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
    this.compositor.destroy();
  }
}
