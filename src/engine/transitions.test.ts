import { describe, expect, it } from 'vitest';
import type { Item, VideoItem } from '../model/types';
import {
  activeTransition,
  applyLook,
  clipPx,
  effectDurations,
  effectFrame,
  itemEffectAt,
  seamAudioExtent,
  seamsOf,
  transitionAudioGain,
  transitionCode,
  LEGACY_TRANSITIONS,
  TRANSITIONS,
  transitionFrame,
  transitionProgress,
  transitionSpan,
} from './transitions';
import { sourceTimeClamped, splitFree } from './timeline';

const clip = (id: string, start: number, duration: number, extra: Partial<VideoItem> = {}): VideoItem =>
  ({
    id,
    type: 'video',
    assetId: 'a',
    start,
    duration,
    trimIn: 0,
    speed: 1,
    volume: 1,
    fit: 'cover',
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
    ...extra,
  }) as VideoItem;

describe('transitionSpan', () => {
  it('前面緊接著另一個片段才有轉場；中間有空隙就沒有', () => {
    const a = clip('a', 0, 3);
    const b = clip('b', 3, 3, { transitionIn: { kind: 'dissolve', duration: 0.5 } });
    expect(transitionSpan([a, b], b)?.cut).toBe(3);
    const gap = clip('b', 3.5, 3, { transitionIn: { kind: 'dissolve', duration: 0.5 } });
    expect(transitionSpan([a, gap], gap)).toBeNull();
    expect(transitionSpan([a, clip('c', 3, 3)], clip('c', 3, 3))).toBeNull(); // 沒設轉場
  });
  it('長度不會超過兩個片段各自長度的兩倍（各用一半）', () => {
    const a = clip('a', 0, 0.2);
    const b = clip('b', 0.2, 5, { transitionIn: { kind: 'whiteflash', duration: 1.2 } });
    expect(transitionSpan([a, b], b)!.d).toBeCloseTo(0.4, 6);
  });
});

describe('transitionProgress', () => {
  it('以接縫為中心：前半 A、後半 B', () => {
    const a = clip('a', 0, 3);
    const b = clip('b', 3, 3, { transitionIn: { kind: 'dissolve', duration: 1 } });
    const sp = transitionSpan([a, b], b)!;
    expect(transitionProgress(sp, 2.4)).toBeNull();
    expect(transitionProgress(sp, 2.5)).toBeCloseTo(0, 6);
    expect(transitionProgress(sp, 3)).toBeCloseTo(0.5, 6);
    expect(transitionProgress(sp, 3.5)).toBeNull();
  });
});

describe('目錄與舊名稱', () => {
  it('每一種都有分類與代號；舊名稱都能對應到新的', () => {
    expect(TRANSITIONS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(TRANSITIONS.map((t) => t.id)).size).toBe(TRANSITIONS.length);
    for (const t of TRANSITIONS) {
      expect(t.code).toHaveLength(1);
      expect(t.name.length).toBeGreaterThan(1);
    }
    for (const k of Object.values(LEGACY_TRANSITIONS)) expect(TRANSITIONS.some((t) => t.id === k)).toBe(true);
  });
});

