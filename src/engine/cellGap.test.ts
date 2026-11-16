import { describe, expect, it } from 'vitest';
import type { Item, Project, Track } from '../model/types';
import { cellAt, cellItems, gapFillColor, heldItem, inGap } from './cellGap';
import { layersAt, sourceTimeClamped } from './timeline';

const base = { trimIn: 0, speed: 1, volume: 1, fit: 'cover', transform: {} };
const vid = (id: string, start: number, duration: number, extra: Record<string, unknown> = {}) =>
  ({ id, type: 'video', assetId: 'a', start, duration, ...base, ...extra }) as unknown as Item;
const frame = (gapMode?: 'hold' | 'fill' | 'none', color?: string) =>
  vid('f', 0, 10, {
    group: 'g',
    gapMode,
    frameStyle: color ? { layout: 'x', color, opacity: 1 } : undefined,
  });
const trackOf = (id: string, items: Item[], extra: Partial<Track> = {}) =>
  ({ id, kind: 'media', name: id, hidden: false, locked: false, items, ...extra }) as Track;
const proj = (gap: 'hold' | 'fill' | 'none' | undefined, cellItemsList: Item[], fill?: string) => {
  const cell = trackOf('c1', cellItemsList, { group: 'g', groupRole: 'cell', fill });
  const main = trackOf('main', [frame(gap)]);
  return { tracks: [cell, main], assets: [], width: 1080, height: 1920 } as unknown as Project;
};

describe('cellGap：一格多個素材，空檔畫什麼', () => {
  const two = [vid('a', 0, 2), vid('b', 5, 2)]; // 0–2、5–7，中間空 2–5，後面空 7–10

  it('有素材在播就是它', () => {
    const p = proj('hold', two);
    expect(cellAt(p, p.tracks[0]!, 1)?.id).toBe('a');
    expect(cellAt(p, p.tracks[0]!, 6)?.id).toBe('b');
    expect(cellAt(p, p.tracks[0]!, 1)?.hold).toBeUndefined();
  });

  it('停格：空檔停在前一段最後一格（after）；來源時間在最後一格、不會超過素材結尾', () => {
    const p = proj('hold', two);
    const h = cellAt(p, p.tracks[0]!, 3)!;
    expect(h.id).toBe('a');
    expect(h.hold).toBe('after');
    expect(sourceTimeClamped(h, 3)).toBeCloseTo(2 - 1 / 30, 5);
    // 最後一段之後的空檔也停在最後一段
    const h2 = cellAt(p, p.tracks[0]!, 8)!;
    expect(h2.id).toBe('b');
    expect(sourceTimeClamped(h2, 8)).toBeCloseTo(2 - 1 / 30, 5);
    // 時間往後走，停格的畫面不動
    expect(sourceTimeClamped(cellAt(p, p.tracks[0]!, 4)!, 4)).toBeCloseTo(sourceTimeClamped(h, 3), 5);
  });

  it('第一段之前的空檔：停在後一段的第一格（before）', () => {
    const p = proj('hold', [vid('a', 3, 2)]);
    const h = cellAt(p, p.tracks[0]!, 1)!;
    expect(h.id).toBe('a');
    expect(h.hold).toBe('before');
    expect(sourceTimeClamped(h, 1)).toBe(0);
  });

  it('色塊／透明／舊版型（沒有 gapMode）：空檔沒有素材', () => {
    for (const g of ['fill', 'none', undefined] as const) {
      const p = proj(g, two);
      expect(cellAt(p, p.tracks[0]!, 3)).toBeNull();
    }
  });

  it('版型範圍外、沒有素材的格子：不停格', () => {
    const p = proj('hold', two);
    expect(cellAt(p, p.tracks[0]!, 11)).toBeNull();
    const empty = proj('hold', []);
    expect(cellAt(empty, empty.tracks[0]!, 3)).toBeNull();
  });

  it('layersAt：停格的格子也在圖層裡（預覽、匯出都會畫）；停格有 hold 標記', () => {
    const p = proj('hold', two);
    const l = layersAt(p, 3, false).find((x) => x.track.id === 'c1')!;
    expect(l.item.id).toBe('a');
    expect((l.item as { hold?: string }).hold).toBe('after');
    expect(layersAt(proj('none', two), 3, false).some((x) => x.track.id === 'c1')).toBe(false);
  });

  it('cellItems 照時間排好、不含文字；inGap', () => {
    const t = trackOf('c', [vid('b', 5, 2), vid('a', 0, 2)]);
    expect(cellItems(t).map((x) => x.id)).toEqual(['a', 'b']);
    expect(inGap(t, 3)).toBe(true);
    expect(inGap(t, 1)).toBe(false);
  });

  it('heldItem：回傳新物件，不改原本的', () => {
    const items = cellItems(trackOf('c', [vid('a', 0, 2)]));
    const h = heldItem(items, 4)!;
    expect(h).not.toBe(items[0]);
    expect(items[0]!.start).toBe(0);
  });

  it('gapFillColor：色塊用格子的 fill（沒有用外框顏色）；停格／透明不畫；舊版型有 fill 才畫', () => {
    const c = trackOf('c', [], { fill: '#ff0000' });
    const c0 = trackOf('c', []);
    expect(gapFillColor(c, frame('fill'))).toBe('#ff0000');
    expect(gapFillColor(c0, frame('fill', '#00ff00'))).toBe('#00ff00');
    expect(gapFillColor(c, frame('hold'))).toBe('#ff0000'); // 還沒放素材的空格子
    expect(gapFillColor(trackOf('c', [vid('a', 0, 1)], { fill: '#ff0000' }), frame('hold'))).toBeNull();
    expect(gapFillColor(c, frame('none'))).toBeNull();
    expect(gapFillColor(c, frame())).toBe('#ff0000');
    expect(gapFillColor(c0, frame())).toBeNull();
  });
});

