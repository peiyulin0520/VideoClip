import { createClip, createOverlayClip, createProject, createTextItem, createTrack } from '../model/defaults';
import type { Asset, Item, VideoItem } from '../model/types';
import {
  canPlace,
  duplicateFree,
  findFreeStart,
  firstFreeTrack,
  moveFree,
  moveTrack,
  splitFree,
  trimEndFree,
  trimStartFree,
  visibleLayers,
} from './timeline';

const asset = (id: string, duration: number): Asset => ({
  id,
  kind: 'video',
  name: id,
  mime: 'video/webm',
  size: 1,
  duration,
  width: 320,
  height: 568,
  hasAudio: true,
  thumbs: [],
});

const clip = (id: string, start: number, duration: number, trimIn = 0): VideoItem => ({
  ...createOverlayClip(asset(id, 10), start),
  id,
  duration,
  trimIn,
});

describe('自由放置（疊加/文字軌）', () => {
  const items: Item[] = [clip('a', 1, 2), clip('b', 5, 2)];

  it('canPlace：邊緣相接可以，重疊不行', () => {
    expect(canPlace(items, 3, 2)).toBe(true); // 3–5 剛好夾在中間
    expect(canPlace(items, 2.5, 2)).toBe(false);
    expect(canPlace(items, 0, 1)).toBe(true);
    expect(canPlace(items, -1, 1)).toBe(false);
    expect(canPlace(items, 1, 2, 'a')).toBe(true); // 排除自己
  });

  it('findFreeStart：想放的位置被佔用時，挑最近的空位', () => {
    expect(findFreeStart(items, 3, 2)).toBe(3);
    expect(findFreeStart(items, 1.5, 1)).toBe(0); // 前面 0–1 剛好放得下，比 3 近
    expect(findFreeStart(items, 2, 3)).toBe(7); // 中間放不下 3 秒，只能放最後面
    expect(findFreeStart([], 4, 2)).toBe(4);
    expect(findFreeStart(items, -3, 1)).toBe(0);
  });

  it('moveFree 不會疊到別人', () => {
    const out = moveFree(items, 'a', 4.5) as VideoItem[]; // a 長 2 秒，4.5–6.5 會壓到 b(5–7)
    const a = out.find((x) => x.id === 'a')!;
    expect(
      canPlace(
        out.filter((x) => x.id !== 'a'),
        a.start,
        a.duration,
      ),
    ).toBe(true);
  });

  it('splitFree：不 ripple，後半的素材起點正確；文字也能分割', () => {
    const out = splitFree(items, 'a', 2)!;
    expect(out).toHaveLength(3);
    expect(out[0]!.duration).toBeCloseTo(1);
    expect(out[1]!.start).toBeCloseTo(2);
    expect((out[1] as VideoItem).trimIn).toBeCloseTo(1);
    expect(out[2]!.start).toBe(5); // b 沒動
    expect(splitFree(items, 'a', 1.1)).toBeNull();
    const txt = [createTextItem(0)];
    const t2 = splitFree(txt, txt[0]!.id, 1.5)!;
    expect(t2).toHaveLength(2);
    expect(t2[1]!.start).toBe(1.5);
  });

  it('duplicateFree 放在原本後面的空位', () => {
    const r = duplicateFree(items, 'a')!;
    const copy = r.items.find((x) => x.id === r.newId)!;
    expect(copy.start).toBe(3);
    expect(
      canPlace(
        r.items.filter((x) => x.id !== copy.id),
        copy.start,
        copy.duration,
      ),
    ).toBe(true);
  });

  it('trimStartFree：不能侵入前一個物件，也不能超過素材起點', () => {
    const list: Item[] = [clip('p', 0, 2), clip('c', 4, 3, 2)];
    const a = trimStartFree(list, 'c', -10) as VideoItem[]; // 往前拉：最多到 p 的結尾 (2) 或素材起點 (trimIn 2 → 往前最多 2 秒)
    expect(a[1]!.start).toBe(2);
    expect(a[1]!.trimIn).toBe(0);
    const b = trimStartFree(list, 'c', 1) as VideoItem[];
    expect(b[1]!.start).toBe(5);
    expect(b[1]!.duration).toBe(2);
    expect(b[1]!.trimIn).toBe(3);
  });

  it('trimEndFree：不能侵入下一個物件，也不能超過素材長度', () => {
    const list: Item[] = [clip('c', 0, 2), clip('n', 4, 2)];
    expect(trimEndFree(list, 'c', 99, asset('c', 10))[0]!.duration).toBe(4);
    expect(trimEndFree(list, 'c', 99, asset('c', 3))[0]!.duration).toBe(3);
    expect(trimEndFree(list, 'c', 0, asset('c', 10))[0]!.duration).toBeCloseTo(0.2);
  });
});

