import type { Asset, Project, VideoItem } from '../model/types';
import { animBitmapAt, fetchBlob } from './animImage';
import { Compositor } from './compositor';
import { buildScene, sceneItems } from './scene';
import { sourceTimeClamped } from './timeline';

function once(el: EventTarget, ok: string, ms = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`等待 ${ok} 逾時`)), ms);
    el.addEventListener(
      ok,
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

type Prepared = { source: HTMLVideoElement | HTMLImageElement | ImageBitmap; w: number; h: number };

/**
 * 把專案在 t 秒的那一格，用「輸出解析度」畫成 PNG（匯出整支影片時每一格也是走同一套 buildScene + Compositor）。
 * 影片用獨立的 <video> 精準 seek，不影響預覽。
 */
export async function renderFrame(
  project: Project,
  t: number,
  urlFor: (assetId: string) => string | undefined,
  size: { width: number; height: number } = { width: project.width, height: project.height },
): Promise<{ canvas: HTMLCanvasElement; blob: Blob }> {
  const prepared = new Map<string, Prepared>();
  const cleanup: (() => void)[] = [];
  try {
    await Promise.all(
      sceneItems(project, t).map(async ({ item }) => {
        if (item.type === 'text') return;
        const asset = project.assets.find((a) => a.id === item.assetId);
        const url = urlFor(item.assetId);
        if (!asset || !url) return;
        if (item.type === 'image' && asset.anim) {
          // 會動的圖片：取「物件開始後 t − start 秒」那一格，跟預覽一樣
          const bmp = await animBitmapAt(asset.id, fetchBlob(url), t - item.start);
          if (bmp) {
            prepared.set(item.id, { source: bmp, w: bmp.width, h: bmp.height });
            return;
          }
        }
        if (item.type === 'image') {
          const img = new Image();
          img.src = url;
          await img.decode();
          prepared.set(item.id, { source: img, w: img.naturalWidth, h: img.naturalHeight });
          return;
        }
        const v = document.createElement('video');
        v.muted = true;
        v.playsInline = true;
        v.preload = 'auto';
        v.src = url;
        cleanup.push(() => {
          v.removeAttribute('src');
          v.load();
        });
        await once(v, 'loadeddata');
        v.currentTime = sourceTimeClamped(item as VideoItem, t, asset);
        await once(v, 'seeked');
        prepared.set(item.id, { source: v, w: v.videoWidth, h: v.videoHeight });
      }),
    );

    const comp = await Compositor.create(size);
    try {
      const scene = buildScene(project, t, size.width, size.height, (item: VideoItem, asset: Asset) => {
        const p = prepared.get(item.id);
        return p
          ? { source: p.source, ready: true, srcW: p.w || asset.width, srcH: p.h || asset.height }
          : null;
      });
      comp.render(scene);
      const canvas = comp.toCanvas();
      const blob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG 轉檔失敗'))), 'image/png'),
      );
      return { canvas, blob };
    } finally {
      comp.destroy();
    }
  } finally {
    cleanup.forEach((f) => f());
  }
}
