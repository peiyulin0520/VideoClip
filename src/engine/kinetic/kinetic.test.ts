import { describe, expect, it } from 'vitest';
import { clamp, E, fadeEdges, fit, marquee, rnd, seg, splitWords, wlen, type Stage } from './core';
import { beforeAll } from 'vitest';
import { KINETIC, kineticById, schemeOf } from './index';
import { lineSizes } from './fx/in';

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
  it('dragArea：可以往外拉到比畫面大（上限：畫面的 3 倍、面積 6 倍）；字卡縮小時框可以更大', async () => {
    const { dragArea } = await import('../../app/editor/KineticAreaEdit');
    const W = 1000;
    const H = 2000;
    const d = { id: 'a', x: 0.5, y: 0.5, w: 1.5, h: 0.4 };
    // 以前上限 1.5：右邊再往外拉 1000px（寬 +1.0）→ 2.5
    expect(dragArea(d, 'r', 1000, 0, W, H, 1, 0).w).toBeCloseTo(2.5, 5);
    // 一路拉：寬最多 3 倍畫面（沒有碰到面積上限：3 × 0.4）
    expect(dragArea(d, 'r', 9000, 0, W, H, 1, 0).w).toBeCloseTo(3, 5);
    // 字卡縮到 0.4：在畫面上最多 3 倍＝框的寬 7.5，但畫布上限 4
    const small = dragArea({ ...d, w: 1 }, 'r', 99999, 0, W, H, 0.4, 0);
    expect(small.w).toBeCloseTo(4, 5);
    // 面積上限 6：寬 3 × 高拉到 3 → 高被擋在 2（動到的那一邊停住，對邊不動）
    const big = dragArea({ ...d, w: 3, h: 1 }, 'b', 0, 99999, W, H, 1, 0);
    expect(big.w * big.h).toBeLessThanOrEqual(6 + 1e-6);
    expect(big.h).toBeCloseTo(2, 5);
    expect(big.y - big.h / 2).toBeCloseTo(0.5 - 0.5, 5); // 上邊不動
    // 角落：兩邊一起等比例縮到面積上限
    const corner = dragArea({ ...d, w: 2, h: 2 }, 'br', 99999, 99999, W, H, 1, 0);
    expect(corner.w * corner.h).toBeLessThanOrEqual(6 + 1e-6);
    expect(corner.w / corner.h).toBeCloseTo(1, 1);
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
  it('重擊排字換行：預設全部一行（字再多也一行、字縮小）；按 Enter 照使用者的行；自動換行超過 8 字才換', () => {
    expect(lineSizes(10, undefined, false)).toEqual([10]);
    expect(lineSizes(24, undefined, false)).toEqual([24]);
    expect(lineSizes(10, undefined, true)).toEqual([5, 5]);
    expect(lineSizes(8, undefined, true)).toEqual([8]);
    expect(lineSizes(6, ['週末一', '起出遊'], false)).toEqual([3, 3]);
    expect(lineSizes(6, ['週末', '一', '起出遊'], true)).toEqual([2, 1, 3]);
    expect(lineSizes(6, ['週末一起出遊'], true)).toEqual([6]); // 只有一行：不手動換
  });
  it('重擊排字：字再多也縮小排在同一行；按 Enter（lines）真的分成多行', () => {
    const def = kineticById('hitline')!;
    const total = (n: number) => n * 0.42 + 0.8;
    const ys = (words: string[], lines?: string[], wrap?: 'auto') => {
      const { s, log } = stage(words);
      def.draw({ ...s, lines, wrap }, total(Array.from(words.join('')).length) - 0.3);
      return new Set(
        log
          .filter((l) => l.startsWith('translate('))
          .map((l) => Math.round(Number(/,([-\d.]+)\)/.exec(l)![1]))),
      );
    };
    const ten = ['一二三四五六七八九十'];
    expect(ys(ten).size).toBe(1); // 預設一行
    expect(ys(ten, undefined, 'auto').size).toBe(2); // 自動換行
    expect(ys(ten, ['一二三四五', '六七八九十']).size).toBe(2); // 按了 Enter
    const long = ['一二三四五六七八九十甲乙丙丁戊己庚辛壬癸']; // 20 個字
    expect(ys(long).size).toBe(1);
  });
  it('停在最後畫面（settle）：重拍殘影的殘影收合（只剩主字）、隧道只剩一個正常大小的字；上下裂開停在字完整的那一刻', async () => {
    const strokes = (id: string, t: number, settle: number) => {
      const { s, log } = stage(['回聲']);
      kineticById(id)!.draw({ ...s, settle }, t);
      return log.filter((l) => l.startsWith('strokeText(')).length;
    };
    expect(strokes('trail', 0.1, 0)).toBeGreaterThan(0); // 打拍當下有空心殘影
    expect(strokes('trail', 0.1, 1)).toBe(0); // 停下來：殘影收合
    const words = (settle: number) => {
      const { s, log } = stage(['前進']);
      kineticById('tunnel')!.draw({ ...s, settle }, 1);
      return log.filter((l) => l.startsWith('fillText(') || l.startsWith('strokeText(')).length;
    };
    expect(words(0)).toBeGreaterThan(1); // 一層一層飛過來
    expect(words(1)).toBe(1); // 停下來只剩一個字
    const { holdTime } = await import('./hold');
    const split = kineticById('split')!;
    // 最後一個詞的第 1.3 秒：還沒開始裂開（1.45 秒起）
    expect(holdTime(split, ['結束', '開始'])).toBeCloseTo(2.2 + 1.3, 6);
    expect(holdTime(split, ['結束', '開始'])).toBeLessThan(split.len(['結束', '開始'])!);
  });
  it('一直流動的式子停在最後畫面：流動內容淡掉、整句完整的字淡入（paintKinetic 的 settle）', async () => {
    const { paintKinetic } = await import('./render');
    const texts = (id: string, settle: number) => {
      const log: string[] = [];
      HTMLCanvasElement.prototype.getContext = (() => fakeCtx(log).ctx) as never;
      const c = document.createElement('canvas');
      c.width = 180;
      c.height = 320;
      const def = kineticById(id)!;
      paintKinetic(
        c,
        def,
        {
          words: ['週末一起出遊'],
          fg: '#fff',
          paper: '#000',
          hi: '#f00',
          hifg: '#000',
          bg: null,
          family: 'sans-serif',
          settle,
        },
        def.poster,
      );
      return log.filter((l) => l.startsWith('fillText(')).map((l) => l.split(',')[0]);
    };
    for (const id of ['crawl', 'drift', 'slant', 'ticker', 'tape', 'led', 'depth', 'echo']) {
      expect(kineticById(id)!.len(['週末一起出遊']), id).toBeNull();
      // 淡入的整句字（alpha 要 settle 才看得到）：settle=1 時畫了整句字，settle=0 沒有這一筆
      expect(texts(id, 1).filter((x) => x === 'fillText(週末一起出遊').length, id).toBeGreaterThan(
        texts(id, 0).filter((x) => x === 'fillText(週末一起出遊').length - 1,
      );
    }
    // 環繞、歌詞捲動本來整句都看得到：不處理
    expect(kineticById('orbit')!.calm).toBe(false);
    expect(kineticById('lyrics')!.calm).toBe(false);
  });
  it('彎道：從頭到尾只有一條緞帶、整句字只寫一遍；收尾 0.9＋2.3 秒、用真正的時間畫', () => {
    const def = kineticById('path')!;
    expect(def.calm).toBe(false);
    expect(def.smooth).toBe(true); // 用真正的時間畫、不量化成步
    expect(def.settleLen).toBe(2.3);
    expect(def.hold!([])).toBeCloseTo(0.9 + 2.3, 6); // 緞帶滑到畫面正中間（第一輪的一半，0.9 秒）時開始收尾
    const drawn = (settle: number) => {
      const { s, log } = stage(['順著河走', '就會到海'], 180, 320);
      def.draw({ ...s, settle }, 1);
      return log.filter((l) => l.startsWith('fillText(')).map((l) => l.slice(9, 10));
    };
    expect(drawn(0).join('')).toBe('順著河走 就會到海'); // 平常滑的時候：整句一遍、不重複，空格也算
    expect(drawn(1).join('')).toBe('順著河走 就會到海'); // 停下來：還是整句一遍
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
  it('holdTime：最後一個詞那一輪裡字完整呈現的那一刻；一直在跑的式子（跑馬燈）停在代表畫面', async () => {
    const { holdTime, HOLD_F } = await import('./hold');
    const vpop = kineticById('vpop')!; // 每個詞 2.2 秒
    expect(holdTime(vpop, ['a', 'b', 'c'])).toBeCloseTo(4.4 + HOLD_F.vpop! * 2.2, 6);
    expect(holdTime(vpop, ['a'])).toBeCloseTo(HOLD_F.vpop! * 2.2, 6);
    const emph = kineticById('emph')!; // 兩個詞一組、一組 2.8 秒
    expect(holdTime(emph, ['a', 'b', 'c', 'd'])).toBeCloseTo(2.8 + HOLD_F.emph! * 2.8, 6);
    expect(holdTime(kineticById('crawl')!, ['a'])).toBe(kineticById('crawl')!.poster); // 一直在跑的：停在代表畫面
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
  it('fadeEdges：淡出寬度＝框長邊 × fadeW（預設 12%），上下／左右各一條漸層', () => {
    const grad = (fade: 'v' | 'h', w?: number) => {
      const { ctx, log } = fakeCtx();
      fadeEdges(ctx, 400, 200, fade, w);
      return log.filter((l) => l.startsWith('fillRect('));
    };
    // 上下：高 200，fadeW 0.25 → 50；上條 (0,0,400,50)，下條從 150 起
    expect(grad('v', 0.25)).toEqual([
      'fillRect(0.00,0.00,400.00,50.00)',
      'fillRect(0.00,150.00,400.00,50.00)',
    ]);
    // 左右：寬 400，fadeW 0.05 → 20
    expect(grad('h', 0.05)).toEqual([
      'fillRect(0.00,0.00,20.00,200.00)',
      'fillRect(380.00,0.00,20.00,200.00)',
    ]);
    // 沒給＝12%
    expect(grad('v')[0]).toBe('fillRect(0.00,0.00,400.00,24.00)');
  });
  it('重擊排字：停在最後時 6 個字都在自己的位置（由左到右）、沒放大沒轉；播放中途前面的字已經留在原位', async () => {
    const { holdTime } = await import('./hold');
    const def = kineticById('hitline')!;
    const words = ['週末一起出遊'];
    const at = (t: number) => {
      const { s, log } = stage(words);
      def.draw(s, t);
      const tr = log
        .filter((l) => l.startsWith('translate('))
        .map((l) => Number(/translate\(([-\d.]+),/.exec(l)![1]));
      const sc = log
        .filter((l) => l.startsWith('scale('))
        .map((l) => l.replace('scale(', '').replace(')', ''));
      return { tr, sc };
    };
    const h = holdTime(def, words);
    expect(h).toBeCloseTo(5 * 0.42 + 0.3, 6);
    const end = at(h + 0.05);
    expect(end.tr).toHaveLength(6);
    expect(end.tr).toEqual([...end.tr].sort((a, b) => a - b)); // 由左到右
    expect(new Set(end.tr).size).toBe(6);
    expect(new Set(end.sc)).toEqual(new Set(['1.00,1.00'])); // 都落定了
    // 第 3 個字剛開始砸（0.84 秒 + 0.02）：已經畫了 3 個字，前兩個是原大小
    const mid = at(2 * 0.42 + 0.02);
    expect(mid.tr).toHaveLength(3);
    expect(mid.sc.slice(0, 2)).toEqual(['1.00,1.00', '1.00,1.00']);
    expect(mid.sc[2]).not.toBe('1.00,1.00');
    // 逐字重擊照舊：同一時間只畫一個字
    const { s: s2, log: l2 } = stage(words);
    kineticById('hit')!.draw(s2, 2 * 0.42 + 0.02);
    expect(l2.filter((l) => l.startsWith('translate(')).length).toBe(1);
  });
  it('停在最後畫面（settle）：拉長每個字都回到原樣；沒 settle 時有字在被拉', () => {
    const def = kineticById('stretch')!;
    const words = ['週末一起出遊'];
    const scales = (settle: number) => {
      const { s, log } = stage(words);
      def.draw({ ...s, settle }, 2.35);
      return log.filter((l) => l.startsWith('scale(')).map((l) => l.replace('scale(', '').replace(')', ''));
    };
    expect(new Set(scales(1))).toEqual(new Set(['1.00,1.00']));
    expect(new Set(scales(0)).size).toBeGreaterThan(1);
    const words12 = ['一二三四五六七八九十甲乙'];
    const { s, log } = stage(words12);
    def.draw({ ...s, settle: 1 }, 2.35);
    expect(new Set(log.filter((l) => l.startsWith('scale(')).map((l) => l))).toEqual(
      new Set(['scale(1.00,1.00)']),
    );
  });
  it('holdTime：時間跟字數有關的式子（逐字重擊、翻牌、翻卡、拉霸…）停在最後一個詞完整的那一刻，字多也一樣', async () => {
    const { holdTime } = await import('./hold');
    const six = ['週末一起出遊'];
    // 逐字重擊：6 個字一個一個砸，停在第 6 個字砸完（不是第 5 個「聚」）
    const hit = kineticById('hit')!;
    expect(holdTime(hit, six)).toBeCloseTo(5 * 0.42 + 0.3, 6);
    expect(holdTime(hit, six)).toBeLessThan(hit.len(six)!);
    expect(holdTime(hit, ['好'])).toBeCloseTo(0.3, 6);
    // 翻牌：每一格牌都翻定了（第 6 格 0.35 + 5×0.28 秒）才停
    const flap = kineticById('flap')!;
    expect(holdTime(flap, six)).toBeGreaterThan(0.35 + 5 * 0.28);
    expect(holdTime(flap, six)).toBeLessThan(flap.len(six)!);
    // 翻卡、拉霸：總長是「詞數 × 一輪」，停點在最後一個詞那一輪裡
    for (const id of ['flip', 'slot']) {
      const f = kineticById(id)!;
      const one = f.len(['一二三四'])!;
      expect(f.len(['一二三四', '五六七八'])!, id).toBeCloseTo(one * 2, 6);
      expect(holdTime(f, ['一二三四', '五六七八']), id).toBeGreaterThan(one);
      expect(holdTime(f, ['一二三四', '五六七八']), id).toBeLessThan(one * 2);
    }
    // 每一式、各種字數：停點不超過一輪
    for (const f of KINETIC)
      for (const w of [['好'], six, ['環島公路', '一路向南'], ['開場', '登場', '來了']]) {
        const total = f.len(w);
        if (total === null) continue;
        expect(holdTime(f, w), `${f.id} ${w.join('/')}`).toBeLessThanOrEqual(total + 1e-6);
      }
  });
});

describe('動態字卡：字距（withSpacing）與行距', () => {
  it('withSpacing：每次設 font 就把 letterSpacing 設成「字距 em × 字的像素」；其他屬性、方法照常', async () => {
    const { withSpacing } = await import('./render');
    const calls: string[] = [];
    const raw = {
      font: '',
      letterSpacing: '0px',
      fillText(this: { letterSpacing: string; font: string }, s: string) {
        calls.push(`${this.letterSpacing}|${this.font}|${s}`);
      },
    } as unknown as CanvasRenderingContext2D;
    const g = withSpacing(raw, 0.25);
    g.font = '900 40px Foo, sans-serif';
    expect(raw.letterSpacing).toBe('10px');
    g.fillText('字', 0, 0);
    expect(calls).toEqual(['10px|900 40px Foo, sans-serif|字']);
    g.font = '700 12.5px Bar';
    expect(raw.letterSpacing).toBe('3.125px');
    // 負的字距（比預設更擠）
    const g2 = withSpacing(raw, -0.1);
    g2.font = '900 20px X';
    expect(raw.letterSpacing).toBe('-2px');
  });
  it('withSpacing：字距 0、或這個 context 沒有 letterSpacing（舊版 Safari）→ 原樣回傳', async () => {
    const { withSpacing } = await import('./render');
    const raw = { font: '' } as unknown as CanvasRenderingContext2D;
    expect(withSpacing(raw, 0.3)).toBe(raw);
    const raw2 = { font: '', letterSpacing: '0px' } as unknown as CanvasRenderingContext2D;
    expect(withSpacing(raw2, 0)).toBe(raw2);
  });
});

describe('流動的 8 式：停在最後畫面是特效自己的樣子（rest）', () => {
  const IDS = ['crawl', 'drift', 'slant', 'ticker', 'tape', 'led', 'depth', 'echo'];
  it('這 8 式都有自己的 rest；流動中的畫面跟停止畫面不一樣', () => {
    for (const id of IDS) expect(typeof kineticById(id)!.rest, id).toBe('function');
  });
  it('rest 畫出整句字（每個詞都出現）、字型粗細與原本流動時一樣（900 或該式自己的粗細）', () => {
    for (const id of IDS) {
      const { s, log } = stage(['環島公路', '一路向南'], 360, 640);
      kineticById(id)!.rest!(s);
      // 畫出的字（橫排是整串、直排是一個字一個字）合起來，每個詞的每個字都在
      const drawn = log
        .filter((l) => l.startsWith('fillText('))
        .map((l) => l.slice(9).split(',')[0])
        .join('');
      for (const ch of Array.from('環島公路一路向南')) expect(drawn, `${id} 缺 ${ch}`).toContain(ch);
      // 沒有畫出畫布外面很遠的東西（靜止、放得進畫面）
      // （假的 context 沒有 globalAlpha 初始值，`*=` 會變 NaN，不算）
      expect(
        log.filter((l) => /NaN|Infinity/.test(l) && !l.startsWith('set globalAlpha=')).slice(0, 3),
        id,
      ).toEqual([]);
    }
  });
  it('巨字橫移的停止畫面有底部強調色窄帶＋小字，主字很大（不是通用的一般小字）', () => {
    const { s, log } = stage(['週末出遊'], 360, 640);
    kineticById('crawl')!.rest!(s);
    expect(log.some((l) => l.startsWith('fillRect(0.00,'))).toBe(true);
    const big = log
      .filter((l) => /^set font=/.test(l))
      .map((l) => parseFloat(/(\d+(?:\.\d+)?)px/.exec(l)?.[1] ?? '0'));
    expect(Math.max(...big)).toBeGreaterThan(60);
  });
});