describe('transitionFrame：每一種在開頭只看得到 A、結尾只看得到 B', () => {
  const visibleArea = (f: ReturnType<typeof transitionFrame>['a']): number => {
    if (f.opacity <= 0.001) return 0;
    if (f.clip?.kind === 'rects') return f.clip.rects.reduce((s, r) => s + r[2] * r[3], 0);
    if (f.clip?.kind === 'circle') return Math.min(Math.PI * f.clip.r ** 2, 1);
    return 1;
  };
  it.each(TRANSITIONS.map((t) => t.id))('%s', (kind) => {
    const f0 = transitionFrame(kind, 0);
    const f1 = transitionFrame(kind, 1);
    // 開頭：A 在原位完整，B 看不到（透明、裁掉、或在畫面外）
    expect(visibleArea(f0.a)).toBeGreaterThan(0.99);
    expect(Math.abs(f0.a.dx) + Math.abs(f0.a.dy)).toBeLessThan(1e-6);
    // （A 在上面而且完整蓋住時，B 在下面也看不到）
    const bGone0 =
      !f0.bOnTop || visibleArea(f0.b) < 0.01 || Math.abs(f0.b.dx) >= 0.69 || Math.abs(f0.b.dy) >= 0.69;
    expect(bGone0).toBe(true);
    // 結尾：B 在原位完整，A 看不到
    expect(visibleArea(f1.b)).toBeGreaterThan(0.99);
    expect(Math.abs(f1.b.dx) + Math.abs(f1.b.dy)).toBeLessThan(1e-6);
    expect(f1.b.scale).toBeCloseTo(1, 6);
    // （B 在上面而且完整蓋住時，A 在下面也看不到）
    const aGone1 =
      f1.bOnTop || visibleArea(f1.a) < 0.01 || Math.abs(f1.a.dx) >= 0.69 || Math.abs(f1.a.dy) >= 0.69;
    expect(aGone1).toBe(true);
    // 顏色層在兩端都是透明的（轉場結束後不會留下顏色）
    for (const c of [...f0.covers, ...f1.covers]) expect(c.alpha).toBeLessThan(0.02);
  });
  it('疊化：B 的透明度跟著進度；捲簾放下：B 從上往下露出來；左移：A 往左、B 從右進來', () => {
    expect(transitionFrame('dissolve', 0.5).b.opacity).toBeCloseTo(0.5, 6);
    const roll = transitionFrame('rollDown', 0.5).b.clip!;
    expect(roll.kind === 'rects' && roll.rects[0]![3]).toBeCloseTo(0.5, 1);
    const l = transitionFrame('moveL', 0.5);
    expect(l.a.dx).toBeLessThan(0);
    expect(l.b.dx).toBeGreaterThan(0);
    expect(l.a.dx - l.b.dx).toBeCloseTo(-1, 6); // 兩段始終緊貼著
  });
  it('四宮格：露出來的格子數隨進度增加', () => {
    const n = (p: number) => {
      const c = transitionFrame('grid4', p).b.clip!;
      return c.kind === 'rects' ? c.rects.length : -1;
    };
    expect(n(0)).toBe(0);
    expect(n(0.5)).toBeGreaterThan(0);
    expect(n(0.5)).toBeLessThan(4);
    expect(n(1)).toBe(4);
  });
  it('故障：同一個進度永遠算出同樣的結果（預覽與匯出一致）', () => {
    expect(transitionFrame('glitch2', 0.42)).toEqual(transitionFrame('glitch2', 0.42));
  });
});

describe('applyLook／clipPx', () => {
  it('applyLook：以畫面中心放大、位移用畫面寬高的比例', () => {
    const box = { cx: 100, cy: 200, w: 50, h: 80, rotation: 0 };
    const out = applyLook(box, { dx: 0.1, dy: -0.5, scale: 2, opacity: 1 }, 1000, 2000);
    expect(out.cx).toBeCloseTo(500 + (100 - 500) * 2 + 100, 6);
    expect(out.cy).toBeCloseTo(1000 + (200 - 1000) * 2 - 1000, 6);
    expect(out.w).toBe(100);
  });
  it('clipPx：比例換成畫面像素', () => {
    expect(clipPx({ kind: 'rects', rects: [[0, 0.5, 1, 0.25]] }, 100, 200).rects).toEqual([
      [0, 100, 100, 50],
    ]);
    expect(clipPx({ kind: 'circle', cx: 0.5, cy: 0, r: 0.5 }, 100, 200).circle).toEqual({
      cx: 50,
      cy: 0,
      r: 100,
    });
  });
});

