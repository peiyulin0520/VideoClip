import { describe, expect, it } from 'vitest';
import type { Asset, Item, Track } from '../model/types';
import {
  arrangeCells,
  cellDefaultSeconds,
  cellEnd,
  fitFrameToCells,
  moveToCellTracks,
  rippleAfter,
} from './cellOps';

const base = {
  trimIn: 0,
  speed: 1,
  volume: 1,
  fit: 'cover',
  transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
};
const vid = (id: string, start: number, duration: number, extra: Record<string, unknown> = {}) =>
  ({ id, type: 'video', assetId: 'a', start, duration, ...base, ...extra }) as unknown as Item;
const text = (id: string, start: number, duration: number, onItem?: string) =>
  ({
    id,
    type: 'text',
    start,
    duration,
    group: 'g',
    onItem,
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
  }) as unknown as Item;
const tr = (id: string, items: Item[], extra: Partial<Track> = {}) =>
  ({ id, kind: 'media', name: id, hidden: false, locked: false, items, ...extra }) as Track;
const box = (i: number) => ({ x: i / 3, y: 0, w: 1 / 3, h: 1 });
const cell = (id: string, i: number, items: Item[]) =>
  tr(id, items, { group: 'g', groupRole: 'cell', cell: box(i) });
const asset = { id: 'a', kind: 'image', width: 100, height: 100, duration: 0 } as unknown as Asset;
const frame = (dur = 10) => tr('main', [vid('f', 0, dur, { group: 'g' })]);
const starts = (t: Track[], id: string) =>
  t.find((x) => x.id === id)!.items.map((i) => [i.id, i.start, i.duration]);

