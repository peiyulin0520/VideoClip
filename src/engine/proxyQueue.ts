import { create } from 'zustand';
import type { Asset } from '../model/types';
import { getMedia, putMedia } from '../storage/media';
import { setAssetProxy } from '../store/projectStore';
import { useUI } from '../store/uiStore';
import { ensureProxyUrl, proxyKey } from './assetUrls';
import { makeProxy } from './proxy';

// 預覽用輕量影片的背景工作：一次做一支，不擋住剪輯。進度顯示在時間軸片段上。

export const useProxyProgress = create<{ progress: Record<string, number> }>(() => ({ progress: {} }));
const setProgress = (assetId: string, f: number | null) =>
  useProxyProgress.setState((s) => {
    const next = { ...s.progress };
    if (f === null) delete next[assetId];
    else next[assetId] = f;
    return { progress: next };
  });

type Job = { projectId: string; asset: Asset };
const queue: Job[] = [];
const queued = new Set<string>();
let running = false;

/** 測試用：直接換掉做 proxy 的函式 */
let maker: typeof makeProxy = makeProxy;
export function __setProxyMaker(fn: typeof makeProxy | null) {
  maker = fn ?? makeProxy;
}

async function runOne({ projectId, asset }: Job) {
  try {
    setProgress(asset.id, 0);
    const file = await getMedia(projectId, asset.id, asset.mime);
    const res = await maker(file, { onProgress: (f) => setProgress(asset.id, f) });
    if (res.status === 'none') {
      setAssetProxy(asset.id, { status: 'none' });
      return;
    }
    await putMedia(projectId, proxyKey(asset.id), res.blob);
    const proxy = { status: 'ready' as const, mime: res.mime, width: res.width, height: res.height };
    setAssetProxy(asset.id, proxy);
    await ensureProxyUrl(projectId, { ...asset, proxy });
    useUI.getState().player?.refresh(); // 換成輕量影片
  } catch (e) {
    console.warn('[proxy] 預覽用影片做不出來，照用原檔', e);
    setAssetProxy(asset.id, { status: 'failed' });
  } finally {
    setProgress(asset.id, null);
  }
}

async function drain() {
  if (running) return;
  running = true;
  try {
    for (let job = queue.shift(); job; job = queue.shift()) {
      await runOne(job);
      queued.delete(job.asset.id);
    }
  } finally {
    running = false;
  }
}

/** 還沒判斷過的影片（沒有 proxy 欄位）排進佇列。可以重複呼叫。 */
export function enqueueProxies(projectId: string, assets: Asset[]): void {
  for (const a of assets) {
    // pending 是上次還沒做完就關掉網頁：重做
    if (a.kind !== 'video' || (a.proxy && a.proxy.status !== 'pending') || a.unsaved || queued.has(a.id))
      continue;
    queued.add(a.id);
    queue.push({ projectId, asset: a });
    setAssetProxy(a.id, { status: 'pending' });
  }
  void drain();
}
