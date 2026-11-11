import type { Project, VideoItem } from '../model/types';
import { itemAt, mainTrack, sourceTimeAt, totalDuration } from './timeline';

export type StageEls = { videos: [HTMLVideoElement, HTMLVideoElement]; img: HTMLImageElement };
type Deps = { getProject: () => Project | null; urlFor: (assetId: string) => string | undefined };
type Listener = (t: number, playing: boolean) => void;

const DRIFT = 0.3;

/**
 * 預覽播放引擎（Phase 1：只有主軌）。
 * 時間由時鐘驅動；兩個 <video> 輪流使用，下一個片段會提前載入並停在起點，切換時不會黑畫面。
 */
export class Player {
  private t = 0;
  private playing = false;
  private raf = 0;
  private wallStart = 0;
  private tStart = 0;
  private active = 0;
  private wantVisible: 0 | 1 | 'img' | null = null;
  private listeners = new Set<Listener>();
  private cleanup: (() => void)[] = [];

  constructor(
    private els: StageEls,
    private deps: Deps,
  ) {
    for (const v of els.videos) {
      const on = () => this.applyVisibility();
      v.addEventListener('seeked', on);
      v.addEventListener('loadeddata', on);
      this.cleanup.push(() => {
        v.removeEventListener('seeked', on);
        v.removeEventListener('loadeddata', on);
      });
    }
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
    const total = this.total();
    this.t = Math.min(Math.max(t, 0), total);
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
    // iOS Safari：另一個 <video> 要在使用者點擊當下「解鎖」，之後才能自動接著播放
    const spare = this.els.videos[1 - this.active]!;
    if (spare.paused) {
      spare.muted = true;
      void spare.play().then(
        () => spare.pause(),
        () => {},
      );
    }
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
    for (const v of this.els.videos) v.pause();
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

  private tick = () => {
    if (!this.playing) return;
    const total = this.total();
    let t = this.tStart + (performance.now() - this.wallStart) / 1000;
    if (t >= total) {
      t = total;
      this.t = t;
      this.playing = false;
      for (const v of this.els.videos) v.pause();
      this.render(t);
      this.emit();
      return;
    }
    this.t = t;
    this.render(t);
    this.emit();
    this.raf = requestAnimationFrame(this.tick);
  };

  private assign(el: HTMLVideoElement, item: VideoItem) {
    const url = this.deps.urlFor(item.assetId);
    if (!url) return;
    if (el.dataset.assetId !== item.assetId) {
      el.src = url;
      el.dataset.assetId = item.assetId;
    }
    el.dataset.itemId = item.id;
  }

  private render(t: number) {
    const p = this.deps.getProject();
    const hit = p ? itemAt(mainTrack(p).items, t) : null;
    if (!p || !hit) {
      this.wantVisible = null;
      this.applyVisibility();
      return;
    }
    const { item, index } = hit;
    const items = mainTrack(p).items;
    const fit = item.fit;

    if (item.type === 'image') {
      const url = this.deps.urlFor(item.assetId);
      if (url && this.els.img.dataset.assetId !== item.assetId) {
        this.els.img.src = url;
        this.els.img.dataset.assetId = item.assetId;
      }
      this.els.img.style.objectFit = fit;
      for (const v of this.els.videos) v.pause();
      this.wantVisible = 'img';
    } else {
      const els = this.els.videos;
      let el = els.find((v) => v.dataset.itemId === item.id);
      if (!el) {
        el = els[1 - this.active]!;
        this.assign(el, item);
      }
      this.active = els.indexOf(el);
      const spare = els[1 - this.active]!;
      const asset = p.assets.find((a) => a.id === item.assetId);
      const s = sourceTimeAt(item, t);
      el.style.objectFit = fit;
      el.volume = item.volume;
      el.muted = !asset?.hasAudio || item.volume === 0;
      el.playbackRate = item.speed;
      if (this.playing) {
        if (Math.abs(el.currentTime - s) > DRIFT) el.currentTime = s;
        if (el.paused) void el.play().catch(() => {});
      } else {
        el.pause();
        if (Math.abs(el.currentTime - s) > 0.02) el.currentTime = s;
      }
      this.wantVisible = this.active as 0 | 1;

      // 預載下一個片段到另一個 <video>，停在起點
      const next = items[index + 1];
      if (next && next.type === 'video') {
        if (spare.dataset.itemId !== next.id) {
          this.assign(spare, next);
          spare.currentTime = next.trimIn;
        }
        spare.pause();
      } else {
        spare.pause();
      }
    }
    this.applyVisibility();
  }

  /** 新的 <video> 還沒畫出第一格前，先留著舊畫面，避免閃黑 */
  private applyVisibility() {
    const { videos, img } = this.els;
    const w = this.wantVisible;
    if (w === null) {
      img.style.visibility = 'hidden';
      for (const v of videos) v.style.visibility = 'hidden';
      return;
    }
    if (w === 'img') {
      img.style.visibility = 'visible';
      for (const v of videos) v.style.visibility = 'hidden';
      return;
    }
    const el = videos[w];
    if (el.readyState >= 2 && !el.seeking) {
      el.style.visibility = 'visible';
      videos[1 - w]!.style.visibility = 'hidden';
      img.style.visibility = 'hidden';
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.playing = false;
    this.cleanup.forEach((f) => f());
    this.listeners.clear();
    for (const v of this.els.videos) {
      v.pause();
      v.removeAttribute('src');
      v.load();
    }
  }
}
