import { createProject } from '../model/defaults';
import type { Asset, Track } from '../model/types';
import { frameOfGroup } from '../engine/layoutTracks';
import { addLayout, cellMain, fillEmptyCells, importIntoCell } from './actions';
import { useProjectStore } from './projectStore';

const s = () => useProjectStore.getState();
const asset = (id: string, kind: 'image' | 'video' = 'image', duration = 0): Asset =>
  ({ id, kind, name: id, width: 400, height: 300, duration, thumbs: [] }) as unknown as Asset;
const wins = [
  { x: 10, y: 10, w: 100, h: 100 },
  { x: 120, y: 10, w: 100, h: 100 },
  { x: 230, y: 10, w: 100, h: 100 },
];
const mk = (cells: { asset?: Asset; win: (typeof wins)[number] }[], start = 0, duration = 5) => {
  s().load(createProject('測試'));
  addLayout({ cells, frame: asset('f'), start, duration, frameName: '版型' });
  return s().project!.tracks.find((t: Track) => t.groupRole === 'cell')!.group!;
};
const cellTracks = () => s().project!.tracks.filter((t) => t.groupRole === 'cell');

describe('空的版型格子', () => {
  it('addLayout 不給素材＝空格子：格子軌有 cell 位置、沒有物件', () => {
    mk(wins.map((win) => ({ win })));
    const cs = cellTracks();
    expect(cs).toHaveLength(3);
    expect(cs.every((t) => t.items.length === 0 && !!t.cell)).toBe(true);
    expect(cs[0]!.cell).toEqual({ x: 10 / 1080, y: 10 / 1920, w: 100 / 1080, h: 100 / 1920 });
  });
  it('fillEmptyCells：素材比空格少，剩下的格子還是空的；比空格多只用前面的', () => {
    const g = mk(wins.map((win) => ({ win })));
    expect(fillEmptyCells(g, [asset('a'), asset('b')])).toBe(2);
    expect(cellTracks().filter((t) => !cellMain(t))).toHaveLength(1);
    const g2 = mk(wins.slice(0, 2).map((win) => ({ win })));
    expect(fillEmptyCells(g2, [asset('a'), asset('b'), asset('c')])).toBe(2);
  });
  it('importIntoCell：放進空格、照版型開始時間、影片比版型長只用前面；換掉原本的素材時名稱保留', () => {
    const g = mk(
      wins.map((win) => ({ win })),
      2,
      5,
    );
    const t0 = cellTracks()[0]!;
    const id = importIntoCell(t0.id, asset('v', 'video', 9))!;
    const it = cellMain(cellTracks()[0]!)!;
    expect(it.id).toBe(id);
    expect(it.start).toBe(2);
    expect(it.duration).toBe(5);
    expect(it.group).toBe(g);
    expect(it.cell).toBeTruthy();
    s().apply((d) => {
      (d.tracks.find((t) => t.id === t0.id)!.items[0] as { label?: string }).label = '主角';
    });
    importIntoCell(t0.id, asset('w'));
    const again = cellMain(cellTracks()[0]!)!;
    expect(again.label).toBe('主角');
    expect(again.assetId).toBe('w');
  });
  it('外框放在播放線那一秒、主軌那段時間有空就跟主軌同一列；格子軌在它下面', () => {
    s().load(createProject('測試'));
    // 主軌放一個 0–3 秒的素材
    s().apply((d) => {
      d.assets.push(asset('m'));
      d.tracks[0]!.items.push({
        id: 'm1',
        type: 'image',
        assetId: 'm',
        start: 0,
        duration: 3,
        trimIn: 0,
        speed: 1,
        volume: 1,
        fit: 'cover',
        transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
      } as never);
    });
    addLayout({ cells: [{ win: wins[0]! }], frame: asset('f'), start: 3, duration: 5, frameName: '版型' });
    const p = s().project!;
    const g = p.tracks.find((t) => t.groupRole === 'cell')!.group!;
    const fr = frameOfGroup(p.tracks, g)!;
    expect(fr.track.id).toBe(p.tracks.find((t) => !t.groupRole && t.kind === 'media')!.id);
    expect(fr.track.items).toHaveLength(2); // 跟主軌的素材同一列
    const iCell = p.tracks.findIndex((t) => t.groupRole === 'cell');
    expect(iCell).toBeLessThan(p.tracks.findIndex((t) => t.id === fr.track.id));
    // 時間重疊就開新的一列
    addLayout({ cells: [{ win: wins[0]! }], frame: asset('f2'), start: 4, duration: 3, frameName: '版型2' });
    const mediaRows = s().project!.tracks.filter((t) => t.kind === 'media' && !t.groupRole);
    expect(mediaRows).toHaveLength(2);
  });
});

describe('版型成員（文字、音效）', () => {
  it('addGroupMember：放進版型自己的成員軌；時間夾在版型範圍裡', async () => {
    const { createTextItem, createAudioClip } = await import('../model/defaults');
    const { addGroupMember, clampToGroup } = await import('./actions');
    const g = mk([{ win: wins[0]! }], 2, 5); // 版型 2～7 秒
    const t1 = createTextItem(0, '嗨'); // 播放線在版型之前 → 夾到版型開始
    addGroupMember(g, t1);
    const p = s().project!;
    const mt = p.tracks.find((t) => t.groupRole === 'member')!;
    expect(mt.kind).toBe('text');
    expect(mt.group).toBe(g);
    expect(mt.items[0]!.start).toBe(2);
    // 太靠後：長度被截到版型結束
    const t2 = createTextItem(6.5, '尾');
    addGroupMember(g, t2);
    const tail = s()
      .project!.tracks.flatMap((t) => t.items)
      .find((x) => x.id === t2.id)!;
    expect(tail.start + tail.duration).toBeLessThanOrEqual(7.0001);
    // 同一段時間放不下就開新的成員軌
    addGroupMember(g, createTextItem(2, '疊'));
    expect(
      s().project!.tracks.filter((t) => t.groupRole === 'member' && t.kind === 'text').length,
    ).toBeGreaterThan(1);
    // 音效：成員軌是 audio，物件標成版型成員
    const a = asset('snd', 'video', 10);
    addGroupMember(g, createAudioClip({ ...a, kind: 'audio' }, 3));
    const at = s().project!.tracks.find((t) => t.groupRole === 'member' && t.kind === 'audio')!;
    expect(at.items[0]!.group).toBe(g);
    expect(at.items[0]!.start + at.items[0]!.duration).toBeLessThanOrEqual(7.0001);
    // clampToGroup：拖到版型外面會被夾回來
    const item = at.items[0]!;
    expect(clampToGroup(s().project!, item, 20, item.duration).start + item.duration).toBeLessThanOrEqual(
      7.0001,
    );
    expect(clampToGroup(s().project!, item, -5, item.duration).start).toBeGreaterThanOrEqual(2);
  });
  it('刪掉版型：成員軌一起拿掉', async () => {
    const { createTextItem } = await import('../model/defaults');
    const { addGroupMember, removeGroup } = await import('./actions');
    const g = mk([{ win: wins[0]! }]);
    addGroupMember(g, createTextItem(0, '字'));
    removeGroup(g);
    expect(s().project!.tracks.filter((t) => t.group === g)).toHaveLength(0);
  });
});
