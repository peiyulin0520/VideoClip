import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import type { Asset, Item, Project, VideoItem } from '../model/types';
import { getMedia } from '../storage/media';
import { proxyKey } from './assetUrls';
import { HANDOVER_AFTER, HANDOVER_BEFORE } from './handover';
import { canTransition } from './scene';
import { sourceTimeClamped } from './timeline';
import { activeTransition } from './transitions';

// 轉場用「預先解好的畫面」：轉場開始時，iPhone 的 <video> 要好幾百毫秒才出畫面；
// 所以專案打開、改了轉場之後，就在背景用 Mediabunny（WebCodecs）把每個轉場要用到的那幾秒（前一段、後一段）
// 一格一格解成小的 ImageBitmap 存起來，播放經過轉場時直接用，不等 <video>。匯出不用這個（匯出本來就一格一格解）。

export const FRAME_FPS = 30;
/** 預先解好的畫面：長邊像素（流暢預覽小一點） */
export const FRAME_SIDE = 640;
export const FRAME_SIDE_SMOOTH = 480;
/** 一個轉場最多解這麼多格（30 格／秒 × 5 秒；再長的只解頭尾，不會發生：轉場最長 3 秒） */
const MAX_FRAMES = 240;
/** 預先解好的畫面總共最多佔這麼多位元組（約 4 位元組 × 像素） */
export const FRAME_BUDGET_BYTES = 160 * 1024 * 1024;

export type FrameNeed = {
  /** 快取鍵：素材、素材秒數範圍、解析度；任何一項變了就作廢重解 */
  key: string;
  assetId: string;
  /** 要解的素材秒數範圍 */
  t0: number;
  t1: number;
  /** 這個轉場在時間軸上的中心時間（離播放線越近越先解、越晚被丟） */
  at: number;
};

const q = (s: number) => Math.round(s * FRAME_FPS) / FRAME_FPS;

/**
 * 專案裡每個轉場要用到的素材畫面（只算影片；照片、字卡不用解）。
 * 做法：把每個轉場的時間範圍一格一格走過去，問 activeTransition 這一格要畫哪個（虛擬）A、B，
 * 再算它們用的素材秒數——跟播放、匯出用的是同一套，所以不會對不上。
 */
export function transitionNeeds(project: Project, side: number): FrameNeed[] {
  const out: FrameNeed[] = [];
  for (const track of project.tracks) {
    if (!canTransition(track)) continue;
    const items = track.items as Item[];
    // 每個有轉場的片段 B：轉場可能發生的時間範圍（保守抓 B 開始前後各 4 秒）
    for (const b of items) {
      if (b.type === 'audio' || !b.transitionIn) continue;
      const lo = b.start - b.transitionIn.duration - 1;
      const hi = b.start + b.transitionIn.duration + 1;
      const range = new Map<string, { t0: number; t1: number }>();
      const roleA = new Set<string>(); // 前一段用到的素材（前面多解一點）
      const roleB = new Set<string>(); // 後一段用到的素材（後面多解一點）
      let any = false;
      for (let t = lo; t <= hi; t += 1 / FRAME_FPS) {
        const at = activeTransition(items, t);
        if (!at || !isThis(at.b, b)) continue;
        any = true;
        for (const x of [at.a, at.b]) {
          if (!x || x.type !== 'video') continue;
          const asset = project.assets.find((a) => a.id === (x as VideoItem).assetId);
          if (!asset || asset.kind !== 'video') continue;
          (x === at.a ? roleA : roleB).add(asset.id);
          const s = q(sourceTimeClamped(x as VideoItem, t, asset));
          const r = range.get(asset.id);
          if (r) {
            r.t0 = Math.min(r.t0, s);
            r.t1 = Math.max(r.t1, s);
          } else range.set(asset.id, { t0: s, t1: s });
        }
      }
      if (!any) continue;
      for (const [assetId, r] of range) {
        // 轉場前後的換手範圍也要有預解圖：前一段多解轉場前 0.5 秒、後一段多解轉場後 1 秒（見 handover.ts）
        const asset0 = project.assets.find((a) => a.id === assetId)!;
        if (roleA.has(assetId)) r.t0 = Math.max(q(r.t0 - HANDOVER_BEFORE), 0);
        if (roleB.has(assetId))
          r.t1 = Math.min(q(r.t1 + HANDOVER_AFTER), Math.max(asset0.duration - 0.05, 0));
        const t1 = Math.min(r.t1, r.t0 + (MAX_FRAMES - 1) / FRAME_FPS);
        const asset = project.assets.find((a) => a.id === assetId)!;
        out.push({
          key: `${assetId}|${r.t0.toFixed(3)}|${t1.toFixed(3)}|${side}|${asset.proxy?.status === 'ready' ? 'p' : 'o'}`,
          assetId,
          t0: r.t0,
          t1,
          at: b.start,
        });
      }
    }
  }
  return out;
}

