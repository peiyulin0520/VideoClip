import { createClip, createProject, createTrack } from '../model/defaults';
import type { Asset, Track, VideoItem } from '../model/types';
import {
  baseMediaTrack,
  duplicateFree,
  insertIndexFor,
  layersAt,
  mediaItems,
  normalizeZones,
  placeSequential,
  rippleDelete,
  setSpeedFree,
  sourceTimeAt,
  splitFree,
  totalDuration,
  trackEnd,
  trimEndFree,
  trimStartFree,
  visibleLayers,
  zoneRange,
} from './timeline';

const asset = (id: string, duration: number): Asset => ({
  id,
  kind: 'video',
  name: id,
  mime: 'video/mp4',
  size: 1,
  duration,
  width: 100,
  height: 100,
  hasAudio: true,
  thumbs: [],
});

/** 三個接在一起的片段：0–4、4–6、6–9 */
function three(): VideoItem[] {
  return placeSequential([createClip(asset('a', 4)), createClip(asset('b', 2)), createClip(asset('c', 3))]);
}

describe('timeline（所有軌道自由擺放）', () => {
  it('placeSequential：匯入多支影片依序接在一起；總長度是最晚結束的', () => {
    const items = three();
    expect(items.map((i) => i.start)).toEqual([0, 4, 6]);
    expect(placeSequential(three(), 10).map((i) => i.start)).toEqual([10, 14, 16]);
    const p = createProject('x');
    p.tracks[0]!.items = items;
    expect(totalDuration(p)).toBe(9);
    expect(trackEnd(items)).toBe(9);
  });

  it('sourceTimeAt 與變速：改速度後長度跟著變，後面的片段位置不動（自由擺放，不再順延）', () => {
    const items = three();
    const sped = setSpeedFree(items, items[0]!.id, 2)! as VideoItem[]; // 4 秒素材 → 2 秒
    expect(sped[0]!.duration).toBe(2);
    expect(sourceTimeAt(sped[0]!, 1)).toBe(2);
    expect(sped[1]!.start).toBe(4); // 中間多出 2 秒空位
    // 變慢會撞到後面的片段 → 不行（回傳 null）
    expect(setSpeedFree(items, items[0]!.id, 0.5)).toBeNull();
  });

  it('速度限制在 0.25–4 倍；照片不能變速', () => {
    const items = [createClip(asset('a', 4))];
    const sp = (v: number) => setSpeedFree(items, items[0]!.id, v)![0] as VideoItem;
    expect(sp(10).speed).toBe(4);
    expect(sp(0.01).speed).toBe(0.25);
    expect(sp(0.25).duration).toBe(16);
    const photo = [{ ...createClip(asset('p', 0)), type: 'image' as const }];
    expect(setSpeedFree(photo, photo[0]!.id, 2)).toBe(photo);
  });

  it('分割：兩段加起來等於原長，後段 trimIn 與 start 正確；太靠邊界不分割；後面的片段不動', () => {
    const items = three();
    const out = splitFree(items, items[0]!.id, 1.5)! as VideoItem[];
    expect(out).toHaveLength(4);
    expect(out[0]!.duration).toBeCloseTo(1.5);
    expect(out[1]!.duration).toBeCloseTo(2.5);
    expect(out[1]!.trimIn).toBeCloseTo(1.5);
    expect(out[1]!.start).toBeCloseTo(1.5);
    expect(out[2]!.start).toBeCloseTo(4);
    expect(splitFree(items, items[0]!.id, 0.1)).toBeNull();
    expect(splitFree(items, items[0]!.id, 3.9)).toBeNull();
  });

  it('分割變速片段：後段 trimIn 以素材秒數計', () => {
    const items = three();
    const fast = setSpeedFree(items, items[0]!.id, 2)! as VideoItem[]; // duration 2
    const out = splitFree(fast, fast[0]!.id, 1)! as VideoItem[];
    expect(out[1]!.trimIn).toBeCloseTo(2); // 1 秒時間軸 × 2 倍速 = 素材 2 秒
    expect(out[1]!.duration).toBeCloseTo(1);
  });

  it('複製：放在原片段後面最近的空位；刪除只刪這一個、留空位；刪除並補齊讓後面往前移', () => {
    const items = three();
    const dup = duplicateFree(items, items[1]!.id)!; // b（4–6）後面被 c 占住 → 找最近的空位
    expect(dup.items).toHaveLength(4);
    const copy = dup.items.find((x) => x.id === dup.newId)! as VideoItem;
    expect(copy.assetId).toBe('b');
    expect(copy.start).toBeGreaterThanOrEqual(9 - 1e-6); // 放不進中間，接在最後
    // 一般刪除：filter，其他不動
    const rm = items.filter((x) => x.id !== items[0]!.id);
    expect(rm.map((i) => i.start)).toEqual([4, 6]);
    // 刪除並補齊
    const rp = rippleDelete(items, items[0]!.id);
    expect(rp.map((i) => i.start)).toEqual([0, 2]);
    // 補齊只動「後面」的，前面的不動
    const rp2 = rippleDelete(items, items[1]!.id);
    expect(rp2.map((i) => i.start)).toEqual([0, 4]);
    expect(rippleDelete(items, 'nope')).toBe(items);
  });

  it('修剪：尾端不超過素材長度、頭端不超過素材起點；左把手往右拉＝尾巴不動、起點往後（原本的「空白」現在就是片段前面的空位）', () => {
    const a = asset('a', 4);
    const items = three();
    expect(trimEndFree(items, items[0]!.id, 1, a)[0]!.duration).toBe(1);
    expect(trimEndFree(items, items[0]!.id, 99, a)[0]!.duration).toBe(4); // 被後面的 b 擋住、素材也只有 4 秒
    expect(trimEndFree(items, items[0]!.id, 0, a)[0]!.duration).toBeCloseTo(0.2);
    const t1 = trimStartFree(items, items[0]!.id, 1) as VideoItem[];
    expect(t1[0]!.trimIn).toBe(1);
    expect(t1[0]!.duration).toBe(3);
    expect(t1[0]!.start).toBe(1); // 前面空出 1 秒
    expect(t1[1]!.start).toBe(4); // 後面的片段位置不變
    expect((trimStartFree(t1, t1[0]!.id, -5)[0] as VideoItem).trimIn).toBe(0); // 最多還原到素材起點
    expect(trimStartFree(items, items[0]!.id, 99)[0]!.duration).toBeCloseTo(0.2);
  });
});

