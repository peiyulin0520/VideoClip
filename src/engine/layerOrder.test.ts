import { describe, expect, it } from 'vitest';
import type { Item, Track } from '../model/types';
import { normalizeGroupTracks } from './layoutTracks';
import {
  insertIndexFor,
  moveItemToTrack,
  moveTrack,
  moveTrackInKind,
  moveTracksBy,
  normalizeLayers,
  reorderInKind,
  reorderTrack,
  trackUnits,
} from './timeline';

const tr = (id: string, kind: Track['kind'], extra: Partial<Track> = {}, items: Item[] = []): Track =>
  ({ id, kind, name: id, items, hidden: false, locked: false, ...extra }) as Track;
const ids = (t: Track[]) => t.map((x) => x.id).join(',');
const frameItem = (group: string) =>
  ({ id: `fi-${group}`, type: 'video', start: 0, duration: 5, assetId: 'a', group }) as unknown as Item;
const cell = (id: string, g: string) => tr(id, 'media', { group: g, groupRole: 'cell' });
const member = (id: string, g: string, kind: Track['kind'] = 'text') =>
  tr(id, kind, { group: g, groupRole: 'member' });

describe('X9 圖層跨類別排序', () => {
  it('moveTrack（跨類）：文字可以夾在主軌和影像2 中間，再往下可以到主軌下面', () => {
    const t = [tr('m', 'media'), tr('v2', 'media'), tr('x', 'text')];
    const a = moveTrack(t, 'x', -1);
    expect(ids(a)).toBe('m,x,v2');
    expect(ids(moveTrack(a, 'x', -1))).toBe('x,m,v2');
    expect(moveTrack(a, 'x', -1)).not.toBe(a);
    expect(moveTrack(t, 'x', 1)).toBe(t); // 最上面
  });

  it('moveTrackInKind（播放軸）：跨過中間的別種類，它們彼此的順序不變', () => {
    const t = [tr('m', 'media'), tr('x', 'text'), tr('v2', 'media')];
    expect(ids(moveTrackInKind(t, 'm', 1))).toBe('x,v2,m');
    expect(ids(moveTrackInKind(t, 'v2', -1))).toBe('v2,m,x');
    expect(moveTrackInKind(t, 'x', 1)).toBe(t); // 沒有別的文字軌
    expect(moveTrackInKind(t, 'm', -1)).toBe(t); // 已經是影像最下面
  });

  it('reorderInKind：三條影像中間夾一條文字，只動影像之間的順序', () => {
    const t = [tr('a', 'media'), tr('x', 'text'), tr('b', 'media'), tr('c', 'media')];
    expect(ids(reorderInKind(t, 'a', 2))).toBe('x,b,c,a');
    expect(ids(reorderInKind(t, 'c', 0))).toBe('c,a,x,b');
    expect(reorderInKind(t, 'b', 1)).toBe(t);
    expect(reorderInKind(t, 'x', 0)).toBe(t);
  });

  it('音訊只跟音訊換；畫面軌不會換到音訊後面', () => {
    const t = [tr('m', 'media'), tr('x', 'text'), tr('a1', 'audio'), tr('a2', 'audio')];
    expect(moveTrack(t, 'x', 1)).toBe(t);
    expect(moveTrack(t, 'a1', -1)).toBe(t);
    expect(ids(moveTrack(t, 'a1', 1))).toBe('m,x,a2,a1');
    expect(ids(reorderTrack(t, 'm', 99))).toBe('x,m,a1,a2');
    expect(ids(reorderTrack(t, 'a2', 0))).toBe('m,x,a2,a1');
  });

  it('insertIndexFor：同種類最上面那條的上面；這種還沒有就接在預設順序較低的種類後面', () => {
    const t = [tr('m', 'media'), tr('v2', 'media'), tr('x', 'text')];
    expect(insertIndexFor(t, 'text')).toBe(3);
    expect(insertIndexFor(t, 'sticker')).toBe(2); // 影像上面、文字下面
    expect(insertIndexFor(t, 'audio')).toBe(3);
    // 使用者把文字移到影像2 下面後再加影像：在最上面那條影像的上面
    const sandwiched = [tr('m', 'media'), tr('x', 'text'), tr('v2', 'media')];
    expect(insertIndexFor(sandwiched, 'media')).toBe(3);
    expect(insertIndexFor(sandwiched, 'text')).toBe(2);
    expect(insertIndexFor([], 'text')).toBe(0);
  });

  it('normalizeLayers：舊專案（排好的）原樣；音訊在中間搬到最後；穿插的畫面軌不動', () => {
    const ok = [tr('m', 'media'), tr('x', 'text'), tr('a', 'audio')];
    expect(normalizeLayers(ok)).toBe(ok);
    const sand = [tr('m', 'media'), tr('x', 'text'), tr('v2', 'media'), tr('a', 'audio')];
    expect(normalizeLayers(sand)).toBe(sand);
    expect(ids(normalizeLayers([tr('a', 'audio'), tr('m', 'media'), tr('x', 'text')]))).toBe('m,x,a');
  });

  it('版型一整塊：格子在外框列下面、成員在外框列上面，換順序整塊一起動、不被拆開', () => {
    const t = [
      tr('m', 'media'),
      cell('c1', 'g'),
      cell('c2', 'g'),
      tr('f', 'media', {}, [frameItem('g')]),
      member('gt', 'g'),
      tr('v2', 'media'),
    ];
    expect(trackUnits(t).map((u) => [u.lo, u.hi])).toEqual([
      [0, 0],
      [1, 4],
      [5, 5],
    ]);
    expect(ids(moveTrack(t, 'f', 1))).toBe('m,v2,c1,c2,f,gt'); // 版型整塊跟 v2 換
    expect(ids(moveTrack(t, 'v2', -1))).toBe('m,v2,c1,c2,f,gt'); // v2 一次跨過整塊
    expect(ids(moveTrackInKind(t, 'm', 1))).toBe('c1,c2,f,gt,m,v2'); // 版型外框所在列也是影像軌：主軌搬到它上面（整塊不拆）
    // 落在版型中間 → 推到塊的上面或下面
    expect(ids(reorderTrack(t, 'v2', 2))).toBe('m,v2,c1,c2,f,gt');
    expect(ids(reorderTrack(t, 'm', 3))).toBe('c1,c2,f,gt,m,v2');
    // 多選版型的任何一條 = 整塊
    expect(ids(moveTracksBy(t, ['c1'], 1))).toBe('m,v2,c1,c2,f,gt');
  });

  it('normalizeGroupTracks：成員散在別處 → 搬到外框列正上方，格子在正下方；順序已經對就同一個陣列', () => {
    const scattered = [
      member('gt', 'g'),
      tr('m', 'media'),
      tr('f', 'media', {}, [frameItem('g')]),
      cell('c1', 'g'),
      tr('v2', 'media'),
    ];
    const fixed = normalizeGroupTracks(scattered);
    expect(ids(fixed)).toBe('m,c1,f,gt,v2');
    expect(normalizeGroupTracks(fixed)).toBe(fixed);
    // 兩個版型成員穿插（文字、貼圖）順序保留，不會被重排
    const two = [
      tr('f', 'media', {}, [frameItem('g')]),
      member('s', 'g', 'sticker'),
      member('gt', 'g', 'text'),
    ];
    expect(normalizeGroupTracks(two)).toBe(two);
    // 音效成員留在最後
    const withAudio = [
      tr('f', 'media', {}, [frameItem('g')]),
      member('gt', 'g'),
      tr('a', 'audio'),
      member('ga', 'g', 'audio'),
    ];
    expect(normalizeGroupTracks(withAudio)).toBe(withAudio);
  });

  it('moveItemToTrack 新增一軌：最上面＝同種類最上面那條的上面、最下面＝同種類最下面那條的下面（不插進版型中間）', () => {
    const itx = { id: 'i1', type: 'text', start: 0, duration: 1 } as unknown as Item;
    const t = [tr('m', 'media'), tr('x1', 'text', {}, [itx]), tr('v2', 'media'), tr('x2', 'text')];
    let n = 0;
    const make = (kind: Track['kind']) => tr(`new${n++}`, kind);
    expect(ids(moveItemToTrack(t, 'i1', { type: 'new', edge: 'top' } as never, 0, make)!)).toBe(
      'm,x1,v2,x2,new0',
    );
    expect(ids(moveItemToTrack(t, 'i1', { type: 'new', edge: 'bottom' } as never, 0, make)!)).toBe(
      'm,new1,x1,v2,x2',
    );
  });
});
