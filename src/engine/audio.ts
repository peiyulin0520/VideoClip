/**
 * 影片聲音輸出。
 *
 * 規定：影片聲音不受 iPhone 靜音開關影響（像 YouTube、IG）。
 * - `<video>` 元素直接出聲 → 靜音模式下照樣有聲音，但 iOS 設不了 `volume`。
 * - Web Audio 預設是「環境音」，iOS 靜音模式下會沒聲音，要先設
 *   `navigator.audioSession.type = 'playback'`（Safari 16.4+）。
 * 所以：有 Audio Session API（或不是 iOS）→ 走 Web Audio（音量可調）；
 * iOS 但沒有 Audio Session API → 直接用 `<video>` 出聲（只能開／關）。
 */

export type AudioMode = 'webaudio' | 'element';

export function chooseAudioMode(env: { hasAudioSession: boolean; isIOS: boolean }): AudioMode {
  return env.hasAudioSession || !env.isIOS ? 'webaudio' : 'element';
}

type AudioSessionNav = Navigator & { audioSession?: { type: string } };

export function isIOSDevice(): boolean {
  const nav = navigator as AudioSessionNav;
  const ua = nav.userAgent ?? '';
  return /iP(hone|ad|od)/.test(ua) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
}

function detectEnv() {
  const nav = navigator as AudioSessionNav;
  const ua = nav.userAgent ?? '';
  const isIOS = /iP(hone|ad|od)/.test(ua) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
  return { hasAudioSession: !!nav.audioSession, isIOS };
}

/** 一個元素現在該有的聲音狀態（純函式，方便測試） */
export function elementAudioState(opts: { mode: AudioMode; volume: number; silent: boolean }): {
  muted: boolean;
  elVolume: number;
  gain: number;
} {
  const volume = Math.max(0, opts.volume);
  const off = opts.silent || volume === 0;
  if (opts.mode === 'webaudio') return { muted: false, elVolume: 1, gain: off ? 0 : volume };
  // 直接用元素出聲：只能開／關（桌機瀏覽器 volume 有效，iOS 會忽略）
  return { muted: off, elVolume: Math.min(1, volume), gain: 1 };
}

type Node = { source: MediaElementAudioSourceNode; gain: GainNode };

export class AudioOut {
  readonly mode: AudioMode;
  private ctx: AudioContext | null = null;
  private nodes = new WeakMap<HTMLMediaElement, Node>();
  private analyser: AnalyserNode | null = null;
  private master: GainNode | null = null;

  constructor(env = detectEnv()) {
    this.mode = chooseAudioMode(env);
  }

  /** 要在使用者點擊（按播放）當下呼叫 */
  unlock() {
    if (this.mode !== 'webaudio') return;
    try {
      const nav = navigator as AudioSessionNav;
      if (nav.audioSession) nav.audioSession.type = 'playback';
    } catch {
      /* 設不了就算了 */
    }
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.master.connect(this.analyser);
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
        return;
      }
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
  }

  /** 套用這個元素現在該有的聲音（音量、關聲音） */
  apply(el: HTMLVideoElement, volume: number, silent: boolean) {
    const st = elementAudioState({ mode: this.mode, volume, silent });
    let node = this.nodes.get(el);
    if (this.mode === 'webaudio' && this.ctx && this.master && !node) {
      try {
        const source = this.ctx.createMediaElementSource(el);
        const gain = this.ctx.createGain();
        source.connect(gain);
        gain.connect(this.master);
        node = { source, gain };
        this.nodes.set(el, node);
      } catch {
        /* 已經接過 */
      }
    }
    if (node) {
      node.gain.gain.value = st.gain;
    } else if (this.mode === 'webaudio') {
      // 還沒解鎖（沒有 AudioContext）：先用元素本身的音量，不要讓它偷偷出聲
      el.muted = silent || volume === 0;
      el.volume = Math.min(1, volume);
      return;
    }
    el.muted = st.muted;
    el.volume = st.elVolume;
  }

  /** 目前輸出的音量大小（0–1），給測試／除錯用；沒有 Web Audio 時回傳 null */
  level(): number | null {
    if (!this.analyser) return null;
    const buf = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
    return peak / 128;
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  destroy() {
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
    this.analyser = null;
  }
}
