import type { Asset, Item, Project, Track, VideoItem } from '../model/types';
import type { SceneLayer } from './compositor';
import { fittedSize, itemBox, type GeoCtx } from './geometry';
import { renderText, measureTextItem, uiScale } from './textRender';
import { visibleLayers } from './timeline';
import { composeWith, motionOffset } from './groupTransform';
import { cellRect, cellTransform } from './layouts';
import { maskCanvasFor } from './maskBitmap';
import {
  activeTransition,
  applyLook,
  clipPx,
  effectFrame,
  itemEffectAt,
  type ClipFrac,
  type Cover,
} from './transitions';

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

let flashCanvas: HTMLCanvasElement | null = null;
/** 暖色閃光：中間亮橘黃、四周稍微暗一點的暖色（程式畫的，不用外部素材） */
function warmFlashCanvas(): HTMLCanvasElement {
  if (!flashCanvas) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    if (g) {
      const rg = g.createRadialGradient(32, 32, 0, 32, 32, 46);
      rg.addColorStop(0, 'rgba(255,236,190,1)');
      rg.addColorStop(0.55, 'rgba(255,184,96,0.92)');
      rg.addColorStop(1, 'rgba(235,120,50,0.75)');
      g.fillStyle = rg;
      g.fillRect(0, 0, 64, 64);
    }
    flashCanvas = c;
  }
  return flashCanvas;
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

/**
 * 這個時間點要畫的所有物件（含轉場期間延長／提前的虛擬物件）。匯出時要先備好這些物件的畫面，所以獨立成函式。
 */
export function sceneItems(project: Project, t: number): { item: Item; track: Track }[] {
  const out: { item: Item; track: Track }[] = [];
  const live = new Map(visibleLayers(project, t).map((l) => [l.trackIndex, l]));
  project.tracks.forEach((track, i) => {
    const at =
      track.kind !== 'audio' && !track.hidden && !track.groupRole ? activeTransition(track.items, t) : null;
    if (at) {
      for (const x of [at.a, at.b]) if (x) out.push({ item: x, track });
      return;
    }
    const l = live.get(i);
    if (l) out.push({ item: l.item, track });
  });
  return out;
}

