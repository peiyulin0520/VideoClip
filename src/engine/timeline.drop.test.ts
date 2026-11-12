import { describe, expect, it } from 'vitest';
import { createClip, createProject, createTextItem, createTrack } from '../model/defaults';
import type { Asset, Track, VideoItem } from '../model/types';
import { dropTarget, moveItemToTrack, trackKindOf } from './timeline';

const asset = (id: string): Asset => ({
  id,
  kind: 'video',
  name: id,
  mime: 'video/mp4',
  size: 1,
  duration: 4,
  width: 100,
  height: 100,
  hasAudio: true,
  thumbs: [],
});
const clip = (id: string, start: number, dur = 2): VideoItem => ({
  ...createClip(asset(id)),
  id,
  start,
  duration: dur,
});

/** [影像0: a(0–2) b(2–4)] [影像1: c(1–3)] [字卡: t(0–3)] */
function proj() {
  const p = createProject('x');
  const m1 = createTrack('media', p.tracks);
  const tx = createTrack('text', [...p.tracks, m1]);
  p.tracks[0]!.items = [clip('a', 0), clip('b', 2)];
  m1.items = [clip('c', 1)];
  tx.items = [{ ...createTextItem(0), id: 't' }];
  p.tracks.push(m1, tx);
  return p;
}
const ids = (t: Track) => t.items.map((x) => x.id);

describe('trackKindOf', () => {
  it('影片、照片、貼圖＝影像；字卡＝字卡；音樂＝音訊', () => {
    expect(trackKindOf(clip('a', 0))).toBe('media');
    expect(trackKindOf({ ...clip('a', 0), type: 'image' })).toBe('media');
    expect(trackKindOf({ ...createTextItem(0) })).toBe('text');
    expect(trackKindOf({ ...clip('a', 0), type: 'audio' })).toBe('audio');
  });
});

describe('dropTarget：影像只能放影像、字卡只能放字卡', () => {
  const p = proj();
  const [m0, m1, tx] = p.tracks;
  it('同種類的軌道可以放；不同種類不行（彈回並提示）', () => {
    const a = m0!.items[0]!;
    expect(dropTarget(p.tracks, a, { trackId: m1!.id, newEdge: null })).toEqual({
      type: 'track',
      trackId: m1!.id,
    });
    expect(dropTarget(p.tracks, a, { trackId: tx!.id, newEdge: null })).toEqual({
      type: 'invalid',
      kind: 'media',
    });
    const t = tx!.items[0]!;
    expect(dropTarget(p.tracks, t, { trackId: m0!.id, newEdge: null })).toEqual({
      type: 'invalid',
      kind: 'text',
    });
  });
  it('鎖住的軌道不能放；不在任何軌道上＝null；在「＋新增一軌」放置區＝新增', () => {
    const q = proj();
    q.tracks[1]!.locked = true;
    expect(
      dropTarget(q.tracks, q.tracks[0]!.items[0]!, { trackId: q.tracks[1]!.id, newEdge: null })?.type,
    ).toBe('invalid');
    expect(dropTarget(p.tracks, m0!.items[0]!, { trackId: null, newEdge: null })).toBeNull();
    expect(dropTarget(p.tracks, m0!.items[0]!, { trackId: null, newEdge: 'top' })).toEqual({
      type: 'new',
      edge: 'top',
    });
  });
});

describe('moveItemToTrack', () => {
  it('影像 1 的片段拖到影像 2、時間往右：移過去，原軌留空位', () => {
    const p = proj();
    const [m0, m1] = p.tracks;
    const out = moveItemToTrack(p.tracks, 'a', { type: 'track', trackId: m1!.id }, 5, createTrack)!;
    expect(ids(out[0]!)).toEqual(['b']);
    expect(ids(out[1]!)).toEqual(['c', 'a']);
    expect((out[1]!.items[1] as VideoItem).start).toBe(5);
    expect(out[0]!.id).toBe(m0!.id);
    expect(out[0]!.items[0]!.start).toBe(2); // 原軌的其他片段不動
  });

  it('目標那個時間已經有東西：移到最近的空位（不重疊）', () => {
    const p = proj();
    const out = moveItemToTrack(
      p.tracks,
      'a',
      { type: 'track', trackId: p.tracks[1]!.id },
      1.5,
      createTrack,
    )!;
    const moved = out[1]!.items.find((x) => x.id === 'a')!;
    const c = out[1]!.items.find((x) => x.id === 'c')!;
    expect(moved.start + moved.duration <= c.start + 1e-6 || moved.start >= c.start + c.duration - 1e-6).toBe(
      true,
    );
  });

  it('同一軌：只改時間', () => {
    const p = proj();
    const out = moveItemToTrack(p.tracks, 'b', { type: 'track', trackId: p.tracks[0]!.id }, 6, createTrack)!;
    expect(out[0]!.items.find((x) => x.id === 'b')!.start).toBe(6);
    expect(ids(out[0]!)).toEqual(['a', 'b']);
  });

  it('種類不符、找不到：回傳 null', () => {
    const p = proj();
    expect(
      moveItemToTrack(p.tracks, 'a', { type: 'track', trackId: p.tracks[2]!.id }, 0, createTrack),
    ).toBeNull();
    expect(moveItemToTrack(p.tracks, 'a', { type: 'invalid', kind: 'media' }, 0, createTrack)).toBeNull();
    expect(
      moveItemToTrack(p.tracks, 'nope', { type: 'track', trackId: p.tracks[1]!.id }, 0, createTrack),
    ).toBeNull();
  });

  it('拖到影像區最上面：新增一條影像軌（在字卡下面、其他影像軌上面）', () => {
    const p = proj();
    const out = moveItemToTrack(p.tracks, 'a', { type: 'new', edge: 'top' }, 3, createTrack)!;
    expect(out.map((t) => t.kind)).toEqual(['media', 'media', 'media', 'text']);
    expect(ids(out[2]!)).toEqual(['a']);
    expect(out[2]!.items[0]!.start).toBe(3);
    expect(ids(out[0]!)).toEqual(['b']);
  });

  it('拖到影像區最下面：新增一條影像軌放在最底下', () => {
    const p = proj();
    const out = moveItemToTrack(p.tracks, 'c', { type: 'new', edge: 'bottom' }, 0, createTrack)!;
    expect(out.map((t) => t.kind)).toEqual(['media', 'media', 'media', 'text']);
    expect(ids(out[0]!)).toEqual(['c']);
    expect(ids(out[1]!)).toEqual(['a', 'b']);
    expect(ids(out[2]!)).toEqual([]); // 原軌空了也不自動刪
  });

  it('字卡拖到字卡區最上面：新增字卡軌；音訊分區不被打亂', () => {
    const p = proj();
    const out = moveItemToTrack(p.tracks, 't', { type: 'new', edge: 'top' }, 1, createTrack)!;
    expect(out.map((t) => t.kind)).toEqual(['media', 'media', 'text', 'text']);
  });
});
