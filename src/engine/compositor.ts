import {
  Application,
  BlurFilter,
  CanvasSource,
  Container,
  Graphics,
  ImageSource,
  Rectangle,
  Sprite,
  Texture,
} from 'pixi.js';
import 'pixi.js/advanced-blend-modes';
import type { BlendMode, Crop, Outline } from '../model/types';
import type { Box } from './geometry';
import { uiScale } from './textRender';

/** 每個 <video> 已經呈現過幾個新畫面（requestVideoFrameCallback）；沒有這個 API 就回傳 null */
const frameCounts = new WeakMap<HTMLVideoElement, number>();
function videoFrameCount(v: HTMLVideoElement): number | null {
  if (typeof v.requestVideoFrameCallback !== 'function') return null;
  if (!frameCounts.has(v)) {
    frameCounts.set(v, 0);
    const loop = () => {
      frameCounts.set(v, (frameCounts.get(v) ?? 0) + 1);
      v.requestVideoFrameCallback(loop);
    };
    v.requestVideoFrameCallback(loop);
  }
  return frameCounts.get(v)!;
}

export type LayerSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap;

/** 一個要畫的圖層（由 scene.ts 依專案與時間算出）。座標都是合成器畫布的像素。 */
export type SceneLayer = {
  id: string;
  kind: 'video' | 'image' | 'text';
  source: LayerSource;
  /** 來源目前能不能取到畫面（影片正在 seek / 還沒載入就是 false，保留上一格） */
  ready: boolean;
  /** 來源的原始像素大小（文字用文字畫布大小） */
  srcW: number;
  srcH: number;
  box: Box;
  /** 文字：內容改變時才重新上傳貼圖 */
  textKey?: string;
  /** 影片/照片：暫存畫面的解析度（固定，免得縮放手勢時一直重建貼圖） */
  frameW?: number;
  frameH?: number;
  crop?: Crop;
  /** 自由形狀遮罩：多邊形，座標是原始素材畫面的比例（搭配 crop 換算到方框內） */
  mask?: [number, number][];
  /** 點陣圖遮罩（整張原始畫面的 canvas，不透明＝留下）；maskKey 變了才重建貼圖 */
  maskBitmap?: HTMLCanvasElement;
  maskKey?: string;
  opacity: number;
  blend: BlendMode;
  cornerRadius: number; // 0–0.5
  outline?: Outline;
  /** 轉場：只畫這個範圍裡面的（畫布像素；矩形可以有好幾塊，或一個圓） */
  clip?: { rects?: [number, number, number, number][]; circle?: { cx: number; cy: number; r: number } };
  /** 轉場：模糊程度（畫布像素） */
  blur?: number;
};

type Obj = {
  /** 最外層（沒有位移旋轉）：轉場的裁切遮罩用畫布座標，掛在這一層 */
  holder: Container;
  container: Container;
  clip: Graphics | null;
  clipKey: string;
  blurF: BlurFilter | null;
  sprite: Sprite;
  texture: Texture | null;
  textureSource: CanvasSource | ImageSource | null;
  /** 影片「直接當貼圖」模式：不經過暫存畫布，每格只通知 GPU 重新上傳 */
  videoEl: HTMLVideoElement | null;
  videoKey: string;
  uploadKey: string;
  frameCanvas: HTMLCanvasElement | null;
  frameCtx: CanvasRenderingContext2D | null;
  textKey: string | undefined;
  hasFrame: boolean;
  mask: Graphics | null;
  outline: Graphics | null;
  maskKey: string;
  outlineKey: string;
  shape: Graphics | null;
  shapeKey: string;
  maskSprite: Sprite | null;
  maskSpriteKey: string;
};

export class Compositor {
  private objs = new Map<string, Obj>();
  /** 這一輪合成裡，影片貼圖上傳（update）花的毫秒；Player 讀走後歸零 */
  private uploadMs = 0;
  private constructor(
    private app: Application,
    readonly width: number,
    readonly height: number,
  ) {}