/** 依專案與時間算出要畫的圖層（由下到上）。canvasW/H 是合成器畫布的像素。 */
export function buildScene(
  project: Project,
  t: number,
  canvasW: number,
  canvasH: number,
  provide: SourceProvider,
  opts: { guardCells?: boolean } = {},
): SceneLayer[] {
  const ctx = geoCtx(project, canvasW, canvasH);
  const out: SceneLayer[] = [];
  const live = new Map(visibleLayers(project, t).map((l) => [l.trackIndex, l]));
  // 轉場期間要蓋的顏色層（蓋在最上面）
  const covers: { id: string; c: Cover }[] = [];
  project.tracks.forEach((track, i) => {
    const l = live.get(i);
    const li = l?.item;
    const group = li && li.type !== 'text' && li.type !== 'audio' ? li.group : track.group;
    const frame = group ? frameOf(project, group) : null;
    // 版型整組動畫（捲動、滑入滑出）：整組的位置一起偏移
    const off = frame
      ? motionOffset(frame.item.motion, t - frame.item.start, frame.item.duration)
      : { x: 0, y: 0 };
    const at =
      track.kind !== 'audio' && !track.hidden && !track.groupRole ? activeTransition(track.items, t) : null;
    if (at) {
      // 轉場期間：A、B 兩段同時畫（B 在上或 A 在上看轉場種類），各自套上位移、縮放、透明度、裁切、模糊
      const mk = (item: Item | null, look: (typeof at.frame)['a']): SceneLayer | null => {
        if (!item) return null;
        const layer = toLayer(item, track, project, ctx, provide);
        if (!layer) return null;
        layer.box = applyLook(layer.box, look, canvasW, canvasH);
        layer.opacity *= look.opacity;
        if (look.clip) layer.clip = clipPx(look.clip, canvasW, canvasH);
        if (look.blur) layer.blur = look.blur * Math.min(canvasW, canvasH);
        return layer;
      };
      const A = mk(at.a, at.frame.a);
      const B = mk(at.b, at.frame.b);
      for (const x of at.frame.bOnTop ? [A, B] : [B, A]) if (x) out.push(x);
      at.frame.covers.forEach((c, n) => covers.push({ id: `${i}-${n}`, c }));
    } else if (l) {
      const layer = toLayer(
        opts.guardCells === false ? l.item : guardCell(l.item, frame?.item, project, canvasW, canvasH),
        track,
        project,
        ctx,
        provide,
      );
      if (layer) {
        layer.box = { ...layer.box, cx: layer.box.cx + off.x * canvasW, cy: layer.box.cy + off.y * canvasH };
        // 單一素材的進場／出場特效（版型整組的另外處理）
        const fx = group ? null : itemEffectAt(l.item, t - l.item.start);
        if (fx) applyItemEffect(layer, fx, canvasW, canvasH, covers, `${i}`);
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
  // 轉場的顏色層：蓋在最上面
  for (const { id, c } of covers) {
    const r = c.rect ?? [0, 0, 1, 1];
    out.push({
      id: `cover-${id}`,
      kind: 'text',
      source: c.kind === 'flash' ? warmFlashCanvas() : solidCanvas(c.color),
      ready: true,
      srcW: c.kind === 'flash' ? 64 : 8,
      srcH: c.kind === 'flash' ? 64 : 8,
      textKey: c.kind === 'flash' ? 'flash-warm' : `fill-${c.color}`,
      box: {
        cx: (r[0] + r[2] / 2) * canvasW,
        cy: (r[1] + r[3] / 2) * canvasH,
        w: r[2] * canvasW,
        h: r[3] * canvasH,
        rotation: 0,
      },
      opacity: c.alpha,
      blend: 'normal',
      cornerRadius: 0,
    });
  }
  return out;
}

/** 把單一素材的進出場特效套到它的圖層：位移照畫面比例、縮放與裁切、顏色層都以「素材自己的方框」為準 */
function applyItemEffect(
  layer: SceneLayer,
  fx: Parameters<typeof effectFrame>[0],
  W: number,
  H: number,
  covers: { id: string; c: Cover }[],
  id: string,
) {
  const { look, covers: cs } = effectFrame(fx);
  const b0 = layer.box;
  const left = b0.cx - b0.w / 2;
  const top = b0.cy - b0.h / 2;
  const rel = (r: [number, number, number, number]): [number, number, number, number] => [
    left + r[0] * b0.w,
    top + r[1] * b0.h,
    r[2] * b0.w,
    r[3] * b0.h,
  ];
  layer.box = {
    ...b0,
    cx: b0.cx + look.dx * W,
    cy: b0.cy + look.dy * H,
    w: b0.w * look.scale,
    h: b0.h * look.scale,
  };
  layer.opacity *= look.opacity;
  const dx = look.dx * W;
  const dy = look.dy * H;
  if (look.clip) {
    const c: ClipFrac = look.clip;
    layer.clip =
      c.kind === 'rects'
        ? { rects: c.rects.map((r) => rel(r)).map(([x, y, w, h]) => [x + dx, y + dy, w, h]) }
        : {
            circle: {
              cx: left + c.cx * b0.w + dx,
              cy: top + c.cy * b0.h + dy,
              r: c.r * Math.max(b0.w, b0.h),
            },
          };
  }
  if (look.blur) layer.blur = look.blur * Math.min(W, H);
  cs.forEach((c, n) => {
    const r = c.rect ?? [0, 0, 1, 1];
    // 顏色層直接換成畫面像素（比例）貼在素材的方框上
    const px = rel(r);
    covers.push({
      id: `${id}-fx${n}`,
      c: { ...c, rect: [px[0] / W, px[1] / H, px[2] / W, px[3] / H] },
    });
  });
}

/**
 * 版型格子的保險：格子應該永遠在外框的洞裡（由「格子在版型自己座標裡的位置」套上整組的變形算出來）。
 * 如果存的 transform 跟這個差太多（有哪一條路徑單獨動了格子造成跑版），以算出來的為準。
 */
export function guardCell(
  item: Item,
  frame: VideoItem | undefined,
  project: Project,
  W: number,
  H: number,
): Item {
  if (item.type === 'text' || item.type === 'audio' || !item.cell || !frame || item.group !== frame.group)
    return item;
  const asset = project.assets.find((a) => a.id === item.assetId);
  if (!asset) return item;
  const want = composeWith(
    cellTransform(asset, item.crop, cellRect(item.cell, W, H), W, H),
    frame.transform,
    W,
    H,
  );
  const cur = item.transform;
  const off = Math.max(Math.abs(cur.x - want.x), Math.abs(cur.y - want.y));
  const ratio = want.scale > 1e-9 ? cur.scale / want.scale : 1;
  if (off < 0.02 && Math.abs(ratio - 1) < 0.02 && Math.abs(cur.rotation - want.rotation) < 1) return item;
  return { ...item, transform: { ...want, opacity: cur.opacity } };
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
  const maskCanvas = item.maskBitmap ? maskCanvasFor(item.maskBitmap) : undefined;
  // 暫存畫面的解析度：scale=1 時的顯示大小，最多放大 2 倍（縮放手勢時才不會一直重建貼圖）
  const crop = item.crop ?? { l: 0, t: 0, r: 0, b: 0 };
  const cw = Math.max(asset.width * (1 - crop.l - crop.r), 1);
  const ch = Math.max(asset.height * (1 - crop.t - crop.b), 1);
  const base = fittedSize(cw, ch, ctx.canvasW, ctx.canvasH, item.fit);
  const k = Math.min(2, Math.max(cw / base.w, 1));
  return {
    ...common,
    kind: item.type,
    mask: item.maskBitmap ? undefined : item.mask,
    maskBitmap: maskCanvas,
    maskKey: item.maskBitmap ? item.maskBitmap.slice(-48) + item.maskBitmap.length : undefined,
    source: src.source,
    ready: src.ready && (!item.maskBitmap || !!maskCanvas), // 遮罩還在解碼：先不畫，免得閃一下沒遮罩的樣子
    srcW: src.srcW,
    srcH: src.srcH,
    frameW: base.w * k,
    frameH: base.h * k,
  };
}