const v = (x: Item | null) => x as VideoItem;
describe('activeTransition：兩段真的重疊', () => {
  const A = clip('A', 0, 3, { trimIn: 1 });
  const B = clip('B', 3, 3, { trimIn: 2, transitionIn: { kind: 'dissolve', duration: 1 } });
  const items = [A, B] as Item[];
  it('接縫前：A 是原本的，B 提前出現（入點往前退、靜音）', () => {
    const at = activeTransition(items, 2.7)!;
    expect(v(at.a).id).toBe('A');
    expect(v(at.a).volume).toBe(1);
    expect(v(at.b).id).toBe('B');
    expect(v(at.b).start).toBeCloseTo(2.5, 6);
    expect(v(at.b).trimIn).toBeCloseTo(1.5, 6); // 2 − 0.5
    expect(v(at.b).volume).toBe(0);
    // 提前的 B 在同一個時間點對到的素材秒數，跟 B 自己播到那裡一樣
    expect(v(at.b).trimIn + (2.7 - v(at.b).start)).toBeCloseTo(B.trimIn + (2.7 - B.start), 6);
  });
  it('接縫後：B 是原本的，A 延長到接縫後的一半（靜音）', () => {
    const at = activeTransition(items, 3.2)!;
    expect(v(at.b).id).toBe('B');
    expect(v(at.b).volume).toBe(1);
    expect(v(at.a).id).toBe('A');
    expect(v(at.a).duration).toBeCloseTo(3.5, 6);
    expect(v(at.a).volume).toBe(0);
  });
  it('B 的入點是 0（前面沒有素材）：轉場一開始 B 就在（入點是負的，素材時間夾在第一格），不會到接縫才突然跳出來', () => {
    const B0 = clip('B', 3, 3, { trimIn: 0.2, transitionIn: { kind: 'dissolve', duration: 1 } });
    const early = v(activeTransition([A, B0] as Item[], 2.6)!.b); // 轉場從 2.5 秒開始
    expect(early.start).toBeCloseTo(2.5, 6);
    expect(early.trimIn).toBeCloseTo(-0.3, 6);
    expect(sourceTimeClamped(early, 2.6)).toBe(0); // 還沒到素材開頭：停在第一格
    expect(sourceTimeClamped(early, 3)).toBeCloseTo(0.2, 6); // 到接縫：對到 B 自己的入點
    // 同一個時間點對到的素材秒數，跟 B 自己播到那裡一樣
    expect(sourceTimeClamped(v(activeTransition([A, B0] as Item[], 3.2)!.b), 3.2)).toBeCloseTo(0.4, 6);
  });
  it('不在轉場期間回傳 null', () => {
    expect(activeTransition(items, 1)).toBeNull();
    expect(activeTransition(items, 4)).toBeNull();
  });
});

describe('分割', () => {
  it('轉場在片段開頭：分割後只有前半留著', () => {
    const b = clip('b', 3, 4, { transitionIn: { kind: 'flash', duration: 0.5 } });
    const out = splitFree([b] as Item[], 'b', 5)!;
    expect((out[0] as VideoItem).transitionIn).toBeDefined();
    expect((out[1] as VideoItem).transitionIn).toBeUndefined();
  });
});

const textItem = (id: string, start: number, duration: number, extra: Record<string, unknown> = {}): Item =>
  ({ id, type: 'text', start, duration, card: {}, transform: {}, ...extra }) as unknown as Item;

describe('轉場前後分配（before／after）', () => {
  const a = clip('a', 0, 3);
  it('舊資料只有 duration：各一半', () => {
    const b = clip('b', 3, 3, { transitionIn: { kind: 'dissolve', duration: 1 } });
    const sp = transitionSpan([a, b], b)!;
    expect(sp.before).toBeCloseTo(0.5, 6);
    expect(sp.after).toBeCloseTo(0.5, 6);
  });
  it('分別設定：接縫前後的長度對，總長是相加，進度 0 在接縫前 before 秒', () => {
    const b = clip('b', 3, 3, { transitionIn: { kind: 'dissolve', duration: 1.5, before: 1.2, after: 0.3 } });
    const sp = transitionSpan([a, b], b)!;
    expect(sp.d).toBeCloseTo(1.5, 6);
    expect(transitionProgress(sp, 1.8)).toBeCloseTo(0, 6);
    expect(transitionProgress(sp, 3)).toBeCloseTo(0.8, 6);
    expect(transitionProgress(sp, 3.31)).toBeNull();
    // 接縫後 A 延長 after 秒、接縫前 B 提前 before 秒
    expect(activeTransition([a, b] as Item[], 3.1)!.a!.duration).toBeCloseTo(3.3, 6);
    const b2 = { ...b, trimIn: 2 } as VideoItem;
    expect((activeTransition([a, b2] as Item[], 2.5)!.b as VideoItem).start).toBeCloseTo(1.8, 6);
  });
  it('各自不超過兩個片段的長度', () => {
    const short = clip('s', 3, 0.4, { transitionIn: { kind: 'dissolve', duration: 3, before: 2, after: 1 } });
    const sp = transitionSpan([a, short], short)!;
    expect(sp.before).toBeCloseTo(2, 6);
    expect(sp.after).toBeCloseTo(0.4, 6);
  });
});

