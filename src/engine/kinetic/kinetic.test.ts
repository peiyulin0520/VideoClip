import { describe, expect, it } from 'vitest';
import { clamp, E, fit, marquee, rnd, seg, splitWords, wlen, type Stage } from './core';
import { beforeAll } from 'vitest';
import { KINETIC, kineticById, schemeOf } from './index';

// jsdom 沒有真的 canvas：暫存畫布（scratch／圖案）也用假的 2D（只記呼叫）
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => fakeCtx().ctx) as never;
});

/** 假的 canvas 2D：記下所有呼叫（名稱＋參數），不真的畫；measureText 用字數×字級估寬度 */
function fakeCtx(log: string[] = []) {
  let font = '12px x';
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(_t, k: string) {
      if (k === 'measureText')
        return (s: string) => ({ width: s.length * (parseFloat(font.split(' ')[1] ?? '12') || 12) * 0.9 });
      if (k in state) return state[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient')
        return (...a: unknown[]) => {
          log.push(`${k}(${a.join(',')})`);
          return { addColorStop: () => {} };
        };
      return (...a: unknown[]) =>
        void log.push(`${k}(${a.map((x) => (typeof x === 'number' ? x.toFixed(2) : String(x))).join(',')})`);
    },
    set(_t, k: string, v) {
      state[k] = v;
      log.push(`set ${k}=${typeof v === 'number' ? v.toFixed(3) : String(v)}`);
      if (k === 'font') font = String(v);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}
const stage = (words: string[], W = 540, H = 960): { s: Stage; log: string[] } => {
  const { ctx, log } = fakeCtx();
  // 暫存畫布（scratch、圖案）的呼叫也記到同一份紀錄
  HTMLCanvasElement.prototype.getContext = (() => fakeCtx(log).ctx) as never;
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
      paper: '#14161b',
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
      // 代表秒數一定畫得出東西；其他時間（例如剛開始、兩輪之間的空檔）可以是空的，但不能出錯
      expect(run(f.poster).length, `poster=${f.poster}`).toBeGreaterThan(0);
      for (const t of [0, 1.1, 3.7, 9.2]) expect(() => run(t), `t=${t}`).not.toThrow();
      expect(run(f.poster)).toBe(run(f.poster));
      // 真的在動：不同時間點之間至少有兩種不同的畫面
      expect(new Set([0.1, 0.25, f.poster, 1.3, 4.1].map((t) => run(t))).size).toBeGreaterThan(1);
      // 橫式、方形舞台也畫得出來
      expect(run(f.poster, 960, 540).length).toBeGreaterThan(0);
      expect(run(f.poster, 500, 500).length).toBeGreaterThan(0);
    });
  }
});

