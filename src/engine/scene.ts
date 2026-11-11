import type { Asset, Item, Project, Track, VideoItem } from '../model/types';
import type { SceneLayer } from './compositor';
import { fittedSize, itemBox, type GeoCtx } from './geometry';
import { renderText, measureTextItem } from './textRender';
import { visibleLayers } from './timeline';

/** 預覽/匯出各自提供「這個影片/照片物件現在的畫面」 */
export type SourceProvider = (
  item: VideoItem,
  asset: Asset,
  track: Track,
) => {
  source: HTMLVideoElement | HTMLImageElement | ImageBitmap;
  ready: boolean;
  srcW: number;
  srcH: number;
} | null;

export function geoCtx(project: Project, canvasW: number, canvasH: number): GeoCtx {
  return { canvasW, canvasH, assets: project.assets, textSize: measureTextItem };
}

/** 依專案與時間算出要畫的圖層（由下到上）。canvasW/H 是合成器畫布的像素。 */
export function buildScene(
  project: Project,
  t: number,
  canvasW: number,
  canvasH: number,
  provide: SourceProvider,
): SceneLayer[] {
  const ctx = geoCtx(project, canvasW, canvasH);
  const out: SceneLayer[] = [];
  for (const { item, track } of visibleLayers(project, t)) {
    const layer = toLayer(item, track, project, ctx, provide);
    if (layer) out.push(layer);
  }
  return out;
}

function toLayer(
  item: Item,
  track: Track,
  project: Project,
  ctx: GeoCtx,
  provide: SourceProvider,
): SceneLayer | null {
  const box = itemBox(item, ctx);
  if (!box) return null;
  const common = {
    id: item.id,
    box,
    opacity: item.transform.opacity,
    blend: item.blend ?? 'normal',
    cornerRadius: item.cornerRadius ?? 0,
    outline: item.outline,
    crop: item.crop,
  };
  if (item.type === 'text') {
    const r = renderText(item.card, ctx.canvasW / 1080);
    return { ...common, kind: 'text', source: r.canvas, ready: true, srcW: r.w, srcH: r.h, textKey: r.key };
  }
  const asset = project.assets.find((a) => a.id === item.assetId);
  if (!asset) return null;
  const src = provide(item, asset, track);
  if (!src) return null;
  // 暫存畫面的解析度：scale=1 時的顯示大小，最多放大 2 倍（縮放手勢時才不會一直重建貼圖）
  const crop = item.crop ?? { l: 0, t: 0, r: 0, b: 0 };
  const cw = Math.max(asset.width * (1 - crop.l - crop.r), 1);
  const ch = Math.max(asset.height * (1 - crop.t - crop.b), 1);
  const base = fittedSize(cw, ch, ctx.canvasW, ctx.canvasH, item.fit);
  const k = Math.min(2, Math.max(cw / base.w, 1));
  return {
    ...common,
    kind: item.type,
    source: src.source,
    ready: src.ready,
    srcW: src.srcW,
    srcH: src.srcH,
    frameW: base.w * k,
    frameH: base.h * k,
  };
}