describe('圖層與軌道', () => {
  function proj() {
    const p = createProject('t');
    const main = createClip(asset('m', 5));
    p.assets.push(asset('m', 5), asset('o', 5));
    p.tracks[0]!.items = [main];
    const o1 = createTrack('overlay', p.tracks);
    p.tracks.push(o1);
    o1.items = [clip('o1', 1, 3)];
    const o2 = createTrack('overlay', p.tracks);
    p.tracks.push(o2);
    o2.items = [clip('o2', 2, 3)];
    const tx = createTrack('text', p.tracks);
    p.tracks.push(tx);
    tx.items = [{ ...createTextItem(2.5), id: 'tx' }];
    return p;
  }

  it('visibleLayers 由下到上＝軌道順序；時間外的不出現', () => {
    const p = proj();
    expect(visibleLayers(p, 0.5).map((l) => l.item.id)).toEqual([p.tracks[0]!.items[0]!.id]);
    expect(visibleLayers(p, 2.2).map((l) => l.item.id)).toEqual([p.tracks[0]!.items[0]!.id, 'o1', 'o2']);
    expect(
      visibleLayers(p, 2.7)
        .map((l) => l.item.id)
        .slice(1),
    ).toEqual(['o1', 'o2', 'tx']);
    expect(
      visibleLayers(p, 4.5)
        .map((l) => l.item.id)
        .slice(1),
    ).toEqual(['o2', 'tx']); // o1 在 4 秒結束，文字 2.5–5.5 還在
  });

  it('隱藏的軌道不畫', () => {
    const p = proj();
    p.tracks[1]!.hidden = true;
    expect(
      visibleLayers(p, 2.2)
        .map((l) => l.item.id)
        .slice(1),
    ).toEqual(['o2']);
  });

  it('moveTrack 換圖層順序，主軌不動', () => {
    const p = proj();
    const ids = p.tracks.map((t) => t.id);
    const up = moveTrack(p.tracks, ids[1]!, 1);
    expect(up.map((t) => t.id)).toEqual([ids[0], ids[2], ids[1], ids[3]]);
    expect(moveTrack(p.tracks, ids[1]!, -1)).toBe(p.tracks); // 不能換到主軌下面
    expect(moveTrack(p.tracks, ids[0]!, 1)).toBe(p.tracks); // 主軌不能動
    expect(moveTrack(p.tracks, ids[3]!, 1)).toBe(p.tracks); // 已經最上面
    const layers = visibleLayers({ ...p, tracks: up }, 2.2).map((l) => l.item.id);
    expect(layers.slice(1)).toEqual(['o2', 'o1']);
  });

  it('firstFreeTrack 找得到空軌，找不到回 -1', () => {
    const p = proj();
    expect(firstFreeTrack(p, 'overlay', 0, 1)).toBe(1); // o1 的 0–1 是空的
    expect(firstFreeTrack(p, 'overlay', 2.5, 1)).toBe(-1); // 兩條都被占
    expect(firstFreeTrack(p, 'text', 0, 1)).toBe(3);
  });
});