describe('動態字卡：顯示範圍（框）', () => {
  it('areaSize：wide＝16:9（直式滿寬、橫式縮到放得下）、full＝整個畫面、lyrics＝寬 84%×高 34%', async () => {
    const { areaSize, areaCenter } = await import('./hit');
    expect(areaSize('wide', 1080, 1920)).toEqual({ w: 1080, h: 608 });
    expect(areaSize('wide', 1920, 1080)).toEqual({ w: 1920, h: 1080 });
    expect(areaSize('wide', 1000, 1000)).toEqual({ w: 1000, h: 563 });
    expect(areaSize('full', 1080, 1920)).toEqual({ w: 1080, h: 1920 });
    expect(areaSize('lyrics', 1000, 2000)).toEqual({ w: 840, h: 680 });
    expect(areaCenter('lyrics').y).toBeGreaterThan(0.5);
    expect(areaCenter('wide')).toEqual({ x: 0.5, y: 0.5 });
  });
  it('kineticFrame：有自己的大小就用它，沒有用那一式的預設框；框是整個畫面時選取範圍只算中間一條', async () => {
    const { kineticFrame, kineticContent } = await import('./hit');
    const item = (kinetic: object) => ({ kinetic }) as never;
    expect(kineticFrame(item({ id: 'burst' }), 1080, 1920)).toEqual({ w: 1080, h: 608 });
    expect(kineticFrame(item({ id: 'crawl' }), 1080, 1920)).toEqual({ w: 1080, h: 1920 });
    expect(kineticFrame(item({ id: 'burst', size: { w: 0.5, h: 0.25 } }), 1080, 1920)).toEqual({
      w: 540,
      h: 480,
    });
    // 小框＝整個框都能點；整個畫面的框＝中間一條
    expect(kineticContent(item({ id: 'burst' }), 1080, 1920)).toEqual({ x: 0, y: 0, w: 1080, h: 608 });
    const full = kineticContent(item({ id: 'crawl' }), 1080, 1920);
    expect(full.h).toBeLessThan(1920 * 0.7);
    expect(full.y).toBeGreaterThan(0);
  });
  it('resolveBg：色碼原樣、沒有＝透明、K0 的配色名稱換成色碼', async () => {
    const { resolveBg } = await import('./index');
    expect(resolveBg(undefined)).toBeNull();
    expect(resolveBg('#123456')).toBe('#123456');
    expect(resolveBg('ink')).toBe('#14161b');
  });
  it('dragArea：拖下邊只動下邊（對邊不動）；拖框裡面＝移動；有最小大小；旋轉過也對', async () => {
    const { dragArea } = await import('../../app/editor/KineticAreaEdit');
    const d = { id: 'a', x: 0.5, y: 0.5, w: 1, h: 0.4 };
    const W = 1000;
    const H = 2000;
    // 下邊往下 200px：高 0.4→0.5，中心往下 100px（0.05）
    const b = dragArea(d, 'b', 0, 200, W, H, 1, 0);
    expect(b.h).toBeCloseTo(0.5, 5);
    expect(b.y).toBeCloseTo(0.55, 5);
    expect(b.w).toBe(1);
    // 左邊往右 400px：寬 1→0.6，中心往右 200px（0.2）
    const l = dragArea(d, 'l', 400, 0, W, H, 1, 0);
    expect(l.w).toBeCloseTo(0.6, 5);
    expect(l.x).toBeCloseTo(0.7, 5);
    // 移動
    const m = dragArea(d, 'move', 100, -200, W, H, 1, 0);
    expect(m.x).toBeCloseTo(0.6, 5);
    expect(m.y).toBeCloseTo(0.4, 5);
    // 最小 10%
    const tiny = dragArea(d, 'b', 0, -5000, W, H, 1, 0);
    expect(tiny.h).toBeCloseTo(0.1, 5);
    // 旋轉 90°（順時針）：框自己的「下邊」朝畫面左邊；手指往左拉 200px＝下邊往外拉 200px
    const r = dragArea(d, 'b', -200, 0, W, H, 1, Math.PI / 2);
    expect(r.h).toBeCloseTo(0.5, 5);
    expect(r.x).toBeCloseTo(0.5 - 100 / W, 5);
  });
});

describe('動態字卡：換行與邊緣淡出', () => {
  // 假的量字：每個字 10px 寬
  const g = { measureText: (s: string) => ({ width: s.length * 10 }) } as unknown as CanvasRenderingContext2D;
  it('wrapLines：中文逐字斷、英文在空白斷、\\n 一律換行、超長英文字硬斷', async () => {
    const { wrapLines } = await import('./core');
    expect(wrapLines(g, '今晚八點首播不見不散', 50)).toEqual(['今晚八點首', '播不見不散']);
    expect(wrapLines(g, 'hello big world', 100)).toEqual(['hello big', 'world']);
    expect(wrapLines(g, '第一行\n第二行', 500)).toEqual(['第一行', '第二行']);
    expect(wrapLines(g, 'abcdefghijkl', 50)).toEqual(['abcde', 'fghij', 'kl']);
    expect(wrapLines(g, '', 50)).toEqual(['']);
    // 每一行都不超過 maxW
    for (const l of wrapLines(g, '中文 and english 混在一起 的長句子 should wrap nicely', 90))
      expect(l.length * 10).toBeLessThanOrEqual(90);
  });
  it('fadeEdges：none 什麼都不畫；v／h 各畫兩條漸層（destination-out）', async () => {
    const { fadeEdges } = await import('./core');
    const none = fakeCtx();
    fadeEdges(none.ctx, 100, 100, 'none');
    expect(none.log).toHaveLength(0);
    for (const f of ['v', 'h'] as const) {
      const { ctx, log } = fakeCtx();
      fadeEdges(ctx, 100, 200, f);
      expect(log.filter((l) => l.startsWith('fillRect'))).toHaveLength(2);
      expect(log.filter((l) => l.startsWith('createLinearGradient'))).toHaveLength(2);
    }
  });
});

