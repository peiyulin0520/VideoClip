import { createProject } from '../model/defaults';
import type { Asset, Item, TextItem, Track } from '../model/types';
import { createTextItem } from '../model/defaults';
import { cellItems } from '../engine/cellGap';
import { frameOfGroup } from '../engine/layoutTracks';
import { layersAt } from '../engine/timeline';
import {
  addLayout,
  addToCell,
  arrangeGroup,
  moveToCell,
  removeAnyItem,
  setGapMode,
  trimCellEnd,
  importIntoCell,
} from './actions';
import { useProjectStore } from './projectStore';

const s = () => useProjectStore.getState();
const asset = (id: string, kind: 'image' | 'video' = 'image', duration = 0): Asset =>
  ({ id, kind, name: id, width: 400, height: 300, duration, thumbs: [] }) as unknown as Asset;
const wins = [
  { x: 10, y: 10, w: 100, h: 100 },
  { x: 120, y: 10, w: 100, h: 100 },
  { x: 230, y: 10, w: 100, h: 100 },
];
const setup = (duration = 5) => {
  s().load(createProject('測試'));
  addLayout({
    cells: wins.map((win) => ({ win })),
    frame: asset('f'),
    start: 0,
    duration,
    frameName: '版型',
  });
  return s().project!.tracks.find((t: Track) => t.groupRole === 'cell')!.group!;
};
const cells = () => s().project!.tracks.filter((t) => t.groupRole === 'cell');
const frame = (g: string) => frameOfGroup(s().project!.tracks, g)!.item;
const row = (i: number) => cellItems(cells()[i]!).map((x) => [x.assetId, x.start, x.duration]);

describe('版型一格多素材', () => {
  it('新版型：停格＋同步', () => {
    const g = setup();
    expect(frame(g).gapMode).toBe('hold');
    expect(frame(g).layoutPlay).toBe('sync');
  });

  it('addToCell：接在這一格最後一個素材後面；照片 2 秒、影片＝素材長度（最多 10 秒）；超出版型結尾就把外框拉長', () => {
    const g = setup(5);
    const c0 = cells()[0]!.id;
    importIntoCell(c0, asset('p0', 'image')); // 空格：放滿 5 秒
    expect(row(0)).toEqual([['p0', 0, 5]]);
    addToCell(c0, asset('p1', 'image'));
    addToCell(c0, asset('v1', 'video', 30));
    expect(row(0)).toEqual([
      ['p0', 0, 5],
      ['p1', 5, 2],
      ['v1', 7, 10],
    ]);
    expect(frame(g).duration).toBe(17);
    // 只有第一個素材有聲音（同步）
    expect(cellItems(cells()[0]!).map((x) => x.volume)).toEqual([1, 0, 0]);
  });

  it('同步／依序：各格素材排好、外框長度跟著；依序後再切回同步', () => {
    const g = setup(5);
    importIntoCell(cells()[0]!.id, asset('a'));
    addToCell(cells()[0]!.id, asset('a2'));
    importIntoCell(cells()[1]!.id, asset('b'));
    arrangeGroup(g, 'seq');
    expect(row(0)).toEqual([
      ['a', 0, 5],
      ['a2', 5, 2],
    ]);
    expect(row(1)).toEqual([['b', 7, 7]]); // 放進空格時填滿當時的版型長度（7 秒）
    expect(frame(g).duration).toBe(14);
    expect(frame(g).layoutPlay).toBe('seq');
    arrangeGroup(g, 'sync');
    expect(row(1)).toEqual([['b', 0, 7]]);
    expect(frame(g).duration).toBe(7);
    s().undo();
    expect(frame(g).layoutPlay).toBe('seq');
    expect(row(1)).toEqual([['b', 7, 7]]);
  });

  it('依序時：加素材、改尾端、刪除，後面各格的素材跟著推；同步時不推', () => {
    const g = setup(5);
    importIntoCell(cells()[0]!.id, asset('a'));
    importIntoCell(cells()[1]!.id, asset('b'));
    importIntoCell(cells()[2]!.id, asset('c'));
    arrangeGroup(g, 'seq'); // a 0–5, b 5–10, c 10–15
    addToCell(cells()[0]!.id, asset('a2')); // a 後面多 2 秒
    expect(row(1)).toEqual([['b', 7, 5]]);
    expect(row(2)).toEqual([['c', 12, 5]]);
    expect(frame(g).duration).toBe(17);
    // 拖 a2 的尾端 +1 秒（照片不限長度）
    const a2 = cellItems(cells()[0]!).find((x) => x.assetId === 'a2')!;
    trimCellEnd(s().project!, a2.id, a2.duration + 1);
    expect(row(1)).toEqual([['b', 8, 5]]);
    expect(frame(g).duration).toBe(18);
    // 刪除 a2 → 後面往前補
    removeAnyItem(a2.id);
    expect(row(1)).toEqual([['b', 5, 5]]);
    expect(row(2)).toEqual([['c', 10, 5]]);
    expect(frame(g).duration).toBe(15);
    s().undo();
    expect(row(1)).toEqual([['b', 8, 5]]);
    // 同步：加素材不推別格
    arrangeGroup(g, 'sync');
    const before = row(1);
    addToCell(cells()[0]!.id, asset('a3'));
    expect(row(1)).toEqual(before);
  });

  it('色塊上的文字跟著刪除', () => {
    const g = setup(5);
    importIntoCell(cells()[0]!.id, asset('a'));
    const colorId = addToCell(cells()[0]!.id, asset('color1'))!;
    const tx = createTextItem(5, '字');
    (tx as TextItem).group = g;
    (tx as TextItem).onItem = colorId;
    s().apply((d) => {
      d.tracks.push({
        id: 't_tx',
        kind: 'text',
        name: '字',
        hidden: false,
        locked: false,
        group: g,
        groupRole: 'member',
        items: [tx as Item],
      } as never);
    });
    removeAnyItem(colorId);
    expect(s().project!.tracks.find((t) => t.id === 't_tx')!.items).toHaveLength(0);
  });

  it('moveToCell：搬到別格，畫面換成新格子；一步復原', () => {
    setup(5);
    importIntoCell(cells()[0]!.id, asset('a'));
    const it = cellItems(cells()[0]!)[0]!;
    expect(moveToCell(it.id, cells()[2]!.id)).toBe(true);
    expect(row(0)).toEqual([]);
    const moved = cellItems(cells()[2]!)[0]!;
    expect(moved.cell!.x).toBeCloseTo(230 / 1080, 5);
    s().undo();
    expect(row(0)).toEqual([['a', 0, 5]]);
    expect(moveToCell(it.id, cells()[0]!.id)).toBe(false); // 同一格
  });

  it('空檔：停格時 layersAt 在空檔還是畫前一段；改成透明就不畫', () => {
    const g = setup(10);
    const c0 = cells()[0]!.id;
    importIntoCell(c0, asset('a'));
    s().apply((d) => {
      const t = d.tracks.find((x) => x.id === c0)!;
      t.items[0]!.duration = 2;
    });
    const at = (t: number) => layersAt(s().project!, t, false).filter((l) => l.track.id === c0).length;
    expect(at(5)).toBe(1);
    setGapMode(g, 'none');
    expect(at(5)).toBe(0);
    expect(at(1)).toBe(1);
  });
});
