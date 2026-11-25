// 強調（25–32）。改寫自 claude-animated-text（MIT，© 2026 pound / POUND0423）。
import {
  blurred,
  clamp,
  cs,
  drawChars,
  drawWord,
  E,
  fit,
  fitN,
  fontOf,
  keys,
  lerp,
  pick,
  rnd,
  seg,
  wlen,
  type KeyPt,
  type KineticDef,
} from '../core';

export const FX_EM: KineticDef[] = [
  {
    id: 'glitch',
    group: 'em',
    zh: '訊號故障',
    en: 'Glitch',
    scheme: 'ink',
    words: ['訊號不良', '請稍候'],
    poster: 1.3,
    len: (w) => 2.6 * w.length,
    draw(s, t) {
      const { W, H, cqmin } = s;
      const D = 2.6;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const word = pick(s.words, i);
      const px = fit(s, word, 42, 76);
      const g = (tt < 0.3 || (tt > 1.15 && tt < 1.45) || tt > 2.3) && (s.settle ?? 0) < 0.5 ? 1 : 0;
      const st = Math.floor(t * 20);
      const y1 = g ? rnd(st, 1, 1) * 70 : 0;
      const y2 = y1 + (g ? 12 + rnd(st, 2, 1) * 22 : 0);
      const dxTop = g * (rnd(st, 3, 1) - 0.5) * 3 * cqmin;
      const dxMid = g * (rnd(st, 4, 1) - 0.5) * 26 * cqmin;
      // 重影（強調色）在最下面，閃的時候才出現
      if (g)
        drawWord(
          s,
          word,
          W / 2 + (rnd(st, 5, 1) - 0.5) * 9 * cqmin,
          H / 2 + (rnd(st, 6, 1) - 0.5) * 3 * cqmin,
          px,
          {
            color: s.hi,
          },
        );
      // 字被橫切成上、中、下三段，中間那段左右大幅錯位
      drawWord(s, word, W / 2 + dxTop, H / 2, px, { clip: [-20, y1] });
      drawWord(s, word, W / 2 + dxMid, H / 2, px, { clip: [y1, y2] });
      drawWord(s, word, W / 2 + dxTop, H / 2, px, { clip: [y2, 120] });
    },
  },
  {
    id: 'marker',
    group: 'em',
    zh: '螢光筆',
    en: 'Highlighter',
    scheme: 'verm',
    words: ['重點在這', '先看這句', '記下來'],
    poster: 1.2,
    len: (w) => 2.6 * w.length,
    draw(s, t) {
      const { g, W, H } = s;
      const D = 2.6;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const word = pick(s.words, i);
      const px = fitN(s, wlen(word) + 0.4, 36, 78);
      g.font = fontOf(s, px);
      const tw = g.measureText(word).width;
      const bw = tw + 0.4 * px;
      const bh = 1.15 * px;
      const x0 = (W - bw) / 2;
      const y0 = (H - bh) / 2;
      const a = E.out(seg(tt, 0.25, 0.7));
      const o = E.in(seg(tt, 2.1, 2.45));
      // 色塊：從左刷過字的下半部（斜切 8°）；收的時候從右邊收回去
      const sx = o > 0 ? 1 - o : a;
      if (sx > 0.001) {
        const ox = o > 0 ? x0 + bw : x0;
        g.save();
        g.translate(ox, y0 + bh * 0.7);
        g.transform(1, 0, Math.tan((-8 * Math.PI) / 180), 1, 0, 0);
        g.scale(sx, 1);
        g.fillStyle = s.hi;
        g.fillRect(o > 0 ? -bw : 0, -bh * 0.28, bw, bh * 0.56);
        g.restore();
      }
      drawWord(s, word, W / 2, H / 2, px, { alpha: seg(tt, 0, 0.18) * (1 - seg(tt, 2.35, 2.55)) });
    },
  },
  {
    id: 'shake',
    group: 'em',
    zh: '抖動',
    en: 'Shake',
    scheme: 'paper',
    words: ['不可能', '怎麼會', '太誇張'],
    poster: 0.6,
    len: (w) => 2.4 * w.length,
    draw(s, t) {
      const { W, H, cqmin } = s;
      const D = 2.4;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const word = pick(s.words, i);
      const px = fit(s, word, 40, 72);
      const A: KeyPt[] = [
        [0, 0],
        [0.12, 1],
        [1.5, 1],
        [1.9, 0.12],
        [2.4, 0.12],
      ];
      const amp = keys(tt, A) * (1 - (s.settle ?? 0));
      const st = Math.floor(t * 24);
      // 每個字各自亂抖：每秒 24 次隨機跳到新的位置、帶小角度旋轉，不平滑過渡
      drawChars(s, word, W / 2, H / 2, px, (j) => ({
        dx: (rnd(st, j, 1) - 0.5) * amp * 7 * cqmin,
        dy: (rnd(st, j, 2) - 0.5) * amp * 7 * cqmin,
        rot: (rnd(st, j, 3) - 0.5) * amp * 14,
        color: s.hi,
      }));
    },
  },
  {
    id: 'neon',
    group: 'em',
    zh: '霓虹燈管',
    en: 'Neon flicker',
    scheme: 'ink',
    words: ['深夜營業', '宵夜時間'],
    poster: 2,
    len: (w) => 4 * w.length,
    draw(s, t) {
      const { W, H } = s;
      const D = 4;
      const k = Math.floor(t / D);
      const tt = t - k * D;
      const word = pick(s.words, k);
      const px = fit(s, word, 40, 74);
      const n = cs(word).length;
      const lucky = Math.floor(rnd(k, 7, 7) * n);
      // 空心發光的字（只有強調色描邊、外面一圈光暈），一個字一個字閃著亮起來
      drawChars(s, word, W / 2, H / 2, px, (j) => {
        const tj = 0.2 + rnd(k, j, 0) * 0.9;
        let on: number;
        if (tt < tj) on = 0;
        else if (tt < tj + 0.35) on = Math.floor((tt - tj) * 28) % 3 ? 1 : 0;
        else if (tt > 3.6) on = tt < 3.6 + j * 0.05 ? 1 : 0;
        else on = j === lucky && tt > 2.4 && tt < 2.62 && Math.floor(tt * 30) % 2 && !(s.settle ?? 0) ? 0 : 1;
        return {
          alpha: on ? 1 : 0.14,
          color: s.hi,
          stroke: 0.028 * px,
          glow: on ? [0.09 * px, 0.32 * px] : [0],
        };
      });
    },
  },
  {
    id: 'bob',
    group: 'em',
    zh: '波浪起伏',
    en: 'Wave bob',
    scheme: 'cobalt',
    words: ['搖啊搖', '慢慢晃'],
    poster: 1,
    len: (w) => 4.4 * w.length,
    draw(s, t) {
      const { W, H, cqmin } = s;
      const D = 4.4;
      const word = pick(s.words, Math.floor(t / D));
      const px = fit(s, word, 38, 74);
      drawChars(s, word, W / 2, H / 2, px, (j) => {
        const ph = t * 4 - j * 0.6;
        const k = 1 - (s.settle ?? 0);
        return { dy: Math.sin(ph) * 8 * cqmin * k, rot: Math.cos(ph) * 6 * k };
      });
    },
  },
  {
    id: 'track',
    group: 'em',
    zh: '字距拉開',
    en: 'Tracking out',
    scheme: 'paper',
    words: ['序章', '很久以後'],
    poster: 1.8,
    len: (w) => 3.6 * w.length,
    draw(s, t) {
      const { W, H } = s;
      const D = 3.6;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const word = pick(s.words, i);
      const n = cs(word).length;
      const px = fitN(s, wlen(word) + (n - 1) * 0.72, 30, 84);
      const sp = lerp(0, 0.7, tt / D);
      const alpha = seg(tt, 0, 0.6) * (1 - seg(tt, 3.1, 3.55));
      // 字距從緊貼慢慢拉開：每個字離中心的距離 ＝ (第幾個字 − 中心) × 間距（以字級計）
      drawChars(s, word, W / 2, H / 2, px, (j) => ({ dx: (j - (n - 1) / 2) * sp * px, alpha }));
    },
  },
  {
    id: 'fill',
    group: 'em',
    zh: '空心填滿',
    en: 'Outline fill',
    scheme: 'verm',
    words: ['充電中', '滿格'],
    poster: 1.3,
    len: (w) => 3 * w.length,
    draw(s, t) {
      const { W, H } = s;
      const D = 3;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const word = pick(s.words, i);
      const px = fit(s, word, 44, 76);
      const L: KeyPt[] = [
        [0, 0],
        [0.2, 0],
        [1.8, 1, E.io],
        [2.5, 1],
        [3, 0, E.in],
      ];
      const top = (1 - keys(tt, L)) * 100;
      // 強調色的字從底部往上被灌滿（只露出下面 (1−進度) 以下的部分），上面蓋一層空心描邊字
      drawWord(s, word, W / 2, H / 2, px, { color: s.hi, clip: [top, 106] });
      drawWord(s, word, W / 2, H / 2, px, { color: s.fg, stroke: 0.03 * px });
    },
  },
  {
    id: 'focus',
    group: 'em',
    zh: '對焦',
    en: 'Focus pull',
    scheme: 'ink',
    words: ['想起來了', '原來是你'],
    poster: 1.6,
    len: (w) => 3 * w.length,
    draw(s, t) {
      const { g, W, H, cqmin } = s;
      const D = 3;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const word = pick(s.words, i);
      const px = fit(s, word, 42, 76);
      const p = E.out(seg(tt, 0, 1.1));
      const o = E.in(seg(tt, 2.4, 2.9));
      const b = (1 - p) * 5 + o * 4;
      const sc = lerp(1.15, 1, p) + o * 0.06;
      const bl = clamp(b, 0, 99) * cqmin;
      blurred(
        g,
        bl,
        () => drawWord(s, word, W / 2, H / 2, px, { sx: sc, sy: sc, alpha: seg(tt, 0, 0.5) * (1 - o) }),
        [W / 2, H / 2, (wlen(word) * 0.62 * px + 0.9 * px) * sc + bl * 3, px * 0.9 * sc + bl * 3],
      );
    },
  },
];