describe('轉場只在同一類之間', () => {
  it('影片接照片可以；字卡只接字卡，不接影像', () => {
    const v1 = clip('v1', 0, 2);
    const photo = clip('p', 2, 2, { type: 'image' });
    const t1 = textItem('t1', 0, 2);
    const t2 = textItem('t2', 2, 2);
    expect(seamsOf([v1, photo] as Item[])).toHaveLength(1);
    expect(seamsOf([t1, t2])).toHaveLength(1);
    expect(seamsOf([v1, t2] as Item[])).toHaveLength(0);
  });
  it('字卡之間的轉場：A 延長、B 提前（沒有素材入點的問題）', () => {
    const t1 = textItem('t1', 0, 2);
    const t2 = textItem('t2', 2, 2, { transitionIn: { kind: 'dissolve', duration: 1 } });
    expect(activeTransition([t1, t2], 2.2)!.a!.duration).toBeCloseTo(2.5, 6);
    expect(activeTransition([t1, t2], 1.7)!.b!.start).toBeCloseTo(1.5, 6);
  });
});

describe('單一素材的進場／出場特效', () => {
  const x = clip('x', 5, 10, {
    inEffect: { kind: 'rollDown', duration: 3 },
    outEffect: { kind: 'moveL', duration: 2 },
  });
  it('進場佔開頭、出場佔結尾，中間沒有特效', () => {
    expect(itemEffectAt(x, 0)).toMatchObject({ role: 'in', p: 0 });
    expect(itemEffectAt(x, 1.5)!.p).toBeCloseTo(0.5, 6);
    expect(itemEffectAt(x, 3)).toBeNull();
    expect(itemEffectAt(x, 7.9)).toBeNull();
    expect(itemEffectAt(x, 8)).toMatchObject({ role: 'out', p: 0 });
    expect(itemEffectAt(x, 9)!.p).toBeCloseTo(0.5, 6);
  });
  it('進場開頭看不到（捲簾放下 p=0 沒有任何範圍）、結束完整；出場反過來', () => {
    const f0 = effectFrame(itemEffectAt(x, 0)!);
    expect(f0.look.clip).toMatchObject({ kind: 'rects', rects: [[0, 0, 1, 0]] });
    const f1 = effectFrame({ role: 'in', kind: 'rollDown', p: 1, duration: 3 });
    expect(f1.look.clip).toMatchObject({ kind: 'rects', rects: [[0, 0, 1, 1]] });
    // 出場：捲簾放下的 A 不會自己離開 → 把進場倒著放：開始（p=0）完整、結束（p=1）剩 0
    const o0 = effectFrame({ role: 'out', kind: 'rollDown', p: 0, duration: 2 });
    expect(o0.look.clip).toMatchObject({ rects: [[0, 0, 1, 1]] });
    const o1 = effectFrame({ role: 'out', kind: 'rollDown', p: 1, duration: 2 });
    expect(o1.look.clip).toMatchObject({ rects: [[0, 0, 1, 0]] });
  });
  it('出場：A 會自己離開的用 A 的動作（左移 → 往左移出去）', () => {
    const o = effectFrame({ role: 'out', kind: 'moveL', p: 1, duration: 2 });
    expect(Math.abs(o.look.dx)).toBeGreaterThanOrEqual(0.9);
    expect(effectFrame({ role: 'out', kind: 'moveL', p: 0, duration: 2 }).look.dx).toBeCloseTo(0, 6);
  });
  it('每一種特效：進場 p=0 看不到（或被蓋住）、p=1 完整；出場 p=0 完整、p=1 走掉', () => {
    for (const t of TRANSITIONS) {
      const i0 = effectFrame({ role: 'in', kind: t.id, p: 0, duration: 1 });
      const i1 = effectFrame({ role: 'in', kind: t.id, p: 1, duration: 1 });
      const o0 = effectFrame({ role: 'out', kind: t.id, p: 0, duration: 1 });
      const o1 = effectFrame({ role: 'out', kind: t.id, p: 1, duration: 1 });
      const full = (l: { opacity: number; clip?: unknown; dx: number; dy: number; scale: number }) =>
        l.opacity > 0.95 && Math.abs(l.dx) < 0.01 && Math.abs(l.dy) < 0.01 && Math.abs(l.scale - 1) < 0.01;
      expect(full(i1.look), `${t.id} 進場結束`).toBe(true);
      expect(full(o0.look), `${t.id} 出場開始`).toBe(true);
      // 開頭／結尾：看不到，或是被顏色層蓋住（閃白、閃黑、過曝…硬切）
      const hidden = (f: typeof i0) =>
        f.look.opacity < 0.05 ||
        f.look.scale < 0.05 ||
        Math.abs(f.look.dx) >= 0.65 ||
        Math.abs(f.look.dy) >= 0.65 ||
        (f.look.clip?.kind === 'rects' && f.look.clip.rects.every(([, , w, h]) => w * h < 1e-6)) ||
        (f.look.clip?.kind === 'circle' && f.look.clip.r < 0.001) ||
        f.covers.some((c) => !c.rect && c.alpha > 0.95);
      expect(hidden(i0) || t.cat === '故障' || t.id === 'grid4' || t.id === 'grid9', `${t.id} 進場開頭`).toBe(
        true,
      );
      expect(hidden(o1) || t.cat === '故障' || t.id === 'grid4' || t.id === 'grid9', `${t.id} 出場結尾`).toBe(
        true,
      );
    }
  });
  it('出場跟著尾巴：改長度後出場從新的結尾往前算；進出場加起來太長時出場縮短', () => {
    const shorter = { ...x, duration: 6 } as VideoItem;
    expect(itemEffectAt(shorter, 3.9)).toBeNull();
    expect(itemEffectAt(shorter, 4)).toMatchObject({ role: 'out' });
    const tight = { ...x, duration: 4 } as VideoItem; // 進場 3 → 出場只剩 1
    expect(effectDurations(tight)).toEqual({ in: 3, out: 1 });
  });
  it('音樂沒有特效；打字不改畫面；代表字是類型字', () => {
    expect(itemEffectAt({ ...x, type: 'audio' } as VideoItem, 0)).toBeNull();
    expect(effectFrame({ role: 'in', kind: 'typewriter', p: 0.5, duration: 1 }).look.opacity).toBe(1);
    expect(transitionCode('moveL')).toBe('左');
    expect(transitionCode('slideL')).toBe('左');
    expect(transitionCode('whiteflash')).toBe('閃');
    expect(transitionCode('dissolve')).toBe('溶');
    expect(transitionCode('typewriter')).toBe('打');
  });
  it('分割：進場特效留在前半、出場特效留在後半', () => {
    const out = splitFree([x] as Item[], 'x', 10)!;
    expect(out[0]!.inEffect).toBeDefined();
    expect(out[0]!.outEffect).toBeUndefined();
    expect(out[1]!.inEffect).toBeUndefined();
    expect(out[1]!.outEffect).toBeDefined();
  });
});

