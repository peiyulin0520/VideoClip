import { describe, expect, it } from 'vitest';
import { migrateProject } from './migrate';
import type { Project } from './types';

const item = (id: string, start: number, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'video',
  assetId: 'a',
  start,
  duration: 2,
  trimIn: 0,
  speed: 1,
  volume: 1,
  fit: 'cover',
  transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
  ...extra,
});
const text = (id: string, start: number) => ({
  id,
  type: 'text',
  start,
  duration: 3,
  transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
  card: {},
});
const track = (id: string, kind: string, name: string, items: unknown[] = [], extra = {}) => ({
  id,
  kind,
  name,
  hidden: false,
  locked: false,
  items,
  ...extra,
});
const v1 = (tracks: unknown[]) =>
  ({
    id: 'p',
    name: 'x',
    createdAt: 1,
    updatedAt: 1,
    aspect: '9:16',
    width: 1080,
    height: 1920,
    fps: 30,
    assets: [],
    tracks,
    version: 1,
  }) as unknown as Project;

describe('migrateProject v1 → v2', () => {
  it('只有主軌：變成「影像 1」，片段時間不變', () => {
    const m = migrateProject(v1([track('m', 'main', '主軌', [item('a', 0), item('b', 2)])]));
    expect(m.changed).toBe(true);
    expect(m.reordered).toBe(false);
    expect(m.project.version).toBe(2);
    expect(m.project.tracks).toHaveLength(1);
    expect(m.project.tracks[0]!.kind).toBe('media');
    expect(m.project.tracks[0]!.name).toBe('影像 1');
    expect(m.project.tracks[0]!.items.map((i) => [i.id, i.start])).toEqual([
      ['a', 0],
      ['b', 2],
    ]);
  });

  it('主軌有 gap：gap 欄位刪掉，start 保留（空白已經在 start 裡）', () => {
    const m = migrateProject(
      v1([track('m', 'main', '主軌', [item('a', 1.5, { gap: 1.5 }), item('b', 3.5)])]),
    );
    const items = m.project.tracks[0]!.items;
    expect(items.map((i) => i.start)).toEqual([1.5, 3.5]);
    expect(items.every((i) => !('gap' in i))).toBe(true);
  });

  it('主軌＋疊加＋字卡＋音樂：疊加變影像 2、3；順序依分區（影像 → 字卡 → 音訊）', () => {
    const m = migrateProject(
      v1([
        track('m', 'main', '主軌', [item('a', 0)]),
        track('o1', 'overlay', '疊加 1', [item('b', 0)]),
        track('t', 'text', '文字 1', [text('c', 0)]),
        track('o2', 'overlay', '疊加 2', [item('d', 1)]),
        track('au', 'audio', '音樂 1', [item('e', 0, { type: 'audio' })]),
      ]),
    );
    expect(m.project.tracks.map((t) => [t.id, t.kind, t.name])).toEqual([
      ['m', 'media', '影像 1'],
      ['o1', 'media', '影像 2'],
      ['o2', 'media', '影像 3'],
      ['t', 'text', '文字 1'],
      ['au', 'audio', '音樂 1'],
    ]);
    expect(m.reordered).toBe(true); // 字卡本來在疊加 2 的下面
  });

  it('字卡軌本來就在所有影像上面：不算調整順序', () => {
    const m = migrateProject(
      v1([
        track('m', 'main', '主軌', [item('a', 0)]),
        track('o1', 'overlay', '疊加 1', [item('b', 0)]),
        track('t', 'text', '文字 1', [text('c', 0)]),
      ]),
    );
    expect(m.reordered).toBe(false);
  });

  it('使用者自己改過的軌道名字保留；鎖住、靜音等設定保留', () => {
    const m = migrateProject(
      v1([
        track('m', 'main', '我的主畫面', [item('a', 0)], { muted: true }),
        track('o', 'overlay', '貼紙層', [item('b', 0)], { locked: true }),
      ]),
    );
    expect(m.project.tracks.map((t) => t.name)).toEqual(['我的主畫面', '貼紙層']);
    expect(m.project.tracks[0]!.muted).toBe(true);
    expect(m.project.tracks[1]!.locked).toBe(true);
  });

  it('版型專案：外框（鎖住的最上層疊加軌）仍在影像區最上面且鎖住', () => {
    const m = migrateProject(
      v1([
        track('m', 'main', '主軌', [item('a', 0)]),
        track('c1', 'overlay', '疊加 1', [item('b', 0, { cell: { x: 0, y: 0, w: 1, h: 1 }, group: 'g' })]),
        track('f', 'overlay', '疊加 2', [item('f1', 0, { group: 'g' })], { locked: true }),
      ]),
    );
    const t = m.project.tracks;
    expect(t[t.length - 1]!.id).toBe('f');
    expect(t[t.length - 1]!.groupRole).toBe('frame'); // G4：外框改成版型的代表列，不再鎖住
    expect(t.every((x) => x.kind === 'media')).toBe(true);
  });

  it('已經是 v2：原封不動（同一個物件）', () => {
    const p = { ...v1([track('m', 'media', '影像 1', [item('a', 0)])]), version: 2 } as unknown as Project;
    const m = migrateProject(p);
    expect(m.changed).toBe(false);
    expect(m.project).toBe(p);
  });
});

