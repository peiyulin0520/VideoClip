import { Application, CanvasSource, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import 'pixi.js/advanced-blend-modes';
import type { BlendMode, Crop, Outline } from '../model/types';
import type { Box } from './geometry';

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
  opacity: number;
  blend: BlendMode;
  cornerRadius: number; // 0–0.5
  outline?: Outline;
};

type Obj = {
  container: Container;
  sprite: Sprite;
  texture: Texture | null;
  textureSource: CanvasSource | null;
  frameCanvas: HTMLCanvasElement | null;
  frameCtx: CanvasRenderingContext2D | null;
  textKey: string | undefined;
  hasFrame: boolean;
  mask: Graphics | null;
  outline: Graphics | null;
  maskKey: string;
  outlineKey: string;
};

export class Compositor {
  private objs = new Map<string, Obj>();
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
      if (stage.children[index] !== o.container)
        stage.addChildAt(o.container, Math.min(index, stage.children.length));
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
    o = {
      container,
      sprite,
      texture: null,
      textureSource: null,
      frameCanvas: null,
      frameCtx: null,
      textKey: undefined,
      hasFrame: false,
      mask: null,
      outline: null,
      maskKey: '',
      outlineKey: '',
    };
    this.objs.set(layer.id, o);
    return o;
  }

  private setSource(o: Obj, canvas: HTMLCanvasElement) {
    o.texture?.destroy(false);
    o.textureSource?.destroy();
    o.textureSource = new CanvasSource({ resource: canvas, scaleMode: 'linear' });
    o.texture = new Texture({ source: o.textureSource });
    o.sprite.texture = o.texture;
  }

  private update(o: Obj, layer: SceneLayer) {
    // ---- 內容 ----
    if (layer.kind === 'text') {
      if (o.textKey !== layer.textKey || !o.texture) {
        this.setSource(o, layer.source as HTMLCanvasElement);
        o.textKey = layer.textKey;
        o.hasFrame = true;
      }
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

    // ---- 圓角遮罩 ----
    const radius = Math.min(layer.cornerRadius * Math.min(box.w, box.h), Math.min(box.w, box.h) / 2);
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

    // ---- 外框（畫在框內側，方框大小不變，選取框才對得準）----
    if (layer.outline && layer.outline.width > 0) {
      const w = layer.outline.width * (this.width / 1080);
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

  private destroyObj(o: Obj) {
    o.container.parent?.removeChild(o.container);
    o.container.destroy({ children: true });
    o.texture?.destroy(false);
    o.textureSource?.destroy();
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
