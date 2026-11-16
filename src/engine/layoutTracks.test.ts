import { describe, expect, it } from 'vitest';
import type { Item, Track } from '../model/types';
import { cellTracksOf, frameOfGroup, isFrameItem, normalizeGroupTracks } from './layoutTracks';

const base = { start: 0, duration: 3, trimIn: 0, speed: 1, volume: 1, fit: 'cover', transform: {} };
const vid = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, type: 'video', assetId: 'a', ...base, ...extra }) as unknown as Item;
const tr = (id: string, items: Item[], extra: Partial<Track> = {}) =>
  ({ id, kind: 'media', name: id, hidden: false, locked: false, items, ...extra }) as Track;
const cell = (id: string, g: string) =>
  tr(id, [], { group: g, groupRole: 'cell', cell: { x: 0, y: 0, w: 1, h: 1 } });

describe('layoutTracks', () => {
  it('外框物件：有 group、沒有 cell', () => {
    expect(isFrameItem(vid('f', { group: 'g' }))).toBe(true);
    expect(isFrameItem(vid('c', { group: 'g', cell: { x: 0, y: 0, w: 1, h: 1 } }))).toBe(false);
    expect(isFrameItem(vid('v'))).toBe(false);
  });
  it('外框跟別的片段在同一條軌道也找得到', () => {
    const tracks = [tr('main', [vid('v1'), vid('f', { group: 'g', start: 3 })])];
    expect(frameOfGroup(tracks, 'g')?.track.id).toBe('main');
  });
  it('格子軌搬到外框那一列的正下方；已經對了就回傳同一個陣列', () => {
    const tracks = [
      cell('c1', 'g'),
      tr('main', [vid('v')]),
      tr('up', [vid('f', { group: 'g' })]),
      cell('c2', 'g'),
    ];
    const out = normalizeGroupTracks(tracks);
    expect(out.map((t) => t.id)).toEqual(['main', 'c1', 'c2', 'up']);
    expect(normalizeGroupTracks(out)).toBe(out);
  });
  it('外框在主軌（最下面）：格子軌在最下面', () => {
    const tracks = [
      tr('main', [vid('v'), vid('f', { group: 'g', start: 3 })]),
      cell('c1', 'g'),
      cell('c2', 'g'),
    ];
    const out = normalizeGroupTracks(tracks);
    expect(out.map((t) => t.id)).toEqual(['c1', 'c2', 'main']);
    expect(cellTracksOf(out, 'g')).toHaveLength(2);
  });
  it('兩個版型各自貼著自己的外框', () => {
    const tracks = [
      tr('a', [vid('f1', { group: 'g1' })]),
      tr('b', [vid('f2', { group: 'g2' })]),
      cell('c2', 'g2'),
      cell('c1', 'g1'),
    ];
    expect(normalizeGroupTracks(tracks).map((t) => t.id)).toEqual(['c1', 'a', 'c2', 'b']);
  });
  it('沒有外框的格子軌不動', () => {
    const tracks = [cell('c1', 'g'), tr('main', [vid('v')])];
    expect(normalizeGroupTracks(tracks)).toBe(tracks);
  });
});

describe('格號：cellsOf／ensureCellNos', () => {
  const T = (id: string, extra: Partial<Track> = {}) =>
    ({ id, kind: 'media', name: id, hidden: false, locked: false, items: [], ...extra }) as Track;
  it('舊資料沒有 cellNo：照順序補 1、2、3；已經有的不動；都有了回傳同一個陣列', async () => {
    const { ensureCellNos, cellNoOf } = await import('./layoutTracks');
    const tracks = [
      T('a', { group: 'g', groupRole: 'cell' }),
      T('b', { group: 'g', groupRole: 'cell' }),
      T('m'),
    ];
    expect(tracks.map((t) => cellNoOf(tracks, t))).toEqual([1, 2, 0]); // 還沒補之前照順序
    const fixed = ensureCellNos(tracks);
    expect(fixed.map((t) => t.cellNo)).toEqual([1, 2, undefined]);
    expect(ensureCellNos(fixed)).toBe(fixed);
    const keep = ensureCellNos([
      T('x', { group: 'g', groupRole: 'cell', cellNo: 2 }),
      T('y', { group: 'g', groupRole: 'cell' }),
    ]);
    expect(keep.map((t) => t.cellNo)).toEqual([2, 1]);
  });
  it('cellsOf：同一格的列併在一起，格子照格號排；rowsOfCell 回傳同一格的列', async () => {
    const { cellsOf, rowsOfCell } = await import('./layoutTracks');
    const tracks = [
      T('r1', { group: 'g', groupRole: 'cell', cellNo: 1, cell: { x: 0, y: 0, w: 0.5, h: 1 } }),
      T('r3', { group: 'g', groupRole: 'cell', cellNo: 2, cell: { x: 0.5, y: 0, w: 0.5, h: 1 } }),
      T('r2', { group: 'g', groupRole: 'cell', cellNo: 1 }),
    ];
    const cells = cellsOf(tracks, 'g');
    expect(cells.map((c) => [c.no, c.tracks.map((t) => t.id)])).toEqual([
      [1, ['r1', 'r2']],
      [2, ['r3']],
    ]);
    expect(cells[0]!.rect).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
    expect(rowsOfCell(tracks, tracks[2]!).map((t) => t.id)).toEqual(['r1', 'r2']);
  });
});