describe('markLegacyGroups', () => {
  it('舊的版型：外框軌解鎖並標記、各格軌道標記為 cell', async () => {
    const { markLegacyGroups } = await import('./migrate');
    const mk = (id: string, locked: boolean, cell: boolean) =>
      ({
        id,
        kind: 'media',
        name: id,
        locked,
        items: [
          {
            id: `${id}-i`,
            type: 'image',
            group: 'g1',
            ...(cell ? { cell: { x: 0, y: 0, w: 1, h: 1 } } : {}),
          },
        ],
      }) as never;
    const p = { tracks: [mk('c1', false, true), mk('f', true, false)] } as never;
    const r = markLegacyGroups(p);
    expect(r.changed).toBe(true);
    const [c, f] = r.project.tracks;
    expect(c!.groupRole).toBe('cell');
    expect(c!.fill).toBe('black');
    expect(f!.groupRole).toBe('frame');
    expect(f!.locked).toBe(false);
    expect(markLegacyGroups(r.project).changed).toBe(false);
  });
});

describe('repairGroups', () => {
  it('孤兒格子（沒有外框的 group）變回普通影像軌', async () => {
    const { repairGroups } = await import('./migrate');
    const p = {
      tracks: [
        {
          id: 'c',
          kind: 'media',
          name: 'c',
          group: 'g1',
          groupRole: 'cell',
          fill: 'black',
          items: [{ id: 'i', type: 'image', group: 'g1', cell: { x: 0, y: 0, w: 1, h: 1 } }],
        },
      ],
    } as never;
    const r = repairGroups(p);
    expect(r.changed).toBe(true);
    const t = r.project.tracks[0]!;
    expect(t.groupRole).toBeUndefined();
    expect(t.group).toBeUndefined();
    const it = t.items[0] as unknown as Record<string, unknown>;
    expect(it.group).toBeUndefined();
    expect(it.cell).toBeUndefined();
  });
  it('有外框的版型不動；已移除的動態模板欄位被清掉', async () => {
    const { repairGroups } = await import('./migrate');
    const p = {
      tracks: [
        {
          id: 'c',
          kind: 'media',
          group: 'g1',
          groupRole: 'cell',
          items: [
            { id: 'i', type: 'image', group: 'g1', cell: { x: 0, y: 0, w: 1, h: 1 }, cellAnim: { t0: 0 } },
          ],
        },
        {
          id: 'f',
          kind: 'media',
          group: 'g1',
          groupRole: 'frame',
          items: [{ id: 'fi', type: 'image', group: 'g1', template: 'story3' }],
        },
        {
          id: 't',
          kind: 'text',
          items: [{ id: 'x', type: 'text', group: 'g1', fontCycle: { fonts: [], interval: 1, until: 1 } }],
        },
      ],
    } as never;
    const r = repairGroups(p);
    expect(r.changed).toBe(true);
    const [c, f, t] = r.project.tracks;
    expect(c!.groupRole).toBe('cell');
    expect((c!.items[0] as unknown as Record<string, unknown>).cellAnim).toBeUndefined();
    expect((f!.items[0] as unknown as Record<string, unknown>).template).toBeUndefined();
    expect((t!.items[0] as unknown as Record<string, unknown>).fontCycle).toBeUndefined();
    expect((t!.items[0] as unknown as Record<string, unknown>).group).toBeUndefined();
    expect(repairGroups(r.project).changed).toBe(false);
  });
});

