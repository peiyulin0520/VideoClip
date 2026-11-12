import { createOverlayClip, createTextItem } from '../model/defaults';
import type { Asset, VideoItem } from '../model/types';
import {
  aabb,
  fittedSize,
  itemBox,
  pointInBox,
  selectionBox,
  snapMove,
  snapRotation,
  SAFE_BOTTOM,
  topHit,
  hitTestAll,
  nextHit,
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

  it('selectionBox：文字用「看得到的內容」，不是含透明邊的整張畫布；內容偏一邊時中心跟著偏（含旋轉）', () => {
    const textCtx: GeoCtx = {
      ...ctx,
      // 畫布 400×200，看得到的內容只有左上角 100×40（x=20,y=10）→ 內容中心 (70,30)，畫布中心 (200,100)
      textSize: () => ({ w: 400, h: 200, content: { x: 20, y: 10, w: 100, h: 40 } }),
    };
    const it = createTextItem(0);
    const b = selectionBox(it, textCtx)!;
    expect(b.w).toBe(100);
    expect(b.h).toBe(40);
    expect(b.cx).toBeCloseTo(540 + (70 - 200)); // 偏左
    expect(b.cy).toBeCloseTo(960 + (30 - 100)); // 偏上
    // 縮放 2 倍：大小和偏移都乘 2
    const b2 = selectionBox({ ...it, transform: { ...it.transform, scale: 2 } }, textCtx)!;
    expect(b2.w).toBe(200);
    expect(b2.cx).toBeCloseTo(540 + 2 * (70 - 200));
    // 轉 90°：偏移 (-130,-70) 順時針轉 90° → (70,-130)
    const b3 = selectionBox({ ...it, transform: { ...it.transform, rotation: 90 } }, textCtx)!;
    expect(b3.cx).toBeCloseTo(540 + 70);
    expect(b3.cy).toBeCloseTo(960 - 130);
    // 沒有 content 資訊就退回整張畫布
    expect(selectionBox(it, ctx)!.w).toBe(400);
    // 影片不受影響
    const v: VideoItem = { ...createOverlayClip(asset, 0), assetId: 'a' };
    expect(selectionBox(v, ctx)).toEqual(itemBox(v, ctx));
  });

  it('topHit：很小的物件點選範圍至少 minSize', () => {
    const tiny: GeoCtx = { ...ctx, textSize: () => ({ w: 20, h: 20 }) };
    const layer = {
      item: createTextItem(0),
      track: { id: 't', kind: 'text', name: 't', hidden: false, locked: false, items: [] },
      trackIndex: 1,
    } as never;
    expect(topHit([layer], tiny, 540 + 30, 960)).toBeNull();
    expect(topHit([layer], tiny, 540 + 30, 960, 80)).toBeTruthy();
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
      kind: 'media' as const,
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

  it('hitTestAll：疊三層由上到下，鎖定的不在裡面，點在外面是空的', () => {
    const mk = (id: string) => ({ ...createOverlayClip(asset, 0), id });
    const track = (locked: boolean) => ({
      id: 't',
      kind: 'media' as const,
      name: '',
      hidden: false,
      locked,
      items: [],
    });
    const layers = [
      { item: mk('a'), track: track(false), trackIndex: 1 },
      { item: mk('b'), track: track(true), trackIndex: 2 },
      { item: mk('c'), track: track(false), trackIndex: 3 },
    ];
    expect(hitTestAll(layers, ctx, 540, 960).map((l) => l.item.id)).toEqual(['c', 'a']);
    expect(hitTestAll(layers, ctx, 5, 5)).toEqual([]);
  });

  it('nextHit：沒選＝最上面；已選＝下一層，到底回最上面；選的不在裡面＝最上面', () => {
    const hits = ['top', 'mid', 'low'].map((id) => ({ item: { id } }));
    expect(nextHit(hits, null)!.item.id).toBe('top');
    expect(nextHit(hits, 'top')!.item.id).toBe('mid');
    expect(nextHit(hits, 'mid')!.item.id).toBe('low');
    expect(nextHit(hits, 'low')!.item.id).toBe('top');
    expect(nextHit(hits, 'other')!.item.id).toBe('top');
    expect(nextHit([{ item: { id: 'x' } }], 'x')!.item.id).toBe('x'); // 只有一個：維持
    expect(nextHit([], 'x')).toBeNull();
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