  static async create(opts: {
    width: number;
    height: number;
    canvas?: HTMLCanvasElement;
  }): Promise<Compositor> {
    const app = new Application();
    await app.init({
      canvas: opts.canvas,
      width: opts.width,
      height: opts.height,
      background: 0x000000,
      antialias: true,
      resolution: 1,
      autoDensity: false,
      autoStart: false,
      preference: 'webgl',
      preserveDrawingBuffer: true,
    });
    app.ticker.stop();
    return new Compositor(app, opts.width, opts.height);
  }

  takeUploadMs(): number {
    const v = this.uploadMs;
    this.uploadMs = 0;
    return v;
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas as HTMLCanvasElement;
  }

  render(layers: SceneLayer[]): void {
    const stage = this.app.stage;
    const seen = new Set<string>();
    let allReady = true;

    layers.forEach((layer, index) => {
      seen.add(layer.id);
      if (!layer.ready) allReady = false;
      const o = this.ensure(layer);
      this.update(o, layer);
      if (stage.children[index] !== o.holder)
        stage.addChildAt(o.holder, Math.min(index, stage.children.length));
    });

    // 還沒準備好的新圖層出現時，先留著舊圖層（例如換片時的上一個片段），避免閃黑
    if (allReady) {
      for (const [id, o] of this.objs) {
        if (!seen.has(id)) {
          this.destroyObj(o);
          this.objs.delete(id);
        }
      }
    }
    this.app.renderer.render({ container: stage });
  }

  private ensure(layer: SceneLayer): Obj {
    let o = this.objs.get(layer.id);
    if (o) return o;
    const container = new Container();
    const sprite = new Sprite();
    sprite.anchor.set(0.5);
    container.addChild(sprite);
    container.visible = false;
    const holder = new Container();
    holder.addChild(container);
    o = {
      holder,
      clip: null,
      clipKey: '',
      blurF: null,
      container,
      sprite,
      texture: null,
      textureSource: null,
      videoEl: null,
      videoKey: '',
      uploadKey: '',
      frameCanvas: null,
      frameCtx: null,
      textKey: undefined,
      hasFrame: false,
      mask: null,
      outline: null,
      maskKey: '',
      outlineKey: '',
      shape: null,
      shapeKey: '',
      maskSprite: null,
      maskSpriteKey: '',
    };
    this.objs.set(layer.id, o);
    return o;
  }

  private setSource(o: Obj, canvas: HTMLCanvasElement) {
    this.dropTexture(o);
    o.textureSource = new CanvasSource({ resource: canvas, scaleMode: 'linear' });
    o.texture = new Texture({ source: o.textureSource });
    o.sprite.texture = o.texture;
  }

  private dropTexture(o: Obj) {
    o.texture?.destroy(false);
    o.textureSource?.destroy();
    o.texture = null;
    o.textureSource = null;
    o.videoEl = null;
    o.videoKey = '';
    o.uploadKey = '';
  }

