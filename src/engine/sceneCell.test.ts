import { createProject } from '../model/defaults';
import type { Asset, Item, Track, VideoItem } from '../model/types';
import { addLayout } from '../store/actions';
import { useProjectStore } from '../store/projectStore';
import { buildScene } from './scene';

// Z20：版型格子裡兩段素材之間的轉場，轉場那一秒也要把素材拉回格子裡（版型動過、素材位置跟格子對不上時，
// 以前轉場那段直接畫在舊位置、被格子裁掉，格子是空的、露出下面）
const s = () => useProjectStore.getState();
const img = (id: string): Asset =>
  ({ id, kind: 'image', name: id, width: 400, height: 300, duration: 0 }) as unknown as Asset;
const W = 1080;
const H = 1920;

function mk(before?: number, after?: number) {
  s().load(createProject('測試'));
  addLayout({
    cells: [{ asset: img('a'), win: { x: 100, y: 100, w: 400, h: 400 } }],
    frame: img('f'),
    start: 0,
    duration: 8,
    frameName: '測試版型',
  });
  const p0 = s().project!;
  s().apply((d) => {
    d.assets.push(img('b'), img('a'));
    const cell = d.tracks.find((t) => t.groupRole === 'cell')!;
    const first = cell.items[0] as VideoItem;
    first.duration = 4;
    const second = {
      ...JSON.parse(JSON.stringify(first)),
      id: 'second',
      assetId: 'b',
      start: 4,
      duration: 4,
    } as VideoItem;
    second.transitionIn = {
      kind: 'dissolve',
      duration: 1,
      ...(before !== undefined ? { before, after } : {}),
    } as never;
    (cell.items as Item[]).push(second as Item);
  });
  void p0;
}

const provide = (_item: Item, asset: Asset) => ({
  source: {} as never,
  ready: true,
  srcW: asset.width,
  srcH: asset.height,
});
const cellOf = () => s().project!.tracks.find((t: Track) => t.groupRole === 'cell')!;

describe('版型格子裡的轉場：素材要在格子裡', () => {
  for (const [name, b, a] of [
    ['置中', undefined, undefined],
    ['接縫前 0.62＋接縫後 0.39（使用者的）', 0.62, 0.39],
  ] as const)
    it(`${name}：素材位置被偏掉也不會畫到格子外`, () => {
      mk(b, a);
      // 正常的位置當對照；再把兩段素材都偏掉 1.0（整個畫面寬）
      const t0 = 4.0;
      const ok = buildScene(s().project!, t0, W, H, provide as never, {});
      s().apply((d) => {
        const c = d.tracks.find((x) => x.groupRole === 'cell')!;
        for (const it of c.items as VideoItem[]) it.transform.x += 1;
      });
      const bad = buildScene(s().project!, t0, W, H, provide as never, {});
      const ids = (cellOf().items as Item[]).map((i) => i.id);
      const pick = (l: ReturnType<typeof buildScene>) => l.filter((x) => ids.includes(x.id));
      expect(pick(ok).length).toBe(2); // 轉場中兩段都畫
      expect(pick(bad).length).toBe(2);
      for (const [x, y] of pick(ok).map((l, i) => [l, pick(bad)[i]!] as const)) {
        expect(y.box.cx).toBeCloseTo(x.box.cx, 3); // 偏掉的被拉回來，位置跟對照一樣
        expect(y.box.cy).toBeCloseTo(x.box.cy, 3);
      }
    });
  it('裁切模式（guardCells:false）照舊不拉回', () => {
    mk();
    s().apply((d) => {
      const c = d.tracks.find((x) => x.groupRole === 'cell')!;
      for (const it of c.items as VideoItem[]) it.transform.x += 1;
    });
    const ok = buildScene(s().project!, 4, W, H, provide as never, {});
    const raw = buildScene(s().project!, 4, W, H, provide as never, { guardCells: false });
    const ids = (cellOf().items as Item[]).map((i) => i.id);
    const a = ok.find((l) => ids.includes(l.id))!;
    const b = raw.find((l) => ids.includes(l.id))!;
    expect(Math.abs(a.box.cx - b.box.cx)).toBeGreaterThan(100);
  });
});
