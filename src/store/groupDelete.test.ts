import { createProject } from '../model/defaults';
import type { Asset, Track, VideoItem } from '../model/types';
import { addLayout, removeAnyItem, removeTrack, rippleRemoveItem } from './actions';
import { useProjectStore } from './projectStore';

const s = () => useProjectStore.getState();
const asset = (id: string): Asset =>
  ({ id, kind: 'image', name: id, width: 400, height: 300, duration: 0 }) as unknown as Asset;
const mk = () => {
  s().load(createProject('測試'));
  addLayout({
    cells: [
      { asset: asset('a'), win: { x: 10, y: 10, w: 100, h: 100 } },
      { asset: asset('b'), win: { x: 120, y: 10, w: 100, h: 100 } },
    ],
    frame: asset('f'),
    start: 0,
    duration: 3,
    frameName: '測試版型',
  });
};
const frameId = () => s().project!.tracks.find((t: Track) => t.groupRole === 'frame')!.items[0]!.id;
const groupLeft = () =>
  s()
    .project!.tracks.flatMap((t) => t.items)
    .filter((i): i is VideoItem => i.type !== 'text' && i.type !== 'audio' && !!i.group).length;

describe('刪除版型：不能留下孤兒格子', () => {
  beforeEach(mk);
  it('「刪除並補齊」刪外框＝整個版型拿掉', () => {
    expect(groupLeft()).toBe(3);
    rippleRemoveItem(frameId());
    expect(groupLeft()).toBe(0);
    expect(s().project!.tracks.filter((t) => t.groupRole)).toHaveLength(0);
  });
  it('一般刪除外框＝整個版型拿掉', () => {
    removeAnyItem(frameId());
    expect(groupLeft()).toBe(0);
  });
  it('刪外框的軌道（軌道選單）＝整個版型拿掉；刪格子的軌道也一樣', () => {
    const frameTrack = s().project!.tracks.find((t) => t.groupRole === 'frame')!;
    removeTrack(frameTrack.id);
    expect(groupLeft()).toBe(0);
    mk();
    const cellTrack = s().project!.tracks.find((t) => t.groupRole === 'cell')!;
    removeTrack(cellTrack.id);
    expect(groupLeft()).toBe(0);
  });
  it('刪單一格子：只有那一格沒了，版型還在（那一格之後顯示色塊）', () => {
    const cell = s().project!.tracks.find((t) => t.groupRole === 'cell')!.items[0]!;
    rippleRemoveItem(cell.id);
    expect(groupLeft()).toBe(2);
  });
});