  /** 影片直接當貼圖：裁切改用貼圖的子矩形，不再每格 drawImage 到暫存畫布 */
  private updateVideo(o: Obj, layer: SceneLayer, v: HTMLVideoElement) {
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!layer.ready || vw <= 0 || vh <= 0) return; // 保留上一格
    const key = `${v.currentSrc}|${vw}x${vh}`;
    if (o.videoEl !== v || o.videoKey !== key || !o.texture) {
      this.dropTexture(o);
      const src = new ImageSource({ resource: v, scaleMode: 'linear', autoGarbageCollect: false });
      o.textureSource = src;
      o.texture = new Texture({ source: src, frame: new Rectangle(0, 0, vw, vh), dynamic: true });
      o.sprite.texture = o.texture;
      o.videoEl = v;
      o.videoKey = key;
      o.hasFrame = false;
    }
    const c = layer.crop ?? { l: 0, t: 0, r: 0, b: 0 };
    const f = o.texture.frame;
    const x = vw * c.l;
    const y = vh * c.t;
    const w = Math.max(vw * (1 - c.l - c.r), 1);
    const h = Math.max(vh * (1 - c.t - c.b), 1);
    if (f.x !== x || f.y !== y || f.width !== w || f.height !== h) {
      f.x = x;
      f.y = y;
      f.width = w;
      f.height = h;
      o.texture.update(); // 通知精靈：貼圖的範圍改了
    }
    // 影片沒有新畫面（暫停、或螢幕更新比影片快）就不重新上傳：播放中看「呈現過幾個新畫面」，
    // 暫停（拖時間軸 seek）時看 currentTime（iPhone 播放中 currentTime 每次都不一樣，用它會每次都上傳）
    const fc = v.paused ? null : videoFrameCount(v);
    const uploadKey = fc === null ? `t${v.currentTime}` : `f${fc}`;
    if (!o.hasFrame || o.uploadKey !== uploadKey) {
      try {
        const t0 = performance.now();
        o.textureSource?.update();
        this.uploadMs += performance.now() - t0;
        o.hasFrame = true;
        o.uploadKey = uploadKey;
      } catch {
        /* 解碼中，保留上一格 */
      }
    }
  }

  private update(o: Obj, layer: SceneLayer) {
    // ---- 內容 ----
    if (layer.kind === 'text') {
      if (o.textKey !== layer.textKey || !o.texture) {
        this.setSource(o, layer.source as HTMLCanvasElement);
        o.textKey = layer.textKey;
        o.hasFrame = true;
      }
    } else if (layer.kind === 'video' && layer.source instanceof HTMLVideoElement) {
      this.updateVideo(o, layer, layer.source);
    } else {
      const fw = Math.max(Math.round(layer.frameW ?? layer.box.w), 2);
      const fh = Math.max(Math.round(layer.frameH ?? layer.box.h), 2);
      if (!o.frameCanvas || o.frameCanvas.width !== fw || o.frameCanvas.height !== fh) {
        const c = o.frameCanvas ?? document.createElement('canvas');
        c.width = fw;
        c.height = fh;
        o.frameCanvas = c;
        o.frameCtx = c.getContext('2d');
        this.setSource(o, c);
        o.hasFrame = false;
      }
      if (layer.ready && o.frameCtx) {
        const crop = layer.crop ?? { l: 0, t: 0, r: 0, b: 0 };
        const sx = layer.srcW * crop.l;
        const sy = layer.srcH * crop.t;
        const sw = Math.max(layer.srcW * (1 - crop.l - crop.r), 1);
        const sh = Math.max(layer.srcH * (1 - crop.t - crop.b), 1);
        try {
          o.frameCtx.drawImage(layer.source, sx, sy, sw, sh, 0, 0, fw, fh);
          o.textureSource?.update();
          o.hasFrame = true;
        } catch {
          /* 來源暫時畫不出來（解碼中），保留上一格 */
        }
      }
    }

    // ---- 位置、大小、旋轉、透明度、混合 ----
    const { box } = layer;
    o.container.visible = o.hasFrame;
    o.container.position.set(box.cx, box.cy);
    o.container.rotation = (box.rotation * Math.PI) / 180;
    o.container.alpha = layer.opacity;
    o.sprite.width = box.w;
    o.sprite.height = box.h;
    o.sprite.blendMode = layer.blend;
    this.applyClipBlur(o, layer);

    // ---- 遮罩：自由形狀（多邊形）優先，沒有才用圓角 ----
    const radius = Math.min(layer.cornerRadius * Math.min(box.w, box.h), Math.min(box.w, box.h) / 2);
    const poly = layer.mask && layer.mask.length >= 3 ? layer.mask : null;
    if (layer.maskBitmap) {
      // 點陣圖遮罩：貼圖只取留下來的那一塊（crop），大小跟畫面一樣
      const c = layer.crop ?? { l: 0, t: 0, r: 0, b: 0 };
      const bw = layer.maskBitmap.width;
      const bh = layer.maskBitmap.height;
      const key = `${layer.maskKey}|${c.l}|${c.t}|${c.r}|${c.b}`;
      if (!o.maskSprite || o.maskSpriteKey !== key) {
        o.maskSprite?.texture.destroy(false);
        const source = new CanvasSource({ resource: layer.maskBitmap, scaleMode: 'linear' });
        const tex = new Texture({
          source,
          frame: new Rectangle(
            bw * c.l,
            bh * c.t,
            Math.max(bw * (1 - c.l - c.r), 1),
            Math.max(bh * (1 - c.t - c.b), 1),
          ),
        });
        if (!o.maskSprite) {
          o.maskSprite = new Sprite(tex);
          o.maskSprite.anchor.set(0.5);
          o.container.addChild(o.maskSprite);
        } else o.maskSprite.texture = tex;
        o.maskSpriteKey = key;
      }
      o.maskSprite.width = box.w;
      o.maskSprite.height = box.h;
      o.sprite.mask = o.maskSprite;
      this.finishOutline(o, layer, radius);
      return;
    }
    if (o.maskSprite) {
      o.sprite.mask = null;
      o.container.removeChild(o.maskSprite);
      o.maskSprite.texture.destroy(false);
      o.maskSprite.destroy();
      o.maskSprite = null;
      o.maskSpriteKey = '';
    }
    if (poly) {
      const c = layer.crop ?? { l: 0, t: 0, r: 0, b: 0 };
      const kw = Math.max(1 - c.l - c.r, 0.001);
      const kh = Math.max(1 - c.t - c.b, 0.001);
      const key = `${box.w.toFixed(1)}|${box.h.toFixed(1)}|${c.l}|${c.t}|${c.r}|${c.b}|${poly.length}|${poly[0]![0]}|${poly[poly.length >> 1]![1]}`;
      if (!o.shape) {
        o.shape = new Graphics();
        o.container.addChild(o.shape);
      }
      if (o.shapeKey !== key) {
        const pts = poly.flatMap(([u, v]) => [
          ((u - c.l) / kw - 0.5) * box.w,
          ((v - c.t) / kh - 0.5) * box.h,
        ]);
        o.shape.clear().poly(pts).fill(0xffffff);
        o.shapeKey = key;
      }
      o.sprite.mask = o.shape;
      if (o.mask) {
        o.container.removeChild(o.mask);
        o.mask.destroy();
        o.mask = null;
        o.maskKey = '';
      }
    } else {
      if (o.shape) {
        o.sprite.mask = null;
        o.container.removeChild(o.shape);
        o.shape.destroy();
        o.shape = null;
        o.shapeKey = '';
      }
      if (radius > 0.5) {
        const key = `${box.w.toFixed(1)}|${box.h.toFixed(1)}|${radius.toFixed(1)}`;
        if (!o.mask) {
          o.mask = new Graphics();
          o.container.addChild(o.mask);
        }
        if (o.maskKey !== key) {
          o.mask
            .clear()
            .roundRect(-box.w / 2, -box.h / 2, box.w, box.h, radius)
            .fill(0xffffff);
          o.maskKey = key;
        }
        o.sprite.mask = o.mask;
      } else if (o.mask) {
        o.sprite.mask = null;
        o.container.removeChild(o.mask);
        o.mask.destroy();
        o.mask = null;
        o.maskKey = '';
      }
    }

    this.finishOutline(o, layer, radius);
  }

  private finishOutline(o: Obj, layer: SceneLayer, radius: number) {
    const { box } = layer;
    // ---- 外框（畫在框內側，方框大小不變，選取框才對得準）----
    if (layer.outline && layer.outline.width > 0) {
      const w = layer.outline.width * uiScale(this.width, this.height);
      const key = `${box.w.toFixed(1)}|${box.h.toFixed(1)}|${radius.toFixed(1)}|${w.toFixed(1)}|${layer.outline.color}`;
      if (!o.outline) {
        o.outline = new Graphics();
        o.container.addChild(o.outline);
      }
      if (o.outlineKey !== key) {
        o.outline
          .clear()
          .roundRect(-box.w / 2, -box.h / 2, box.w, box.h, radius)
          .stroke({ width: w, color: layer.outline.color, alignment: 1 });
        o.outlineKey = key;
      }
    } else if (o.outline) {
      o.container.removeChild(o.outline);
      o.outline.destroy();
      o.outline = null;
      o.outlineKey = '';
    }
  }

  /** 轉場用：裁切範圍（畫布座標的遮罩）與模糊 */
  private applyClipBlur(o: Obj, layer: SceneLayer) {
    const c = layer.clip;
    if (c) {
      const key = JSON.stringify(c);
      if (!o.clip) {
        o.clip = new Graphics();
        o.holder.addChild(o.clip);
      }
      if (o.clipKey !== key) {
        o.clip.clear();
        if (c.circle) o.clip.circle(c.circle.cx, c.circle.cy, Math.max(c.circle.r, 0.5)).fill(0xffffff);
        for (const [x, y, w, h] of c.rects ?? []) o.clip.rect(x, y, w, h).fill(0xffffff);
        // 一塊都沒有：遮罩要有東西，不然 Pixi 會當作沒有遮罩 → 畫一個看不到的小點
        if (!c.circle && (c.rects ?? []).length === 0) o.clip.rect(-10, -10, 1, 1).fill(0xffffff);
        o.clipKey = key;
      }
      o.holder.mask = o.clip;
    } else if (o.clip) {
      o.holder.mask = null;
      o.holder.removeChild(o.clip);
      o.clip.destroy();
      o.clip = null;
      o.clipKey = '';
    }
    if (layer.blur && layer.blur > 0.5) {
      if (!o.blurF) o.blurF = new BlurFilter({ strength: layer.blur, quality: 1 });
      o.blurF.strength = layer.blur;
      o.container.filters = [o.blurF];
    } else if (o.blurF) {
      o.container.filters = null;
      o.blurF.destroy();
      o.blurF = null;
    }
  }

  private destroyObj(o: Obj) {
    o.holder.parent?.removeChild(o.holder);
    o.holder.destroy({ children: true });
    this.dropTexture(o);
  }

  /** 讀畫面上某一點的 RGBA（x、y 是合成器畫布像素） */
  samplePixel(x: number, y: number): [number, number, number, number] {
    const { pixels } = this.app.renderer.extract.pixels({
      target: this.app.stage,
      frame: new Rectangle(Math.floor(x), Math.floor(y), 1, 1),
    });
    return [pixels[0]!, pixels[1]!, pixels[2]!, pixels[3]!];
  }

  /** 讀一塊區域的 RGBA（測試用：數某個顏色有幾個像素） */
  readRegion(x: number, y: number, w: number, h: number): Uint8ClampedArray {
    const { pixels } = this.app.renderer.extract.pixels({
      target: this.app.stage,
      frame: new Rectangle(
        Math.floor(x),
        Math.floor(y),
        Math.max(Math.floor(w), 1),
        Math.max(Math.floor(h), 1),
      ),
    });
    return pixels;
  }

  toCanvas(): HTMLCanvasElement {
    // 明確指定 (0,0,寬,高)：不然 Pixi 會用內容的外框，內容超出畫面（例如填滿的影片）時尺寸和位置都會跑掉
    return this.app.renderer.extract.canvas({
      target: this.app.stage,
      frame: new Rectangle(0, 0, this.width, this.height),
    }) as HTMLCanvasElement;
  }

  destroy() {
    for (const o of this.objs.values()) this.destroyObj(o);
    this.objs.clear();
    this.app.destroy(false, { children: true, texture: true });
  }
}
