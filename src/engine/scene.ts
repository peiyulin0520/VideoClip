import type { Asset, Item, Project, Track, VideoItem } from '../model/types';
import type { SceneLayer } from './compositor';
import { fittedSize, itemBox, type GeoCtx } from './geometry';
import { renderText, measureTextItem, uiScale } from './textRender';
import { visibleLayers } from './timeline';
import { composeWith, motionOffset } from './groupTransform';
import { cellRect } from './layouts';

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

const fillCanvases = new Map<string, HTMLCanvasElement>();
/** 色塊貼圖（純色小畫布，各顏色共用） */
function solidCanvas(color: string): HTMLCanvasElement {
  let c = fillCanvases.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 8;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = color;
      g.fillRect(0, 0, 8, 8);
    }
    fillCanvases.set(color, c);
  }
  return c;
}

export const FILL_COLORS = { black: '#000000', white: '#ffffff' } as const;

/** 版型外框（代表整個版型的那一個物件）；動畫、整組變形都看它 */
function frameOf(project: Project, group: string): { item: VideoItem } | null {
  for (const tr of project.tracks)
    if (tr.groupRole === 'frame') {
      const it = tr.items.find((x) => x.type !== 'text' && x.group === group);
      if (it && it.type !== 'text') return { item: it };
    }
  return null;
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
  const live = new Map(visibleLayers(project, t).map((l) => [l.trackIndex, l]));
  project.tracks.forEach((track, i) => {
    const l = live.get(i);
    const group = l?.item.type !== 'text' && l?.item.type !== 'audio' ? l?.item.group : track.group;
    const frame = group ? frameOf(project, group) : null;
    // 版型整組動畫（捲動、滑入滑出）：整組的位置一起偏移
    const off = frame
      ? motionOffset(frame.item.motion, t - frame.item.start, frame.item.duration)
      : { x: 0, y: 0 };
    if (l) {
      const layer = toLayer(l.item, track, project, ctx, provide);
      if (layer) {
        layer.box = { ...layer.box, cx: layer.box.cx + off.x * canvasW, cy: layer.box.cy + off.y * canvasH };
        out.push(layer);
      }
    } else if (track.groupRole === 'cell' && track.fill && !track.hidden && frame) {
      // 這一格沒有素材可播（放完了或空位）：顯示色塊，湊滿版型的秒數
      const fr = frame.item;
      if (t < fr.start || t >= fr.start + fr.duration) return;
      const ref = track.items.find((x) => x.type !== 'text' && x.cell);
      if (!ref || ref.type === 'text' || !ref.cell) return;
      const r = cellRect(ref.cell, canvasW, canvasH);
      const c = composeWith(
        { x: (r.x + r.w / 2) / canvasW, y: (r.y + r.h / 2) / canvasH, scale: 1, rotation: 0, opacity: 1 },
        fr.transform,
        canvasW,
        canvasH,
      );
      const color = FILL_COLORS[track.fill];
      out.push({
        id: `fill-${track.id}`,
        kind: 'text',
        source: solidCanvas(color),
        ready: true,
        srcW: 8,
        srcH: 8,
        textKey: `fill-${color}`,
        box: {
          cx: c.x * canvasW + off.x * canvasW,
          cy: c.y * canvasH + off.y * canvasH,
          w: r.w * fr.transform.scale,
          h: r.h * fr.transform.scale,
          rotation: fr.transform.rotation,
        },
        opacity: fr.transform.opacity,
        blend: 'normal',
        cornerRadius: 0,
      });
    }
  });
  return out;
}

function toLayer(
  item: Item,
  track: Track,
  project: Project,
  ctx: GeoCtx,
  provide: SourceProvider,
): SceneLayer | null {
  if (item.type === 'audio') return null;
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
    const r = renderText(item.card, uiScale(ctx.canvasW, ctx.canvasH));
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
    mask: item.mask,
    source: src.source,
    ready: src.ready,
    srcW: src.srcW,
    srcH: src.srcH,
    frameW: base.w * k,
    frameH: base.h * k,
  };
}