describe('cellOps：一格多素材的排時間', () => {
  const mk = () => [
    cell('c1', 0, [vid('a1', 0, 2), vid('a2', 3, 1)]),
    cell('c2', 1, [vid('b1', 1, 2)]),
    cell('c3', 2, []),
    frame(),
  ];

  it('cellEnd／cellDefaultSeconds', () => {
    const t = mk();
    expect(cellEnd(t[0]!)).toBe(4);
    expect(cellEnd(t[2]!)).toBeNull();
    expect(cellDefaultSeconds({ kind: 'image', duration: 0 })).toBe(2);
    expect(cellDefaultSeconds({ kind: 'video', duration: 30 })).toBe(10);
    expect(cellDefaultSeconds({ kind: 'video', duration: 3 })).toBe(3);
  });

  it('依序：第 1 格先、第 2 格接在後面，各格內素材一個接一個；外框長度＝全部加起來；空格不佔時間', () => {
    const out = arrangeCells(mk(), 'g', 'seq');
    expect(starts(out, 'c1')).toEqual([
      ['a1', 0, 2],
      ['a2', 2, 1],
    ]);
    expect(starts(out, 'c2')).toEqual([['b1', 3, 2]]);
    expect(out.find((t) => t.id === 'main')!.items[0]!.duration).toBe(5);
    expect((out.find((t) => t.id === 'main')!.items[0] as { layoutPlay?: string }).layoutPlay).toBe('seq');
  });

  it('同步：每一格都從版型開頭開始；外框長度＝最長那一格', () => {
    const out = arrangeCells(arrangeCells(mk(), 'g', 'seq'), 'g', 'sync');
    expect(starts(out, 'c1')).toEqual([
      ['a1', 0, 2],
      ['a2', 2, 1],
    ]);
    expect(starts(out, 'c2')).toEqual([['b1', 0, 2]]);
    expect(out.find((t) => t.id === 'main')!.items[0]!.duration).toBe(3);
    expect((out.find((t) => t.id === 'main')!.items[0] as { layoutPlay?: string }).layoutPlay).toBe('sync');
  });

  it('色塊上的文字跟著那一段一起動', () => {
    const t = mk();
    t.push(tr('tx', [text('t1', 1, 1, 'b1')], { group: 'g', groupRole: 'member', kind: 'text' }));
    const out = arrangeCells(t, 'g', 'seq'); // b1 從 1 → 3
    expect(out.find((x) => x.id === 'tx')!.items[0]!.start).toBe(3);
  });

  it('沒有任何素材：只記下選擇，長度不變', () => {
    const t = [cell('c1', 0, []), frame(7)];
    const out = arrangeCells(t, 'g', 'seq');
    expect(out.find((x) => x.id === 'main')!.items[0]!.duration).toBe(7);
  });

  it('漣漪：第 1 格最後一段後面多 1 秒 → 這一格後面、後面各格的素材都往後 1 秒，外框長度跟著', () => {
    const seq = arrangeCells(mk(), 'g', 'seq'); // c1: a1 0–2, a2 2–3；c2: b1 3–5；總長 5
    const out = rippleAfter(seq, 'g', 0, 3, 1);
    expect(starts(out, 'c1')).toEqual([
      ['a1', 0, 2],
      ['a2', 2, 1],
    ]); // 3 秒之後沒有別的素材
    expect(starts(out, 'c2')).toEqual([['b1', 4, 2]]);
    expect(out.find((t) => t.id === 'main')!.items[0]!.duration).toBe(6);
    // 第 1 格中間（2 秒處）多出 1 秒：a2 也往後
    const mid = rippleAfter(seq, 'g', 0, 2, 1);
    expect(starts(mid, 'c1')).toEqual([
      ['a1', 0, 2],
      ['a2', 3, 1],
    ]);
    // 縮短（delta<0）往前補
    const shrunk = rippleAfter(seq, 'g', 0, 2, -1);
    expect(starts(shrunk, 'c2')).toEqual([['b1', 2, 2]]);
    expect(shrunk.find((t) => t.id === 'main')!.items[0]!.duration).toBe(4);
    expect(rippleAfter(seq, 'g', 0, 2, 0)).toBe(seq);
  });

  it('fitFrameToCells：外框長度跟素材最後結束的時間一致', () => {
    const t = [cell('c1', 0, [vid('a1', 1, 4)]), frame(10)];
    expect(fitFrameToCells(t, 'g').find((x) => x.id === 'main')!.items[0]!.duration).toBe(5);
    expect(fitFrameToCells([cell('c1', 0, []), frame(10)], 'g')).toEqual([cell('c1', 0, []), frame(10)]);
  });

  it('moveToCellTracks：搬到別格，畫面換成新格子的位置與裁切，文字跟著；同一格／不同版型不能搬', () => {
    const it1 = vid('a1', 0, 2, { group: 'g', cell: box(0) });
    const t = [
      cell('c1', 0, [it1]),
      cell('c2', 1, [vid('b1', 0, 2, { group: 'g', cell: box(1) })]),
      cell('c3', 2, []),
      frame(),
      tr('tx', [text('t1', 0, 2, 'a1')], { group: 'g', groupRole: 'member', kind: 'text' }),
    ];
    const out = moveToCellTracks(t, [asset], 1080, 1920, 'a1', 'c3')!;
    expect(out.find((x) => x.id === 'c1')!.items).toHaveLength(0);
    const moved = out.find((x) => x.id === 'c3')!.items[0] as {
      cell: { x: number };
      transform: { x: number };
    };
    expect(moved.cell.x).toBeCloseTo(2 / 3, 5);
    expect(moved.transform.x).toBeCloseTo(2 / 3 + 1 / 6, 5);
    const text1 = out.find((x) => x.id === 'tx')!.items[0]!;
    expect(text1.transform.x).toBeCloseTo(2 / 3 + 1 / 6, 5);
    expect(moveToCellTracks(t, [asset], 1080, 1920, 'a1', 'c1')).toBeNull();
    // 目標格那個時間已經有東西：找最近的空位
    const out2 = moveToCellTracks(t, [asset], 1080, 1920, 'a1', 'c2')!;
    expect(
      out2
        .find((x) => x.id === 'c2')!
        .items.map((i) => i.start)
        .sort(),
    ).toEqual([0, 2]);
  });
});
