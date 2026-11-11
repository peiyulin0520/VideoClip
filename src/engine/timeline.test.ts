import { createClip } from '../model/defaults';
import type { Asset, VideoItem } from '../model/types';
import {
  duplicateItem,
  itemAt,
  moveItem,
  relayout,
  removeItem,
  setSpeed,
  sourceTimeAt,
  splitItem,
  totalDuration,
  trimEnd,
  trimStart,
} from './timeline';
import { createProject } from '../model/defaults';

const asset = (id: string, duration: number): Asset => ({
  id,
  kind: 'video',
  name: id,
  mime: 'video/mp4',
  size: 1,
  duration,
  width: 100,
  height: 100,
  hasAudio: true,
  thumbs: [],
});

function three(): VideoItem[] {
  const a = createClip(asset('a', 4));
  const b = createClip(asset('b', 2));
  const c = createClip(asset('c', 3));
  return relayout([a, b, c]);
}

describe('timeline', () => {
  it('relayout 讓片段首尾相接', () => {
    const items = three();
    expect(items.map((i) => i.start)).toEqual([0, 4, 6]);
    const p = createProject('x');
    p.tracks[0]!.items = items;
    expect(totalDuration(p)).toBe(9);
  });

  it('itemAt 與 sourceTimeAt', () => {
    const items = three();
    expect(itemAt(items, 0)!.index).toBe(0);
    expect(itemAt(items, 4)!.index).toBe(1);
    expect(itemAt(items, 5.9)!.index).toBe(1);
    expect(itemAt(items, 100)!.index).toBe(2);
    const sped = setSpeed(items, items[0]!.id, 2); // 4 秒素材 → 2 秒
    expect(sped[0]!.duration).toBe(2);
    expect(sourceTimeAt(sped[0]!, 1)).toBe(2);
    expect(sped[1]!.start).toBe(2);
  });

  it('分割：兩段加起來等於原長，後段 trimIn 正確；太靠邊界不分割', () => {
    const items = three();
    const out = splitItem(items, items[0]!.id, 1.5)!;
    expect(out).toHaveLength(4);
    expect(out[0]!.duration).toBeCloseTo(1.5);
    expect(out[1]!.duration).toBeCloseTo(2.5);
    expect(out[1]!.trimIn).toBeCloseTo(1.5);
    expect(out[1]!.start).toBeCloseTo(1.5);
    expect(out[2]!.start).toBeCloseTo(4);
    expect(splitItem(items, items[0]!.id, 0.1)).toBeNull();
    expect(splitItem(items, items[0]!.id, 3.9)).toBeNull();
  });

  it('分割變速片段：後段 trimIn 以素材秒數計', () => {
    const items = setSpeed(three(), 'x', 1); // no-op
    const fast = setSpeed(items, items[0]!.id, 2); // duration 2
    const out = splitItem(fast, fast[0]!.id, 1)!;
    expect(out[1]!.trimIn).toBeCloseTo(2); // 1 秒時間軸 × 2 倍速 = 素材 2 秒
    expect(out[1]!.duration).toBeCloseTo(1);
  });

  it('複製、刪除、移動', () => {
    const items = three();
    const dup = duplicateItem(items, items[1]!.id)!;
    expect(dup.items).toHaveLength(4);
    expect(dup.items[2]!.id).toBe(dup.newId);
    expect(dup.items[2]!.assetId).toBe('b');
    const rm = removeItem(items, items[0]!.id);
    expect(rm.map((i) => i.start)).toEqual([0, 2]);
    const mv = moveItem(items, items[2]!.id, 0);
    expect(mv.map((i) => i.assetId)).toEqual(['c', 'a', 'b']);
    expect(mv.map((i) => i.start)).toEqual([0, 3, 7]);
    expect(moveItem(items, items[0]!.id, 99).map((i) => i.assetId)).toEqual(['b', 'c', 'a']);
  });

  it('修剪：尾端不超過素材長度、頭端不超過素材起點', () => {
    const a = asset('a', 4);
    const items = three();
    expect(trimEnd(items, items[0]!.id, 1, a)[0]!.duration).toBe(1);
    expect(trimEnd(items, items[0]!.id, 99, a)[0]!.duration).toBe(4);
    expect(trimEnd(items, items[0]!.id, 0, a)[0]!.duration).toBeCloseTo(0.2);
    const t1 = trimStart(items, items[0]!.id, 1);
    expect(t1[0]!.trimIn).toBe(1);
    expect(t1[0]!.duration).toBe(3);
    expect(t1[1]!.start).toBe(3);
    expect(trimStart(t1, t1[0]!.id, -5)[0]!.trimIn).toBe(0); // 最多還原到素材起點
    expect(trimStart(items, items[0]!.id, 99)[0]!.duration).toBeCloseTo(0.2);
  });

  it('速度限制在 0.25–4 倍', () => {
    const items = three();
    expect(setSpeed(items, items[0]!.id, 10)[0]!.speed).toBe(4);
    expect(setSpeed(items, items[0]!.id, 0.01)[0]!.speed).toBe(0.25);
    expect(setSpeed(items, items[0]!.id, 0.25)[0]!.duration).toBe(16);
  });
});
