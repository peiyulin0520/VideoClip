// 歌詞 MV（41–48）。改寫自 claude-animated-text（MIT，© 2026 pound / POUND0423）。
import {
  clamp,
  cs,
  drawChars,
  drawWord,
  E,
  fit,
  fitN,
  fontOf,
  lerp,
  pick,
  seg,
  sentenceAt,
  wlen,
  type KineticDef,
} from '../core';

export const FX_MV: KineticDef[] = [
  {
    id: 'kara',
    group: 'mv',
    zh: '跟唱填色',
    en: 'Karaoke fill',
    scheme: 'ink',
    words: ['把燈關掉以後', '城市才開始說話'],
    poster: 1.2,
    area: 'lyrics',
    len: (w) => w.reduce((a, x) => a + cs(x).length * 0.26 + 1.1, 0),
    draw(s, t) {
      const { W, H } = s;
      const T = s.words.map((w) => cs(w).length * 0.26 + 1.1);
      const { i, tt } = sentenceAt(T, t);
      const word = s.words[i]!;
      const px = fit(s, word, 30, 86);
      const p = clamp((tt - 0.3) / (cs(word).length * 0.26));
      const o = seg(tt, 0, 0.2) * (1 - seg(tt, T[i]! - 0.22, T[i]!));
      // 原本的字（主文字色）；強調色的字蓋在上面，顏色從左到右一個字一個字填過去
      drawWord(s, word, W / 2, H / 2, px, { alpha: o });
      drawWord(s, word, W / 2, H / 2, px, { alpha: o, color: s.hi, clipX: [-2, p * 100] });
    },
  },
  {
    id: 'popsync',
    group: 'mv',
    zh: '逐字踩拍',
    en: 'Beat by beat',
    scheme: 'cobalt',
    words: ['聽見了嗎', '心跳的聲音'],
    poster: 1.3,
    area: 'lyrics',
    len: (w) => w.reduce((a, x) => a + cs(x).length * 0.3 + 1.2, 0),
    // 最後一個詞每個字都蹦出來了（第 j 個 0.15 + j×0.3 秒），還沒開始淡出（T − 0.25 秒）
    hold: (w) => {
      const n = cs(w[w.length - 1]!).length;
      const before = w.slice(0, -1).reduce((a, x) => a + cs(x).length * 0.3 + 1.2, 0);
      return before + n * 0.3 + 0.4;
    },
    draw(s, t) {
      const { W, H } = s;
      const T = s.words.map((w) => cs(w).length * 0.3 + 1.2);
      const { i, tt } = sentenceAt(T, t);
      const word = s.words[i]!;
      const px = fit(s, word, 38, 80);
      const out = seg(tt, T[i]! - 0.25, T[i]!);
      // 每一拍蹦出一個字（過衝彈出），剛出來的那 0.3 秒是強調色
      drawChars(s, word, W / 2, H / 2, px, (j) => {
        const lt = tt - 0.15 - j * 0.3;
        const sc = lt > 0 ? E.back(seg(lt, 0, 0.22)) : 0;
        return { sx: sc, sy: sc, color: lt > 0 && lt < 0.3 ? s.hi : s.fg, alpha: 1 - out };
      });
    },
  },
  {
    id: 'dual',
    group: 'mv',
    zh: '上下兩行',
    en: 'Two-line karaoke',
    scheme: 'paper',
    words: ['風從海上來', '吹過你的窗', '我還站在這', '等一首歌唱完'],
    poster: 1,
    len: () => 2.2 * 2,
    draw(s, t) {
      const { g, W, H, cqw, cqh } = s;
      const px = fitN(s, Math.max(...s.words.map(wlen)), 19, 72);
      const D = 2.2;
      const k = Math.floor(t / D);
      const tt = t - k * D;
      const actA = k % 2 === 0;
      const fin = seg(tt, 0, 0.3);
      const p = seg(tt, 0.15, D - 0.25);
      const A = pick(s.words, 2 * Math.floor((k + 1) / 2));
      const B = pick(s.words, 2 * Math.floor(k / 2) + 1);
      const bh = px * 1.1;
      g.font = fontOf(s, px);
      g.textBaseline = 'middle';
      // 左上一行（靠左）、右下一行（靠右）；輪到的那行全亮、底線從左長出來，另一行 30% 淡淡的
      for (const [word, act, left] of [
        [A, actA, true],
        [B, !actA, false],
      ] as const) {
        const tw = g.measureText(word).width;
        const x = left ? 8 * cqw : W - 8 * cqw - tw;
        const y = left ? 20 * cqh : H - 20 * cqh - bh;
        g.save();
        g.globalAlpha *= act ? 1 : 0.3 * fin;
        g.fillStyle = s.fg;
        g.textAlign = 'left';
        g.fillText(word, x, y + bh / 2);
        const sc = act ? p : 0;
        if (sc > 0.001) {
          g.fillStyle = s.hi;
          g.fillRect(x, y + bh + 0.06 * px, tw * sc, 0.1 * px);
        }
        g.restore();
      }
    },
  },
  {
    id: 'beat',
    group: 'mv',
    zh: '重拍反白',
    en: 'Beat flash',
    scheme: 'verm',
    words: ['一', '二', '三', '跳'],
    poster: 0.3,
    len: (w) => 0.5 * w.length,
    draw(s, t) {
      const { g, W, H } = s;
      const B = 0.5;
      const b = Math.floor(t / B);
      const bt = t - b * B;
      const word = pick(s.words, b);
      const inv = b % 2 === 1;
      const px = fit(s, word, 58, 80);
      // 單數拍整個畫面反白（底色變主文字色、字變紙色）；字每一拍先放大再縮回來（第 4 拍放大更多）
      if (inv) {
        g.fillStyle = s.fg;
        g.fillRect(0, 0, W, H);
      }
      const sc = 1 + (b % 4 === 3 ? 0.6 : 0.3) * (1 - E.out(seg(bt, 0, 0.24)));
      drawWord(s, word, W / 2, H / 2, px, { sx: sc, sy: sc, color: inv ? s.paper : s.fg });
    },
  },
  {
    id: 'soft',
    group: 'mv',
    zh: '柔焦浮現',
    en: 'Soft rise',
    scheme: 'verm',
    words: ['想念是一種天氣', '今天有雨'],
    poster: 1.8,
    area: 'lyrics',
    len: (w) => w.reduce((a, x) => a + cs(x).length * 0.09 + 3.0, 0),
    draw(s, t) {
      const { W, H, cqmin } = s;
      const T = s.words.map((w) => cs(w).length * 0.09 + 3.0);
      const { i, tt } = sentenceAt(T, t);
      const word = s.words[i]!;
      const px = fit(s, word, 28, 84);
      const q = seg(tt, T[i]! - 0.7, T[i]!);
      // 每個字從模糊裡慢慢浮上來（往上飄一點、由糊變清楚），最後一起散掉
      drawChars(s, word, W / 2, H / 2, px, (j) => {
        const p = E.out(seg(tt, 0.1 + j * 0.09, 0.9 + j * 0.09));
        const b = (1 - p) * 1.4 + q * 1.6;
        return { dy: ((1 - p) * 6 - q * 3) * cqmin, alpha: p * (1 - q), blur: b * cqmin };
      });
    },
  },
  {
    id: 'lyrics',
    group: 'mv',
    zh: '歌詞捲動',
    en: 'Lyric scroll',
    scheme: 'ink',
    words: ['天還沒亮', '路燈先睡了', '我騎過整座橋', '風替我唱', '到你家樓下', '才發現忘了詞'],
    poster: 1,
    area: 'lyrics',
    fade: 'v',
    len: () => null,
    draw(s, t) {
      const { W, H, cqmin } = s;
      const lines: string[] = [];
      do s.words.forEach((w) => lines.push(w));
      while (lines.length < 6);
      const n = lines.length;
      const px = fitN(s, Math.max(...s.words.map(wlen)), 17, 82);
      const D = 1.5;
      const ss = t / D;
      const cur = Math.floor(ss);
      const pos = (cur + E.io(seg(ss - cur, 0.72, 1))) % n;
      // 唱到的那一行在中間放大變色，其他行縮小變淡；一行一行往上捲，框外看不到（上下邊緣淡出）
      lines.forEach((word, j) => {
        let d = j - pos;
        if (d > n / 2) d -= n;
        if (d < -n / 2) d += n;
        const a = Math.abs(d);
        const alpha = a > 2.4 ? 0 : lerp(1, 0.3, clamp(a));
        if (alpha <= 0) return;
        const sc = lerp(1, 0.6, clamp(a));
        drawWord(s, word, W / 2, H / 2 + d * 19 * cqmin, px, {
          sx: sc,
          sy: sc,
          alpha,
          color: a < 0.5 ? s.hi : s.fg,
        });
      });
    },
  },
  {
    id: 'trail',
    group: 'mv',
    zh: '重拍殘影',
    en: 'Echo trail',
    scheme: 'cobalt',
    words: ['回聲', '還在'],
    poster: 0.14,
    len: (w) => 0.6 * 4 * w.length,
    draw(s, t) {
      const { W, H, cqmin } = s;
      const N = 6;
      const B = 0.6;
      const b = Math.floor(t / B);
      const bt = t - b * B;
      const i = Math.floor(b / 4);
      const word = pick(s.words, i);
      const px = fit(s, word, 40, 70);
      const d = E.out(seg(bt, 0, 0.16)) * (1 - E.io(seg(bt, 0.16, 0.58)));
      const dir = b % 2 ? 1 : -1;
      // 每一拍甩出 6 層空心殘影（越遠越淡），再收回來；主字在最上面，剛打拍時稍微放大
      for (let j = N; j >= 1; j--)
        drawWord(s, word, W / 2, H / 2 + dir * j * d * 7.5 * cqmin, px, {
          stroke: 0.03 * px,
          alpha: clamp((1 - j / (N + 1)) * Math.min(1, d * 4)),
        });
      const sc = 1 + 0.08 * (1 - seg(bt, 0, 0.2));
      drawWord(s, word, W / 2, H / 2, px, { sx: sc, sy: sc });
    },
  },
  {
    id: 'mix',
    group: 'mv',
    zh: '大小混排',
    en: 'Type block',
    scheme: 'paper',
    words: ['今晚', '不回家', '一直', '唱'],
    poster: 2.6,
    len: () => 3.8,
    draw(s, t) {
      const { g, W, H, cqw, cqh } = s;
      const D = 3.8;
      const tt = t % D;
      const out = E.in(seg(tt, 3.4, 3.7));
      // 100em×56em 的一塊（1em ＝ min(0.9cqw, 1.5cqh)）；4 個詞大小、方向都不同，一拍一個拼成一整塊
      const em = Math.min(0.9 * cqw, 1.5 * cqh);
      const ox = (W - 100 * em) / 2;
      const oy = (H - 56 * em) / 2;
      const SL = [
        { x: 2, y: 1, w: 66, h: 31, fx: -1, fy: 0 },
        { x: 71, y: 1, w: 27, h: 54, fx: 0, fy: -1, v: true, hi: true },
        { x: 2, y: 34, w: 41, h: 21, fx: 0, fy: 1, hi: true },
        { x: 45, y: 34, w: 23, h: 21, fx: 1, fy: 0 },
      ];
      SL.forEach((o, i) => {
        const word = pick(s.words, i);
        const n = Math.max(wlen(word), 1);
        const raw = seg(tt, 0.2 + i * 0.45, 0.44 + i * 0.45);
        if (raw <= 0) return;
        const p = E.out(raw);
        const fs = (o.v ? Math.min(o.w * 0.96, o.h / n) : Math.min(o.h * 0.96, o.w / n)) * em;
        const cx = ox + (o.x + o.w / 2) * em + o.fx * (1 - p) * 70 * cqw;
        const cy = oy + (o.y + o.h / 2) * em + o.fy * (1 - p) * 70 * cqh;
        const sc = 1 - out;
        if (sc <= 0.001) return;
        const color = o.hi ? s.hi : s.fg;
        if (!o.v) drawWord(s, word, cx, cy, fs, { sx: sc, sy: sc, color });
        else {
          // 直排：一個字一個字由上往下疊
          const chars = cs(word);
          g.save();
          g.translate(cx, cy);
          g.scale(sc, sc);
          chars.forEach((ch, c) => {
            drawWord(s, ch, 0, (c - (chars.length - 1) / 2) * fs, fs, { color });
          });
          g.restore();
        }
      });
    },
  },
];
