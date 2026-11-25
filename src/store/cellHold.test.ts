import { createProject } from '../model/defaults';
import type { Asset, Item, Track, VideoItem } from '../model/types';
import { activeTransition } from '../engine/transitions';
import { addLayout, arrangeGroup, setTransition, setTransitionMode } from './actions';
import { useProjectStore } from './projectStore';

// 版型格子裡的停格轉場：後一段往後挪一個轉場長度，空白做轉場；同步只挪這一格，依序後面的格子一起挪；外框跟著變長
const s = () => useProjectStore.getState();
const img = (id: string): Asset =>
  ({ id, kind: 'image', name: id, width: 400, height: 300, duration: 0 }) as unknown as Asset;

function mk(play: 'sync' | 'seq') {
  s().load(createProject('測試'));
  addLayout({
    cells: [
      { asset: img('a'), win: { x: 10, y: 10, w: 100, h: 100 } },
      { asset: img('c'), win: { x: 120, y: 10, w: 100, h: 100 } },
    ],
    frame: img('f'),
    start: 0,
    duration: 4,
    frameName: '測試版型',
  });
  s().apply((d) => {
    d.assets.push(img('b'));
    const cell = d.tracks.filter((t) => t.groupRole === 'cell')[0]!;
    const first = cell.items[0] as VideoItem;
    first.start = 0;
    first.duration = 4;
    const second = {
      ...JSON.parse(JSON.stringify(first)),
      id: 'second',
      assetId: 'b',
      start: 4,
      duration: 4,
    } as VideoItem;
    second.transitionIn = { kind: 'dissolve', duration: 1 } as never;
    (cell.items as Item[]).push(second as Item);
    const c2 = d.tracks.filter((t) => t.groupRole === 'cell')[1]!;
    (c2.items[0] as VideoItem).start = 0;
    (c2.items[0] as VideoItem).duration = 8;
  });
  arrangeGroup(
    s()
      .project!.tracks.find((t) => t.groupRole !== 'cell' && t.items.some((i) => (i as VideoItem).group))!
      .items.find((i) => (i as VideoItem).group)!.group!,
    play,
  );
  // arrangeGroup('seq') 會把各格排成一個接一個；測試要的是固定的起點，所以重設
  s().apply((d) => {
    const cell = d.tracks.filter((t) => t.groupRole === 'cell')[0]!;
    (cell.items[0] as VideoItem).start = 0;
    (cell.items[1] as VideoItem).start = 4;
    const c2 = d.tracks.filter((t) => t.groupRole === 'cell')[1]!;
    (c2.items[0] as VideoItem).start = play === 'seq' ? 8 : 0;
    const fr = d.tracks
      .flatMap((t) => t.items)
      .find((i) => (i as VideoItem).group && !(i as VideoItem).cell && i.type !== 'text')!;
    fr.duration = play === 'seq' ? 16 : 8;
  });
}
const cells = () => s().project!.tracks.filter((t: Track) => t.groupRole === 'cell');
const frameDur = () =>
  s()
    .project!.tracks.flatMap((t) => t.items)
    .find((i) => (i as VideoItem).group && !(i as VideoItem).cell && i.type !== 'text')!.duration;

describe('版型格子裡的停格轉場', () => {
  it('同步：切成停格→第 2 段往後挪 1 秒、只動這一格、外框變長；activeTransition 在空白裡畫兩段停格；切回來、復原都對', () => {
    mk('sync');
    expect(setTransitionMode('second', 'hold')).toBe(true);
    const [c1, c2] = cells();
    expect(c1!.items.map((i) => i.start)).toEqual([0, 5]);
    expect(c2!.items[0]!.start).toBe(0); // 另一格不動
    expect(frameDur()).toBeCloseTo(9);
    const at = activeTransition(c1!.items as Item[], 4.5)!;
    expect((at.a as VideoItem).hold).toBe('after');
    expect((at.b as VideoItem).hold).toBe('before');
    expect(at.p).toBeCloseTo(0.5);
    expect(activeTransition(c1!.items as Item[], 5.2)).toBeNull();
    // 改長度：後面再挪
    setTransition('second', 'dissolve', 2);
    expect(cells()[0]!.items.map((i) => i.start)).toEqual([0, 6]);
    expect(frameDur()).toBeCloseTo(10);
    // 切回邊轉邊播
    setTransitionMode('second', 'overlap');
    expect(cells()[0]!.items.map((i) => i.start)).toEqual([0, 4]);
    expect(frameDur()).toBeCloseTo(8);
    s().undo();
    expect(cells()[0]!.items.map((i) => i.start)).toEqual([0, 6]);
  });
  it('依序：後面的格子跟著挪、外框變長；切回來挪回去', () => {
    mk('seq');
    expect(frameDur()).toBeCloseTo(16);
    setTransitionMode('second', 'hold');
    const [c1, c2] = cells();
    expect(c1!.items.map((i) => i.start)).toEqual([0, 5]);
    expect(c2!.items[0]!.start).toBeCloseTo(9); // 第 2 格整個往後 1 秒
    expect(frameDur()).toBeCloseTo(17);
    setTransitionMode('second', 'overlap');
    expect(cells()[1]!.items[0]!.start).toBeCloseTo(8);
    expect(frameDur()).toBeCloseTo(16);
  });
});
