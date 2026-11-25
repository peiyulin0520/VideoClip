import { createProject } from '../model/defaults';
import type { Asset, Item, TextItem, Track, VideoItem } from '../model/types';
import { addLayout, setGroupDuration, setGroupStart } from './actions';
import { useProjectStore } from './projectStore';

const s = () => useProjectStore.getState();
const asset = (id: string): Asset =>
  ({ id, kind: 'video', name: id, width: 400, height: 300, duration: 20 }) as unknown as Asset;
const textItem = (id: string, start: number, duration: number): TextItem =>
  ({
    id,
    type: 'text',
    start,
    duration,
    speed: 1,
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
    card: { runs: [{ text: 'hi' }] },
  }) as unknown as TextItem;

function mk() {
  s().load(createProject('測試'));
  addLayout({
    cells: [{ asset: asset('a'), win: { x: 10, y: 10, w: 100, h: 100 } }],
    frame: asset('f'),
    start: 2,
    duration: 8, // 2–10 秒
    frameName: '測試版型',
  });
  s().apply((d) => {
    const cell = d.tracks.find((t) => t.groupRole === 'cell')!;
    const first = cell.items[0] as VideoItem;
    first.start = 2;
    first.duration = 4; // 2–6
    first.trimIn = 1;
    const second = {
      ...JSON.parse(JSON.stringify(first)),
      id: 'second',
      start: 6,
      duration: 4,
      trimIn: 0,
    } as VideoItem;
    second.transitionIn = { kind: 'dissolve', duration: 1 } as never;
    (cell.items as Item[]).push(second as Item);
  });
}
const all = () => s().project!.tracks.flatMap((t: Track) => t.items.map((i) => ({ i, t })));
const find = (id: string) => all().find((x) => x.i.id === id);
const frameItem = () =>
  all().find((x) => x.t.groupRole !== 'cell' && (x.i as VideoItem).group && !(x.i as VideoItem).cell)!.i;
const cellItems = () => s().project!.tracks.find((t) => t.groupRole === 'cell')!.items as VideoItem[];
const group = () => (frameItem() as VideoItem).group!;

describe('setGroupStart：版型開始時間', () => {
  beforeEach(mk);
  it('往右（變短）：外框開始／長度改、結尾不動；各格在新開頭前的部分切掉，影片入點往後', () => {
    setGroupStart(group(), 4);
    const f = frameItem();
    expect(f.start).toBeCloseTo(4);
    expect(f.start + f.duration).toBeCloseTo(10);
    const [a, b] = cellItems();
    expect(a!.start).toBeCloseTo(4);
    expect(a!.duration).toBeCloseTo(2);
    expect(a!.trimIn).toBeCloseTo(3); // 1 + 切掉的 2 秒
    expect(b!.start).toBeCloseTo(6); // 後面的不動
  });
  it('整段都在新開頭之前的拿掉；留下的第二段開頭被切掉就沒有轉場', () => {
    setGroupStart(group(), 7);
    const items = cellItems();
    expect(items.map((i) => i.id)).toEqual(['second']);
    expect(items[0]!.start).toBeCloseTo(7);
    expect(items[0]!.trimIn).toBeCloseTo(1);
    expect(items[0]!.transitionIn).toBeUndefined();
  });
  it('往左（變長）：各素材不動', () => {
    setGroupStart(group(), 0.5);
    const f = frameItem();
    expect(f.start).toBeCloseTo(0.5);
    expect(f.duration).toBeCloseTo(9.5);
    const [a, b] = cellItems();
    expect([a!.start, a!.duration, a!.trimIn, b!.start]).toEqual([2, 4, 1, 6]);
  });
  it('不能小於 0 秒；最短 0.5 秒', () => {
    setGroupStart(group(), -3);
    expect(frameItem().start).toBe(0);
    setGroupStart(group(), 99);
    expect(frameItem().duration).toBeCloseTo(0.5);
    expect(frameItem().start).toBeCloseTo(9.5);
  });
  it('版型裡的文字：開頭被切到夾進新開頭；整段在前面的拿掉', () => {
    s().apply((d) => {
      d.tracks.push({
        id: 'tt',
        kind: 'text',
        name: '文字',
        items: [textItem('t1', 3, 4), textItem('t2', 2, 1)],
      } as Track);
    });
    // 這兩段本來不在版型裡；直接設 group 當成成員
    s().apply((d) => {
      for (const t of d.tracks)
        for (const i of t.items)
          if (i.id === 't1' || i.id === 't2') (i as TextItem & { group?: string }).group = group();
    });
    setGroupStart(group(), 4);
    expect(find('t2')).toBeUndefined();
    expect(find('t1')!.i.start).toBeCloseTo(4);
    expect(find('t1')!.i.duration).toBeCloseTo(3);
  });
  it('跟 setGroupDuration 搭配、一步復原', () => {
    setGroupStart(group(), 4);
    setGroupDuration(group(), 3);
    expect(frameItem().start).toBeCloseTo(4);
    expect(frameItem().duration).toBeCloseTo(3);
    s().undo();
    s().undo();
    expect(frameItem().start).toBeCloseTo(2);
    expect(cellItems()[0]!.trimIn).toBeCloseTo(1);
    expect(cellItems().length).toBe(2);
  });
});