describe('cellGap：同一格有好幾列', () => {
  // 同一格（cellNo 1）兩列：下面那列 0–2，上面那列 4–6
  const mk = (gap: 'hold' | 'fill' | 'none') => {
    const lower = trackOf('r1', [vid('a', 0, 2)], {
      group: 'g',
      groupRole: 'cell',
      cellNo: 1,
      fill: '#ff0000',
    });
    const upper = trackOf('r2', [vid('b', 4, 2)], { group: 'g', groupRole: 'cell', cellNo: 1 });
    return {
      tracks: [lower, upper, trackOf('main', [frame(gap)])],
      assets: [],
      width: 1080,
      height: 1920,
    } as unknown as Project;
  };
  it('停格：只有「有素材的最上面那列」停格；別列有素材在播時不停（不蓋住別列）', () => {
    const p = mk('hold');
    const [lower, upper] = p.tracks as [Track, Track];
    expect(cellAt(p, upper, 3)?.id).toBe('b'); // 4 之前是空檔：停在後一段（before）
    expect(cellAt(p, lower, 3)).toBeNull(); // 下面那列不停格
    expect(cellAt(p, upper, 1)).toBeNull(); // 下面那列正在播（0–2）→ 上面不停格
    expect(cellAt(p, lower, 1)?.id).toBe('a');
  });
  it('色塊空檔：只有最下面那列畫，而且整格沒有任何一列在播才畫', async () => {
    const { ownsGapFill } = await import('./cellGap');
    const p = mk('fill');
    const [lower, upper] = p.tracks as [Track, Track];
    expect(ownsGapFill(p.tracks, lower, 3)).toBe(true);
    expect(ownsGapFill(p.tracks, upper, 3)).toBe(false);
    expect(ownsGapFill(p.tracks, lower, 5)).toBe(false); // 上面那列在播（4–6）
  });
});