/** 轉場裡的 a／b 虛擬物件跟原本的片段是同一個（id 一樣） */
const isThis = (x: Item | null, b: Item): boolean => !!x && x.id === b.id;

type Entry = {
  need: FrameNeed;
  frames: (ImageBitmap | undefined)[];
  bytes: number;
  done: boolean;
};

export class TransitionFrames {
  private entries = new Map<string, Entry>();
  private byAsset = new Map<string, Entry[]>();
  private running: string | null = null;
  private cancelled = new Set<string>();
  private needs: FrameNeed[] = [];
  private playhead = 0;
  private bytes = 0;
  private disposed = false;
  /** 統計：目前有幾個轉場的畫面已經解好／還在解／總共幾個 */
  total = 0;

  constructor(
    private deps: {
      projectId: () => string | undefined;
      getAsset: (id: string) => Asset | undefined;
      budget?: number;
      /** 測試用：不真的解碼 */
      decode?: (need: FrameNeed, asset: Asset, put: (i: number, bm: ImageBitmap) => void) => Promise<void>;
    },
  ) {}

  /** 專案或播放線變了：重新算要解的、丟掉不用的、照離播放線的距離排序開始解 */
  update(needs: FrameNeed[], playhead: number) {
    this.needs = needs;
    this.playhead = playhead;
    this.total = needs.length;
    const keys = new Set(needs.map((n) => n.key));
    for (const [k, e] of [...this.entries]) if (!keys.has(k)) this.drop(k, e);
    if (this.running && !keys.has(this.running)) this.cancelled.add(this.running);
    void this.pump();
  }

  /** 這個素材這個素材秒數的畫面（預先解好的）；沒有（還沒解好、不在轉場裡）回傳 null */
  frameAt(assetId: string, s: number): ImageBitmap | null {
    const list = this.byAsset.get(assetId);
    if (!list) return null;
    for (const e of list) {
      if (s < e.need.t0 - 0.5 / FRAME_FPS || s > e.need.t1 + 0.5 / FRAME_FPS) continue;
      const i = Math.min(Math.max(Math.round((s - e.need.t0) * FRAME_FPS), 0), e.frames.length - 1);
      const bm = e.frames[i];
      if (bm) return bm;
    }
    return null;
  }