describe('migrateStickers：貼圖自成一類', () => {
  const asset = (id: string, name: string, origin?: 'sticker') => ({ id, name, kind: 'image', origin });
  const it_ = (id: string, assetId: string, start: number, duration = 2) => ({
    id,
    type: 'image',
    assetId,
    start,
    duration,
  });
  const track = (id: string, name: string, items: unknown[], kind = 'media') => ({
    id,
    kind,
    name,
    hidden: false,
    locked: false,
    items,
  });

  it('舊專案：檔名「貼圖-」「GIPHY-」開頭的素材補上 origin；整條都是貼圖的軌道改成貼圖軌', async () => {
    const { migrateStickers } = await import('./migrate');
    const p = {
      assets: [asset('v', 'a.mp4'), asset('s', '貼圖-愛心.png'), asset('g', 'GIPHY-abc.webp')],
      tracks: [
        track('m1', '影像 1', [it_('i1', 'v', 0, 4)]),
        track('m2', '影像 2', [it_('i2', 's', 0), it_('i3', 'g', 3)]),
      ],
    } as never;
    const r = migrateStickers(p);
    expect(r.changed).toBe(true);
    expect(r.project.assets.map((a) => a.origin)).toEqual([undefined, 'sticker', 'sticker']);
    expect(r.project.tracks.map((t) => t.kind)).toEqual(['media', 'sticker']);
    expect(r.project.tracks[1]!.name).toBe('貼圖 2');
    expect(migrateStickers(r.project).changed).toBe(false);
  });

  it('混在同一條：貼圖搬到貼圖軌（時間不變），影片、照片留下；至少留一條影像軌', async () => {
    const { migrateStickers } = await import('./migrate');
    const p = {
      assets: [asset('v', 'a.mp4'), asset('s', 'x.png', 'sticker')],
      tracks: [track('m1', '影像 1', [it_('i1', 'v', 0, 4), it_('i2', 's', 1), it_('i3', 's', 1.5)])],
    } as never;
    const r = migrateStickers(p);
    const kinds = r.project.tracks.map((t) => t.kind);
    expect(kinds).toEqual(['media', 'sticker', 'sticker']); // 兩個貼圖時間重疊，各自一條貼圖軌
    expect(r.project.tracks[0]!.items.map((i) => i.id)).toEqual(['i1']);
    const sticker = r.project.tracks.filter((t) => t.kind === 'sticker').flatMap((t) => t.items);
    expect(sticker.map((i) => [i.id, i.start])).toEqual([
      ['i2', 1],
      ['i3', 1.5],
    ]);
  });

  it('只有貼圖的專案：那一條影像軌不改（至少留一條影像軌）', async () => {
    const { migrateStickers } = await import('./migrate');
    const p = {
      assets: [asset('s', 'x.png', 'sticker')],
      tracks: [track('m1', '影像 1', [it_('i1', 's', 0)])],
    } as never;
    expect(migrateStickers(p).project.tracks[0]!.kind).toBe('media');
  });
});
