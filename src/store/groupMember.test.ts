import { createProject } from '../model/defaults';
import type { Asset, Item, TextItem, Track, VideoItem } from '../model/types';
import { addLayout, attachToGroup, detachFromGroup, groupToJoin } from './actions';
import { useProjectStore } from './projectStore';

const s = () => useProjectStore.getState();
const asset = (id: string): Asset =>
  ({ id, kind: 'image', name: id, width: 400, height: 300, duration: 0 }) as unknown as Asset;
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
    start: 1,
    duration: 3,
    frameName: '測試版型',
  });
  s().apply((d) => {
    d.tracks.push({
      id: 'tt',
      kind: 'text',
      name: '文字',
      items: [textItem('t1', 2, 1), textItem('t2', 9, 1)],
    } as Track);
  });
}
const find = (id: string) =>
  s()
    .project!.tracks.flatMap((t) => t.items.map((i) => ({ i, t })))
    .find((x) => x.i.id === id)!;

describe('加進版型／移出版型（選到的文字）', () => {
  beforeEach(mk);
  it('groupToJoin：時間有重疊的版型才算；已經在版型裡的是 null', () => {
    const p = s().project!;
    expect(groupToJoin(p, find('t1').i as Item)).toBeTruthy();
    expect(groupToJoin(p, find('t2').i as Item)).toBeNull(); // 9–10 秒沒有版型
  });
  it('attachToGroup：搬到版型的成員軌、時間夾在版型範圍內、原本空掉的文字軌拿掉；一步復原', () => {
    const g = groupToJoin(s().project!, find('t1').i as Item)!;
    expect(attachToGroup('t1', g)).toBe(true);
    const x = find('t1');
    expect(x.t.groupRole).toBe('member');
    expect((x.i as VideoItem).group).toBe(g);
    expect(x.i.start).toBeGreaterThanOrEqual(1);
    expect(x.i.start + x.i.duration).toBeLessThanOrEqual(4 + 1e-6);
    expect(
      s()
        .project!.tracks.find((t) => t.id === 'tt')!
        .items.map((i) => i.id),
    ).toEqual(['t2']);
    s().undo();
    expect(find('t1').t.id).toBe('tt');
    expect((find('t1').i as VideoItem).group).toBeUndefined();
  });
  it('detachFromGroup：搬回一般軌道、時間不變、成員軌空了就拿掉；一步復原', () => {
    const g = groupToJoin(s().project!, find('t1').i as Item)!;
    attachToGroup('t1', g);
    const start = find('t1').i.start;
    expect(detachFromGroup('t1')).toBe(true);
    const x = find('t1');
    expect(x.t.groupRole).toBeUndefined();
    expect((x.i as VideoItem).group).toBeUndefined();
    expect(x.i.start).toBe(start);
    expect(s().project!.tracks.filter((t) => t.groupRole === 'member')).toHaveLength(0);
    s().undo();
    expect(find('t1').t.groupRole).toBe('member');
  });
  it('不在版型裡的東西不能移出', () => {
    expect(detachFromGroup('t1')).toBe(false);
  });
});