  /** 已經解好的轉場數（效能框、測試用） */
  get ready(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.done) n++;
    return n;
  }

  get usedBytes(): number {
    return this.bytes;
  }

  dispose() {
    this.disposed = true;
    for (const [k, e] of [...this.entries]) this.drop(k, e);
  }

  private drop(key: string, e: Entry) {
    for (const bm of e.frames) bm?.close();
    this.entries.delete(key);
    const list = this.byAsset.get(e.need.assetId)?.filter((x) => x !== e) ?? [];
    if (list.length) this.byAsset.set(e.need.assetId, list);
    else this.byAsset.delete(e.need.assetId);
    this.bytes -= e.bytes;
  }

  /** 一次解一個轉場（照離播放線近的先）；總量超過預算就丟最遠的，要是最遠的就是自己就不解了 */
  private async pump() {
    if (this.running || this.disposed) return;
    const budget = this.deps.budget ?? FRAME_BUDGET_BYTES;
    const todo = this.needs
      .filter((n) => !this.entries.get(n.key)?.done && !this.failed.has(n.key))
      .sort((a, b) => Math.abs(a.at - this.playhead) - Math.abs(b.at - this.playhead));
    const next = todo[0];
    if (!next) return;
    const asset = this.deps.getAsset(next.assetId);
    if (!asset) return;
    const est = estimateBytes(next, asset, this.side(next));
    // 放不下：丟比它更遠的；沒有更遠的就不解（用到的時候走「等一下再轉」）
    while (this.bytes + est > budget) {
      const far = [...this.entries.values()]
        .filter((e) => Math.abs(e.need.at - this.playhead) > Math.abs(next.at - this.playhead))
        .sort((a, b) => Math.abs(b.need.at - this.playhead) - Math.abs(a.need.at - this.playhead))[0];
      if (!far) return;
      this.drop(far.need.key, far);
    }
    const entry: Entry = {
      need: next,
      frames: new Array(Math.round((next.t1 - next.t0) * FRAME_FPS) + 1),
      bytes: est,
      done: false,
    };
    this.entries.set(next.key, entry);
    this.byAsset.set(next.assetId, [...(this.byAsset.get(next.assetId) ?? []), entry]);
    this.bytes += est;
    this.running = next.key;
    try {
      const put = (i: number, bm: ImageBitmap) => {
        if (this.cancelled.has(next.key) || this.disposed) bm.close();
        else entry.frames[i] = bm;
      };
      await (this.deps.decode ?? ((n, a, p) => this.decode(n, a, p)))(next, asset, put);
      if (!this.cancelled.has(next.key)) entry.done = true;
    } catch {
      // 解不了（格式不支援、檔案不見）：丟掉這一筆，之後走「等一下再轉」
      this.drop(next.key, entry);
      this.failed.add(next.key);
    } finally {
      this.cancelled.delete(next.key);
      this.running = null;
    }
    if (!this.disposed) void this.pump();
  }

  /** 解不了的轉場（不再重試，直到專案改了換新的鍵） */
  private failed = new Set<string>();

  private side(n: FrameNeed): number {
    return Number(n.key.split('|')[3]) || FRAME_SIDE;
  }

  private async decode(need: FrameNeed, asset: Asset, put: (i: number, bm: ImageBitmap) => void) {
    const pid = this.deps.projectId();
    if (!pid) throw new Error('no project');
    const useProxy = asset.proxy?.status === 'ready';
    const file = await getMedia(
      pid,
      useProxy ? proxyKey(asset.id) : asset.id,
      useProxy ? (asset.proxy?.mime ?? 'video/mp4') : asset.mime,
    );
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) throw new Error('cannot decode');
      const side = this.side(need);
      const k = side / Math.max(track.displayWidth, track.displayHeight, 1);
      const w = Math.max(Math.round(track.displayWidth * Math.min(k, 1)), 2);
      const h = Math.max(Math.round(track.displayHeight * Math.min(k, 1)), 2);
      const sink = new CanvasSink(track, { width: w, height: h, fit: 'fill' });
      const dur = Math.max(asset.duration - 0.05, 0);
      const times = Array.from({ length: Math.round((need.t1 - need.t0) * FRAME_FPS) + 1 }, (_, i) =>
        Math.min(need.t0 + i / FRAME_FPS, dur),
      );
      let i = 0;
      let last: ImageBitmap | null = null;
      for await (const wrapped of sink.canvasesAtTimestamps(times)) {
        if (this.cancelled.has(need.key) || this.disposed) break;
        if (wrapped) {
          last = await createImageBitmap(wrapped.canvas as CanvasImageSource as HTMLCanvasElement);
          put(i, last);
        } else if (last) {
          // 某一格拿不到就沿用前一格
          put(i, await createImageBitmap(last));
        }
        i++;
        await new Promise((r) => setTimeout(r, 0)); // 讓出一下，不擋播放
      }
    } finally {
      input.dispose();
    }
  }
}

/** 估算這個轉場畫面佔多少位元組（寬 × 高 × 4 × 格數） */
export function estimateBytes(need: FrameNeed, asset: Pick<Asset, 'width' | 'height'>, side: number): number {
  const k = Math.min(side / Math.max(asset.width, asset.height, 1), 1);
  const frames = Math.round((need.t1 - need.t0) * FRAME_FPS) + 1;
  return Math.round(asset.width * k) * Math.round(asset.height * k) * 4 * frames;
}
