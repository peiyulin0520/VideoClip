/**
 * 一組隱藏的 <video>，給所有「現在或即將播放」的影片物件輪流使用。
 * 同一個物件盡量一直用同一個元素（不重設 src）；沒人用的元素讓出去。
 */
export class VideoPool {
  readonly els: HTMLVideoElement[] = [];
  private tick = 0;

  /** tag：影片用 'video'；背景音樂用 'audio'（元素型別都當 HTMLVideoElement 用，音樂用不到 videoWidth） */
  constructor(host: HTMLElement, size: number, onChange: () => void, tag: 'video' | 'audio' = 'video') {
    for (let i = 0; i < size; i++) {
      const v = document.createElement(tag) as HTMLVideoElement;
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
      el.dataset.url = url;
      delete el.dataset.primed;
    } else if (el.dataset.url !== url && el.paused) {
      // 同一個素材換了網址（預覽用輕量影片做好了）：停著的時候才換，播放中的等下次
      const t = el.currentTime;
      el.src = url;
      el.dataset.url = url;
      el.currentTime = t;
    }
    el.dataset.used = String(++this.tick);
    return el;
  }

  pauseAllExcept(keep: Set<HTMLVideoElement>) {
    for (const v of this.els) if (!keep.has(v) && !v.paused) v.pause();
  }

  /**
   * iOS Safari：沒有出聲播放過的元素，之後由程式啟動播放（不是使用者點擊）會被擋下。
   * 要在使用者點擊當下、同步地對每個「有影片、目前停著」的元素 play() 再馬上 pause()。
   * （不能用靜音的 play：靜音播放不算數。也不能等 promise 回來才 pause，會把剛開始播的影片停掉。）
   */
  unlock() {
    for (const v of this.els) {
      if (!v.paused || v.dataset.unlocked || !v.getAttribute('src')) continue;
      v.dataset.unlocked = '1';
      v.play().catch(() => {});
      v.pause();
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