describe('軌道分區：影像 → 特效 → 字卡 → 音訊', () => {
  const mk = () => {
    const p = createProject('x');
    const t = (kind: Track['kind']) => createTrack(kind, p.tracks);
    return { p, t };
  };

  it('normalizeZones：依分區排好，同一區維持原本的相對順序', () => {
    const { p, t } = mk();
    const text1 = t('text');
    const audio = t('audio');
    const media2 = t('media');
    const effect = t('sticker');
    const mixed = [p.tracks[0]!, text1, audio, media2, effect];
    expect(normalizeZones(mixed).map((x) => x.kind)).toEqual(['media', 'media', 'sticker', 'text', 'audio']);
    expect(normalizeZones(mixed)[0]).toBe(p.tracks[0]);
    expect(normalizeZones(mixed)[1]).toBe(media2);
  });

  it('insertIndexFor：新軌道放在同一區最上面；那一區還沒有就接在前面各區後面', () => {
    const { p, t } = mk();
    p.tracks.push(t('text'), t('audio'));
    expect(insertIndexFor(p.tracks, 'media')).toBe(1); // 影像區只有 [0]，新的放它上面（字卡前面）
    expect(insertIndexFor(p.tracks, 'text')).toBe(2);
    expect(insertIndexFor(p.tracks, 'sticker')).toBe(1); // 特效區還沒有：接在影像區後面
    expect(insertIndexFor(p.tracks, 'audio')).toBe(3);
    expect(zoneRange(p.tracks, 'media')).toEqual([0, 0]);
    expect(zoneRange(p.tracks, 'sticker')).toBeNull();
  });

  it('baseMediaTrack／mediaItems：最下面那條影像軌、所有影像物件依時間排好', () => {
    const { p, t } = mk();
    const m2 = t('media');
    p.tracks.push(m2);
    p.tracks[0]!.items = [{ ...createClip(asset('a', 2)), start: 5 }];
    m2.items = [{ ...createClip(asset('b', 2)), start: 1 }];
    expect(baseMediaTrack(p)).toBe(p.tracks[0]);
    expect(mediaItems(p).map((i) => i.assetId)).toEqual(['b', 'a']);
  });

  it('圖層：每一軌只在 [start, end) 顯示；專案最後一格仍顯示最後結束的物件；空白時間是黑畫面', () => {
    const { p } = mk();
    p.tracks[0]!.items = [
      { ...createClip(asset('a', 2)), start: 1 },
      { ...createClip(asset('b', 2)), start: 3 },
    ];
    expect(totalDuration(p)).toBe(5);
    expect(visibleLayers(p, 0.5)).toHaveLength(0); // 開場留白：黑畫面
    expect(visibleLayers(p, 1)).toHaveLength(1);
    expect((visibleLayers(p, 2.5)[0]!.item as VideoItem).assetId).toBe('b'.replace('b', 'a')); // 2.5 在 a（1–3）
    expect((visibleLayers(p, 3)[0]!.item as VideoItem).assetId).toBe('b');
    expect((visibleLayers(p, 5)[0]!.item as VideoItem).assetId).toBe('b'); // 最後一格
    expect((visibleLayers(p, 100)[0]!.item as VideoItem).assetId).toBe('b');
    expect(layersAt(p, 0.5, true)).toHaveLength(0);
  });
});
