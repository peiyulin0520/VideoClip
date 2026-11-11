import { createOverlayClip, createTextItem } from '../model/defaults';
import type { Asset, VideoItem } from '../model/types';
import {
  aabb,
  fittedSize,
  itemBox,
  pointInBox,
  snapMove,
  snapRotation,
  SAFE_BOTTOM,
  topHit,
  type GeoCtx,
} from './geometry';

const asset: Asset = {
  id: 'a',
  kind: 'video',
  name: 'a',
  mime: 'video/webm',
  size: 1,
  duration: 5,
  width: 1000,
  height: 500,
  hasAudio: false,
  thumbs: [],
};
const ctx: GeoCtx = { canvasW: 1080, canvasH: 1920, assets: [asset], textSize: () => ({ w: 400, h: 100 }) };

describe('geometry', () => {
  it('cover / contain', () => {
    expect(fittedSize(1000, 500, 1080, 1920, 'contain')).toEqual({ w: 1080, h: 540 });
    const c = fittedSize(1000, 500, 1080, 1920, 'cover');
    expect(c.h).toBeCloseTo(1920);
    expect(c.w).toBeCloseTo(3840);
  });

  it('itemBox：完整顯示 × scale、中心點在 x,y；裁切會改變比例', () => {
    const it: VideoItem = { ...createOverlayClip(asset, 0), assetId: 'a' }; // contain, scale 0.5
    const b = itemBox(it, ctx)!;
    expect(b.w).toBeCloseTo(540);
    expect(b.h).toBeCloseTo(270);
    expect(b.cx).toBe(540);
    expect(b.cy).toBe(960);
    const cropped = itemBox({ ...it, crop: { l: 0.5, t: 0, r: 0, b: 0 } }, ctx)!; // 寬剩一半 → 500x500 方形
    expect(cropped.w).toBeCloseTo(cropped.h);
    expect(itemBox({ ...it, assetId: 'missing' }, ctx)).toBeNull();
  });

  it('文字用量到的大小', () => {
    const b = itemBox(createTextItem(0), ctx)!;
    expect(b.w).toBe(400);
    expect(b.h).toBe(100);
  });

  it('旋轉後的點擊判斷', () => {
    const box = { cx: 500, cy: 500, w: 400, h: 100, rotation: 90 }; // 轉 90°：變成直的 100×400
    expect(pointInBox(box, 500, 650)).toBe(true);
    expect(pointInBox(box, 650, 500)).toBe(false);
    const r = aabb(box);
    expect(r.r - r.l).toBeCloseTo(100);
    expect(r.b - r.t).toBeCloseTo(400);
  });

  it('topHit：最上面的優先，鎖定的跳過', () => {
    const mk = (id: string) => ({ ...createOverlayClip(asset, 0), id });
    const track = (locked: boolean) => ({
      id: 't',
      kind: 'overlay' as const,
      name: '',
      hidden: false,
      locked,
      items: [],
    });
    const layers = [
      { item: mk('low'), track: track(false), trackIndex: 1 },
      { item: mk('high'), track: track(false), trackIndex: 2 },
    ];
    expect(topHit(layers, ctx, 540, 960)!.item.id).toBe('high');
    layers[1]!.track = track(true);
    expect(topHit(layers, ctx, 540, 960)!.item.id).toBe('low');
    expect(topHit(layers, ctx, 5, 5)).toBeNull();
  });

  it('吸附：靠近中心線與安全區邊界時吸過去，太遠不吸', () => {
    const near = { cx: 540 + 6, cy: 960 - 5, w: 200, h: 200, rotation: 0 };
    const s = snapMove(near, 1080, 1920, 10);
    expect(s.dx).toBeCloseTo(-6);
    expect(s.dy).toBeCloseTo(5);
    expect(s.guideX).toBe(540);
    expect(s.guideY).toBe(960);
    const far = snapMove({ cx: 700, cy: 600, w: 200, h: 200, rotation: 0 }, 1080, 1920, 10);
    expect(far).toEqual({ dx: 0, dy: 0, guideX: null, guideY: null });
    // 下緣靠近安全區上邊界（底部 250/1920）
    const safeY = 1920 * (1 - SAFE_BOTTOM);
    const b = snapMove({ cx: 300, cy: safeY - 100 + 4, w: 100, h: 200, rotation: 0 }, 1080, 1920, 10);
    expect(b.guideY).toBeCloseTo(safeY);
    expect(
      snapMove({ cx: 300, cy: safeY - 100 + 4, w: 100, h: 200, rotation: 0 }, 1080, 1920, 10, false).guideY,
    ).toBeNull();
  });

  it('旋轉吸附到 45 度倍數', () => {
    expect(snapRotation(2)).toBe(0);
    expect(snapRotation(43)).toBe(45);
    expect(snapRotation(-88)).toBe(-90);
    expect(snapRotation(20)).toBe(20);
  });
});
