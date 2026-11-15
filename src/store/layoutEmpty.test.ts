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
