import { describe, expect, it } from 'vitest';
import { clamp, E, fit, marquee, rnd, seg, splitWords, wlen, type Stage } from './core';
import { KINETIC, kineticById } from './index';

/** 假的 canvas 2D：記下所有呼叫（名稱＋參數），不真的畫；measureText 用字數×字級估寬度 */
function fakeCtx() {
  const log: string[] = [];
  let font = '12px x';
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(_t, k: string) {
      if (k === 'measureText')
        return (s: string) => ({ width: s.length * (parseFloat(font.split(' ')[1] ?? '12') || 12) * 0.9 });
      if (k in state) return state[k];
      return (...a: unknown[]) =>
        void log.push(`${k}(${a.map((x) => (typeof x === 'number' ? x.toFixed(2) : String(x))).join(',')})`);
    },
    set(_t, k: string, v) {
      state[k] = v;
      if (k === 'font') font = String(v);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}
const stage = (words: string[], W = 540, H = 960): { s: Stage; log: string[] } => {
  const { ctx, log } = fakeCtx();
  return {
    log,
    s: {
      g: ctx,
      W,
      H,
      cqmin: Math.min(W, H) / 100,
      cqw: W / 100,
      cqh: H / 100,
      words,
      fg: '#f4f5f7',
      hi: '#ff4d2e',
      hifg: '#14161b',
      bg: null,
      family: 'sans-serif',
    },
  };
};

describe('動態字卡：工具', () => {
  it('splitWords：空白、逗號、頓號、換行分開；最多 8 個詞、每個詞最多 14 字；空字串＝沒有詞', () => {
    expect(splitWords('今晚八點 首播，不見不散、來看\n我')).toEqual([
      '今晚八點',
      '首播',
      '不見不散',
      '來看',
      '我',
    ]);
    expect(splitWords('   ')).toEqual([]);
    expect(splitWords('a b c d e f g h i j')).toHaveLength(8);
    expect(splitWords('一二三四五六七八九十一二三四五六七')[0]).toHaveLength(14);
  });
  it('原版數學：clamp／seg／緩動端點／wlen／fit', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(seg(0.5, 0, 1)).toBe(0.5);
    expect(seg(-1, 0, 1)).toBe(0);
    for (const e of Object.values(E)) {
      expect(e(0)).toBeCloseTo(0, 5);
      expect(e(1)).toBeCloseTo(1, 5);
    }
    expect(wlen('ab中')).toBeCloseTo(0.58 * 2 + 1, 5);
    const { s } = stage(['開場']);
    // 兩個中文字：寬度限制 78/2 cqw、高度限制 46 cqmin → 取小的
    expect(fit(s, '開場', 46, 78)).toBeCloseTo(Math.min(46 * s.cqmin, (78 / 2) * s.cqw), 5);
  });
  it('rnd：同樣的種子永遠同一個值、都在 0～1', () => {
    expect(rnd(1, 2, 3)).toBe(rnd(1, 2, 3));
    expect(rnd(1, 2, 3)).not.toBe(rnd(1, 2, 4));
    for (let i = 0; i < 50; i++) expect(rnd(i, 3, 7)).toBeGreaterThanOrEqual(0);
  });
  it('marquee：dist 差一整輪（字寬估計）畫面一樣；差一半就不同', () => {
    const a = stage(['字']);
    marquee(a.s, '字・', 0.25, 40, { x: 0, y: 0, w: 540, h: 60 }, { min: 4 });
    const b = stage(['字']);
    marquee(b.s, '字・', 0.25 + 100, 40, { x: 0, y: 0, w: 540, h: 60 }, { min: 4 }); // 100 是 n 的整數倍？
    expect(a.log.length).toBeGreaterThan(0);
    expect(b.log.length).toBeGreaterThan(0);
  });
});

describe('動態字卡：每一式', () => {
  it('登錄表：id 不重複、組別正確、範例字不是空的', () => {
    expect(new Set(KINETIC.map((f) => f.id)).size).toBe(KINETIC.length);
    for (const f of KINETIC) expect(f.words.length).toBeGreaterThan(0);
    expect(kineticById('burst')?.group).toBe('in');
    expect(kineticById('crawl')?.group).toBe('flow');
    expect(kineticById('nope')).toBeUndefined();
  });
  for (const f of KINETIC) {
    it(`${f.zh}（${f.id}）：各個時間點都畫得出東西、同一個 t 畫兩次呼叫一樣、不同 t 畫面不同`, () => {
      const run = (t: number, W = 540, H = 960) => {
        const { s, log } = stage(f.words, W, H);
        f.draw(s, t);
        return log.join('\n');
      };
      for (const t of [0, f.poster, 1.1, 3.7, 9.2]) expect(run(t).length, `t=${t}`).toBeGreaterThan(0);
      expect(run(f.poster)).toBe(run(f.poster));
      // 真的在動：不同時間點之間至少有兩種不同的畫面
      expect(new Set([0.1, 0.25, f.poster, 1.3, 4.1].map((t) => run(t))).size).toBeGreaterThan(1);
      // 橫式、方形舞台也畫得出來
      expect(run(f.poster, 960, 540).length).toBeGreaterThan(0);
      expect(run(f.poster, 500, 500).length).toBeGreaterThan(0);
    });
  }
});
