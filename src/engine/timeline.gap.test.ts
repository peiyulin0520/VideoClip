import { describe, expect, it } from 'vitest';
import { createClip, createProject } from '../model/defaults';
import type { Asset, VideoItem } from '../model/types';
import {
  duplicateItem,
  moveItem,
  relayout,
  removeGap,
  setTrimWindow,
  splitItem,
  totalDuration,
  trimEnd,
  trimStart,
  visibleLayers,
} from './timeline';

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
const A = asset('a', 4);
const B = asset('b', 2);
const two = (): VideoItem[] => relayout([createClip(A), createClip(B)]);

describe('主軌的空白（gap）', () => {
  it('relayout：gap 排進時間，後面的跟著往後', () => {
    const [a, b] = two();
    const out = relayout([{ ...a!, gap: 1.5 }, b!]);
    expect(out.map((i) => i.start)).toEqual([1.5, 5.5]);
  });

  it('總長度算進空白', () => {
    const p = createProject('x');
    const [a, b] = two();
    p.tracks[0]!.items = relayout([{ ...a!, gap: 2 }, b!]);
    expect(totalDuration(p)).toBe(8);
  });

  it('使用者的操作：左把手往右拉 → 尾巴不動、前面空白；再往左拉 → 完全回到原狀', () => {
    const items = two();
    const id = items[0]!.id;
    const cut = trimStart(items, id, 1.5);
    expect(cut[0]).toMatchObject({ trimIn: 1.5, duration: 2.5, gap: 1.5, start: 1.5 });
    expect(cut[0]!.start + cut[0]!.duration).toBe(4); // 尾巴原本的位置
    expect(cut[1]!.start).toBe(4);
    const back = trimStart(items, id, 0); // 把手回到原位
    expect(back[0]!.gap).toBeUndefined();
    // 用累積後的狀態再往左拉：吃掉空白、還原素材起點
    const restored = trimStart(cut, id, -1.5);
    expect(restored[0]).toMatchObject({ trimIn: 0, duration: 4, start: 0 });
    expect(restored[0]!.gap).toBeUndefined();
    expect(restored[1]!.start).toBe(4);
  });

  it('右把手還是能把尾巴拉回素材結尾（使用者：拉不回原長度）', () => {
    const items = two();
    const id = items[0]!.id;
    const shortened = trimEnd(items, id, 1, A);
    expect(shortened[0]!.duration).toBe(1);
    const back = trimEnd(shortened, id, 99, A);
    expect(back[0]!.duration).toBe(4);
  });

  it('往左拉超過空白：先吃空白，多出來的往前延伸、後面被推開，最多到素材起點', () => {
    const items = two();
    const id = items[0]!.id;
    const once = trimStart(items, id, 2); // trimIn 2、gap 2
    const more = trimStart(once, id, -3); // 空白 2 用完，再往前 1：trimIn 1
    expect(more[0]).toMatchObject({ trimIn: 0, duration: 4 });
    // trimIn 只有 2，往左拉 3 → 最多還原 2
    expect(more[0]!.gap).toBeUndefined();
    // 先用面板（沒有空白）把 trimIn 設成 1，再往左拉 0.5：片段變長 0.5、後面被推開
    const w = setTrimWindow(items, id, 1, 4, A);
    const ext = trimStart(w, id, -0.5);
    expect(ext[0]).toMatchObject({ trimIn: 0.5, duration: 3.5 });
    expect(ext[1]!.start).toBe(3.5);
  });

  it('頭端最多切到剩 0.2 秒', () => {
    const items = two();
    const cut = trimStart(items, items[0]!.id, 99);
    expect(cut[0]!.duration).toBeCloseTo(0.2);
    expect(cut[0]!.gap).toBeCloseTo(3.8);
  });

  it('空白是黑畫面：空白的時間點主軌沒有圖層，片段開始後才有', () => {
    const p = createProject('x');
    const [a, b] = two();
    p.tracks[0]!.items = relayout([{ ...a!, gap: 2 }, b!]);
    expect(visibleLayers(p, 1)).toHaveLength(0);
    expect(visibleLayers(p, 2.5)).toHaveLength(1);
    expect(visibleLayers(p, 99)[0]!.item.id).toBe(b!.id); // 超過結尾還是顯示最後一個（原本的行為）
  });

  it('分割：空白只留在前半段；複製：複製品沒有空白', () => {
    const [a, b] = two();
    const items = relayout([{ ...a!, gap: 1 }, b!]);
    const sp = splitItem(items, a!.id, 3)!;
    expect(sp[0]!.gap).toBe(1);
    expect(sp[1]!.gap).toBeUndefined();
    expect(sp.map((i) => i.start)).toEqual([1, 3, 5]);
    const dup = duplicateItem(items, a!.id)!;
    expect(dup.items[1]!.gap).toBeUndefined();
    expect(dup.items[1]!.start).toBe(5);
  });

  it('換順序：空白跟著片段走', () => {
    const [a, b] = two();
    const items = relayout([{ ...a!, gap: 1 }, b!]);
    const moved = moveItem(items, a!.id, 1);
    expect(moved.map((i) => i.assetId)).toEqual(['b', 'a']);
    expect(moved.map((i) => i.start)).toEqual([0, 3]);
  });

  it('刪除空白：後面往前接上', () => {
    const [a, b] = two();
    const items = relayout([{ ...a!, gap: 2 }, b!]);
    const out = removeGap(items, a!.id);
    expect(out.map((i) => i.start)).toEqual([0, 4]);
    expect(out[0]!.gap).toBeUndefined();
  });
});

describe('setTrimWindow（修剪面板）', () => {
  it('指定素材區段：位置（含空白）不變，長度跟著變，後面順延', () => {
    const [a, b] = two();
    const items = relayout([{ ...a!, gap: 1 }, b!]);
    const out = setTrimWindow(items, a!.id, 1, 3, A);
    expect(out[0]).toMatchObject({ trimIn: 1, duration: 2, gap: 1, start: 1 });
    expect(out[1]!.start).toBe(3);
  });
  it('夾在素材範圍內、至少 0.2 秒；變速時長度＝素材區段 ÷ 速度', () => {
    const [a] = two();
    const out = setTrimWindow([a!], a!.id, -5, 99, A);
    expect(out[0]).toMatchObject({ trimIn: 0, duration: 4 });
    const tiny = setTrimWindow([a!], a!.id, 3, 3, A);
    expect(tiny[0]!.duration).toBeCloseTo(0.2);
    const fast = setTrimWindow([{ ...a!, speed: 2 }], a!.id, 0, 4, A);
    expect(fast[0]!.duration).toBe(2);
  });
  it('照片不適用', () => {
    const [a] = two();
    const img = { ...a!, type: 'image' as const };
    expect(setTrimWindow([img], img.id, 1, 2, A)[0]).toBe(img);
  });
});
