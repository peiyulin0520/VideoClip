/**
 * 一組隱藏的 <video>，給所有「現在或即將播放」的影片物件輪流使用。
 * 同一個物件盡量一直用同一個元素（不重設 src）；沒人用的元素讓出去。
 */
export class VideoPool {
  readonly els: HTMLVideoElement[] = [];
  private tick = 0;

  constructor(host: HTMLElement, size: number, onChange: () => void) {
    for (let i = 0; i < size; i++) {
      const v = document.createElement('video');
      v.playsInline = true;
      v.muted = true;
      v.preload = 'auto';
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.addEventListener('seeked', onChange);
      v.addEventListener('loadeddata', onChange);
      host.appendChild(v);
      this.els.push(v);
    }
  }

  find(itemId: string): HTMLVideoElement | undefined {
    return this.els.find((v) => v.dataset.itemId === itemId);
  }

  /** 給 itemId 一個元素（已有就沿用）。protect 裡的是這一格正在用的，不能搶。 */
  acquire(
    itemId: string,
    assetId: string,
    url: string,
    protect: Set<HTMLVideoElement>,
  ): HTMLVideoElement | null {
    let el = this.find(itemId);
    if (!el) {
      const free = this.els.filter((v) => !protect.has(v));
      if (free.length === 0) return null;
      // 優先用沒綁物件的，其次最久沒用的
      free.sort(
        (a, b) =>
          Number(!!a.dataset.itemId) - Number(!!b.dataset.itemId) ||
          Number(a.dataset.used) - Number(b.dataset.used),
      );
      el = free[0]!;
      el.dataset.itemId = itemId;
      delete el.dataset.primed;
    }
    if (el.dataset.assetId !== assetId) {
      el.src = url;
      el.dataset.assetId = assetId;
      delete el.dataset.primed;
    }
    el.dataset.used = String(++this.tick);
    return el;
  }

  pauseAllExcept(keep: Set<HTMLVideoElement>) {
    for (const v of this.els) if (!keep.has(v) && !v.paused) v.pause();
  }

  /** iOS Safari：要在使用者點擊當下對每個元素 play() 一下，之後才能由程式啟動播放 */
  unlock() {
    for (const v of this.els) {
      if (!v.paused || v.dataset.unlocked) continue;
      v.muted = true;
      void v.play().then(
        () => {
          v.dataset.unlocked = '1';
          v.pause();
        },
        () => {},
      );
    }
  }

  destroy() {
    for (const v of this.els) {
      v.pause();
      v.removeAttribute('src');
      v.load();
      v.remove();
    }
    this.els.length = 0;
  }
}