describe('動態字卡：K4 的共用工具', () => {
  it('withAlpha：#rgb、#rrggbb 換成 rgba；不是十六進位原樣回傳', async () => {
    const { withAlpha } = await import('./core');
    expect(withAlpha('#ff4d2e', 0.45)).toBe('rgba(255,77,46,0.45)');
    expect(withAlpha('#fff', 0.13)).toBe('rgba(255,255,255,0.13)');
    expect(withAlpha('red', 0.5)).toBe('red');
  });
  it('sentenceAt：每句佔各自的秒數、繞一圈回到第一句', async () => {
    const { sentenceAt } = await import('./core');
    expect(sentenceAt([2, 3], 0.5)).toEqual({ i: 0, tt: 0.5 });
    expect(sentenceAt([2, 3], 2.5)).toEqual({ i: 1, tt: 0.5 });
    expect(sentenceAt([2, 3], 5.25)).toEqual({ i: 0, tt: 0.25 });
  });
  it('綜藝粗外框 vt：先描邊（總寬 .16em）再填色；陰影用完會還原', async () => {
    const { drawWord } = await import('./core');
    const { s, log } = stage(['字']);
    drawWord(s, '字', 100, 100, 50, { color: '#fff', vt: '#000' });
    const i = log.findIndex((l) => l.startsWith('strokeText'));
    const j = log.findIndex((l) => l.startsWith('fillText'));
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(log).toContain('set lineWidth=8.000');
    const sh = stage(['字']);
    drawWord(sh.s, '字', 100, 100, 50, { shadow: ['#fff', 12] });
    expect(sh.log).toContain('set shadowBlur=12.000');
    expect(sh.log.at(-1)).not.toBe('set shadowBlur=12.000');
  });
  it('schemeOf：有自己的預設強調色（滴血、重影的朱紅）就用它，沒有用配色原本的', () => {
    expect(schemeOf(kineticById('drip')!).hi).toBe('#ff4d2e');
    expect(schemeOf(kineticById('ghost')!).hi).toBe('#ff4d2e');
    expect(schemeOf(kineticById('star')!).hi).toBe('#2340ff');
  });
});

describe('動態字卡：副標、停在最後畫面', () => {
  it('副標：巨字橫移的底帶、環繞的圈上字、標題輪替的標籤用使用者打的副標；沒打就用原來的', () => {
    for (const [id, words] of [
      ['crawl', ['主標']],
      ['orbit', ['中間', '圈上']],
      ['swapline', ['新聞一', '新聞二']],
    ] as const) {
      const def = kineticById(id)!;
      expect(def.sub, id).toBeTruthy();
      const base = stage([...words]);
      def.draw(base.s, 1.5);
      const withSub = stage([...words]);
      withSub.s.sub = '獨家副標';
      def.draw(withSub.s, 1.5);
      expect(withSub.log.join('\n'), id).toContain('獨'); // 有的式子一個字一個字畫
      expect(base.log.join('\n'), id).not.toContain('獨');
    }
    // 沒有副標可改的式子沒有 sub
    expect(kineticById('cube')!.sub).toBeUndefined();
  });
  it('holdTime：最後一個詞那一輪裡字完整呈現的那一刻；一直在跑的式子（跑馬燈）沒有', async () => {
    const { holdTime, HOLD_F } = await import('./hold');
    const vpop = kineticById('vpop')!; // 每個詞 2.2 秒
    expect(holdTime(vpop, ['a', 'b', 'c'])).toBeCloseTo(4.4 + HOLD_F.vpop! * 2.2, 6);
    expect(holdTime(vpop, ['a'])).toBeCloseTo(HOLD_F.vpop! * 2.2, 6);
    const emph = kineticById('emph')!; // 兩個詞一組、一組 2.8 秒
    expect(holdTime(emph, ['a', 'b', 'c', 'd'])).toBeCloseTo(2.8 + HOLD_F.emph! * 2.8, 6);
    expect(holdTime(kineticById('crawl')!, ['a'])).toBeNull();
    // 每一式（一輪有長度的）都有停點、在最後一輪裡面
    for (const f of KINETIC) {
      const w = f.words;
      const total = f.len(w);
      if (total === null) continue;
      const h = holdTime(f, w)!;
      const last = f.len([w[w.length - 1]!])!;
      expect(h, f.id).toBeGreaterThanOrEqual(total - last);
      expect(h, f.id).toBeLessThanOrEqual(total);
    }
  });
});