describe('轉場時的聲音（seamGains／transitionAudioGain／seamAudioExtent）', () => {
  const A = clip('a', 0, 3);
  const mk = (extra: Partial<NonNullable<VideoItem['transitionIn']>> = {}) =>
    clip('b', 3, 3, { transitionIn: { kind: 'dissolve', duration: 1, ...extra } });
  const gains = (b: VideoItem, t: number) => ({
    a: transitionAudioGain([A, b], A, t),
    b: transitionAudioGain([A, b], b, t),
  });

  it('交叉淡化（預設）：轉場前 (1,0)、中間兩段都約 0.707、轉場後 (0,1)', () => {
    const b = mk(); // 接縫 3、前後各 0.5 → 轉場 2.5～3.5
    expect(gains(b, 2.4)).toEqual({ a: 1, b: 0 });
    expect(gains(b, 3).a).toBeCloseTo(Math.SQRT1_2, 6);
    expect(gains(b, 3).b).toBeCloseTo(Math.SQRT1_2, 6);
    expect(gains(b, 3.6)).toMatchObject({ b: 1 });
    expect(gains(b, 3.6).a).toBeCloseTo(0, 6);
  });
  it('直接切換：切換點之前只有前段、之後只有後段（不淡化）；切換點相對接縫', () => {
    const b = mk({ audio: 'cut', audioCut: -0.2 });
    expect(gains(b, 2.7)).toEqual({ a: 1, b: 0 });
    expect(gains(b, 2.9)).toEqual({ a: 0, b: 1 });
    expect(gains(mk({ audio: 'cut' }), 2.99)).toEqual({ a: 1, b: 0 }); // 沒寫＝接縫
    expect(gains(mk({ audio: 'cut' }), 3.01)).toEqual({ a: 0, b: 1 });
  });
  it('自訂起迄：前段迄、後段起各自決定，中間可以沒聲音、也可以重疊；後段起可以晚於轉場結束', () => {
    const gap = mk({ audio: 'custom', audioOutA: -0.2, audioInB: 0.8 }); // 轉場在 3.5 結束，後段 3.8 才有聲音
    expect(gains(gap, 2.7)).toEqual({ a: 1, b: 0 });
    expect(gains(gap, 3.0)).toEqual({ a: 0, b: 0 }); // 中間沒聲音
    expect(gains(gap, 3.6)).toEqual({ a: 0, b: 0 }); // 轉場已結束，後段還沒開始
    expect(gains(gap, 3.9)).toEqual({ a: 0, b: 1 });
    const overlap = mk({ audio: 'custom', audioOutA: 0.3, audioInB: -0.3 });
    expect(gains(overlap, 3)).toEqual({ a: 1, b: 1 });
  });
  it('只要前段／只要後段／靜音', () => {
    expect(gains(mk({ audio: 'prev' }), 3.2)).toEqual({ a: 1, b: 0 });
    expect(gains(mk({ audio: 'prev' }), 3.6)).toEqual({ a: 0, b: 1 });
    expect(gains(mk({ audio: 'next' }), 2.6)).toEqual({ a: 0, b: 1 });
    expect(gains(mk({ audio: 'next' }), 2.4)).toEqual({ a: 1, b: 0 });
    expect(gains(mk({ audio: 'mute' }), 3.2)).toEqual({ a: 0, b: 0 });
    expect(gains(mk({ audio: 'mute' }), 2.4)).toEqual({ a: 1, b: 0 });
    expect(gains(mk({ audio: 'mute' }), 3.6)).toEqual({ a: 0, b: 1 });
  });
  it('沒有轉場的片段、音樂：倍數永遠是 1', () => {
    const c = clip('c', 3, 3);
    expect(transitionAudioGain([A, c], c, 3)).toBe(1);
    const music = { ...clip('m', 0, 5), type: 'audio' } as Item;
    expect(transitionAudioGain([A, mk(), music], music, 3)).toBe(1);
  });
  it('seamAudioExtent：後段要提早放（before）、前段要多放（after）；custom 後段起晚於轉場結束時視窗延長', () => {
    const b = mk({ audio: 'custom', audioInB: 0.9 });
    expect(seamAudioExtent([A, b], b)).toEqual({ before: 0.5, after: 0, windows: [[2.5, 3.9]] });
    expect(seamAudioExtent([A, b], A)).toEqual({ before: 0, after: 0.5, windows: [[2.5, 3.5]] });
    const solo = clip('s', 0, 3);
    expect(seamAudioExtent([solo], solo)).toEqual({ before: 0, after: 0, windows: [] });
  });
});
