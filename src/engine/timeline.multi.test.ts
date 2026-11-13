import { describe, expect, it } from 'vitest';
import type { Item, Track } from '../model/types';
import { mergeTracksByIds, moveTracksBy, removeTracksByIds } from './timeline';

const it_ = (id: string, start: number, duration: number): Item =>
  ({ id, type: 'video', start, duration, assetId: 'a' }) as unknown as Item;
const tr = (id: string, kind: Track['kind'], items: Item[] = [], extra: Partial<Track> = {}): Track =>
  ({ id, kind, name: id, items, ...extra }) as Track;
const ids = (t: Track[]) => t.map((x) => x.id).join(',');

describe('moveTracksBy', () => {
  const base = [tr('m1', 'media'), tr('m2', 'media'), tr('m3', 'media'), tr('m4', 'media'), tr('t1', 'text')];
  it('選到的一起往上移一格，相對順序不變；碰到另一個分區就不動', () => {
    expect(ids(moveTracksBy(base, ['m1', 'm2'], 1))).toBe('m3,m1,m2,m4,t1');
    expect(ids(moveTracksBy(base, ['m3', 'm4'], 1))).toBe('m1,m2,m3,m4,t1'); // m4 已經在影像區最上面
    expect(ids(moveTracksBy(base, ['t1'], 1))).toBe('m1,m2,m3,m4,t1'); // 字卡已經最上面
  });
  it('往下移', () => {
    expect(ids(moveTracksBy(base, ['m3', 'm4'], -1))).toBe('m1,m3,m4,m2,t1');
    expect(moveTracksBy(base, ['m1'], -1)).toBe(base); // 最下面，沒變
  });
  it('選到版型的任何一條＝整個版型一起動', () => {
    const t = [
      tr('m1', 'media'),
      tr('c1', 'media', [], { group: 'g', groupRole: 'cell' }),
      tr('f', 'media', [], { group: 'g', groupRole: 'frame' }),
      tr('m2', 'media'),
    ];
    expect(ids(moveTracksBy(t, ['f'], 1))).toBe('m1,m2,c1,f');
  });
});

describe('removeTracksByIds', () => {
  it('刪掉選到的；至少留一條影像軌', () => {
    const t = [tr('m1', 'media'), tr('m2', 'media'), tr('a1', 'audio')];
    expect(ids(removeTracksByIds(t, ['m2', 'a1']))).toBe('m1');
    expect(ids(removeTracksByIds(t, ['m1', 'm2']))).toBe('m1,a1'); // 留最下面的影像軌
  });
});

describe('mergeTracksByIds', () => {
  it('同一種類：全部搬到最上面那條；搬空的軌道拿掉', () => {
    const t = [
      tr('a', 'text', [it_('x', 0, 1)]),
      tr('b', 'text', [it_('y', 2, 1)]),
      tr('c', 'text', [it_('z', 4, 1)]),
    ];
    const r = mergeTracksByIds(t, ['a', 'b', 'c'])!;
    expect(ids(r.tracks)).toBe('c');
    expect(r.tracks[0]!.items.map((i) => i.id)).toEqual(['x', 'y', 'z']);
    expect(r.merged).toBe(2);
    expect(r.kept).toBe(0);
  });
  it('時間重疊放不進去的留在原本的軌道', () => {
    const t = [tr('a', 'text', [it_('x', 0, 2), it_('x2', 5, 1)]), tr('b', 'text', [it_('y', 1, 2)])];
    const r = mergeTracksByIds(t, ['a', 'b'])!;
    expect(ids(r.tracks)).toBe('a,b');
    expect(r.tracks[0]!.items.map((i) => i.id)).toEqual(['x']);
    expect(r.tracks[1]!.items.map((i) => i.id)).toEqual(['y', 'x2']);
    expect(r.kept).toBe(1);
    expect(r.merged).toBe(1);
  });
  it('不同種類、版型的軌道、只選一條都不能整併', () => {
    expect(mergeTracksByIds([tr('a', 'text'), tr('b', 'media')], ['a', 'b'])).toBeNull();
    expect(mergeTracksByIds([tr('a', 'media', [], { group: 'g' }), tr('b', 'media')], ['a', 'b'])).toBeNull();
    expect(mergeTracksByIds([tr('a', 'text')], ['a'])).toBeNull();
  });
});
