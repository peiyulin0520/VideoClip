// 登場（01–08）。改寫自 claude-animated-text（MIT，© 2026 pound / POUND0423）。
import {
  clamp,
  cs,
  drawChars,
  drawWord,
  E,
  fit,
  fontOf,
  keys,
  lerp,
  pick,
  seg,
  type KeyPt,
  type KineticDef,
} from '../core';

/** 逐字重擊用的字：所有詞接起來、去掉空白、最多 14 個字 */
const hitChars = (words: string[]) =>
  cs(words.join(''))
    .filter((x) => x.trim())
    .slice(0, 14);

export const FX_IN: KineticDef[] = [
  {
    id: 'burst',
    group: 'in',
    zh: '爆出',
    en: 'Burst',
    scheme: 'ink',
    words: ['開場', '登場', '來了'],
    poster: 0.6,
    len: (w) => 2.2 * w.length,
    draw(s, t) {
      const { g, W, H, cqmin } = s;
      const D = 2.2;
      const k = Math.floor(t / D);
      const tt = t - k * D;
      const word = pick(s.words, k);
      const px = fit(s, word, 46, 78);
      const p = E.back(seg(tt, 0, 0.42));
      const out = seg(tt, 1.85, 2.15);
      // 放射線（14 條，先畫在字後面）
      const q = seg(tt, 0.02, 0.55);
      if (q > 0 && q < 1) {
        const d = lerp(18, 64, E.out(q)) * cqmin;
        for (let j = 0; j < 14; j++) {
          g.save();
          g.translate(W / 2, H / 2);
          g.rotate(((j * 360) / 14 + k * 17) * (Math.PI / 180));
          g.translate(0, -d);
          g.scale(1, (1 - q) * (j % 2 ? 1 : 0.55));
          g.fillStyle = s.hi;
          g.fillRect(-0.55 * cqmin, -6.5 * cqmin, 1.1 * cqmin, 13 * cqmin);
          g.restore();
        }
      }
      drawWord(s, word, W / 2, H / 2, px, {
        sx: p * (1 - out * 0.25),
        sy: p * (1 - out * 0.25),
        alpha: clamp(1 - out),
      });
    },
  },
  {
    id: 'hit',
    group: 'in',
    zh: '逐字重擊',
    en: 'Hit by hit',
    scheme: 'verm',
    words: ['一刀未剪'],
    poster: 0.3,
    len: (w) => hitChars(w).length * 0.42 + 0.5,
    draw(s, t) {
      const { W, H, cqmin } = s;
      const S = hitChars(s.words);
      const D = 0.42;
      const total = S.length * D + 0.5;
      const tt = t % total;
      const i = tt < S.length * D ? Math.floor(tt / D) : -1;
      if (i < 0) return;
      const p = E.out(seg(tt - i * D, 0, 0.13));
      const sc = lerp(2.4, 1, p);
      drawWord(s, S[i]!, W / 2, H / 2, 62 * cqmin, { sx: sc, sy: sc, rot: (i % 2 ? 1 : -1) * lerp(7, 0, p) });
    },
  },
  {
    id: 'stamp',
    group: 'in',
    zh: '蓋章',
    en: 'Stamp',
    scheme: 'paper',
    words: ['通過', '已讀', '限定'],
    poster: 2.4,
    len: () => 3.6,
    draw(s, t) {
      const { g, W, H, cqmin, cqw, cqh } = s;
      const D = 3.6;
      const tt = t % D;
      const out = seg(tt, 3.2, 3.5);
      const rot = [-9, 5, -4];
      const dy = [-7, 9, -3];
      // 三顆印章：粗外框、小圓角、字在裡面；排成一列，放不下就換行（跟原版的 flex-wrap 一樣）
      const items = [0, 1, 2].map((i) => {
        const word = pick(s.words, i);
        const px = fit(s, word, 17, 23);
        g.font = fontOf(s, px);
        const bw = 0.13 * px;
        return {
          i,
          word,
          px,
          bw,
          w: g.measureText(word).width + 2 * (0.3 * px + bw),
          h: px * 1.15 + 2 * (0.1 * px + bw),
        };
      });
      const maxW = W - 8 * cqw;
      const gapX = 4.5 * cqw;
      const gapY = 3 * cqmin;
      const lines: (typeof items)[] = [[]];
      let cur = 0;
      for (const it of items) {
        const line = lines[lines.length - 1]!;
        if (line.length && cur + gapX + it.w > maxW) {
          lines.push([it]);
          cur = it.w;
        } else {
          line.push(it);
          cur += (line.length > 1 ? gapX : 0) + it.w;
        }
      }
      const lh = lines.map((l) => Math.max(...l.map((x) => x.h)));
      const total = lh.reduce((a, b) => a + b, 0) + gapY * (lines.length - 1);
      let y = (H - total) / 2;
      lines.forEach((line, li) => {
        const lw = line.reduce((a, x) => a + x.w, 0) + gapX * (line.length - 1);
        let x = (W - lw) / 2;
        for (const it of line) {
          const p = seg(tt, 0.25 + it.i * 0.6, 0.39 + it.i * 0.6);
          const alpha = (p > 0 ? 1 : 0) * (1 - out);
          if (alpha > 0) {
            g.save();
            g.globalAlpha *= alpha;
            g.translate(x + it.w / 2, y + lh[li]! / 2 + dy[it.i]! * cqh);
            g.rotate((rot[it.i]! * Math.PI) / 180);
            const sc = lerp(2.6, 1, E.in(p));
            g.scale(sc, sc);
            const col = it.i === 1 ? s.fg : s.hi;
            g.strokeStyle = col;
            g.lineWidth = it.bw;
            g.beginPath();
            g.roundRect(
              -it.w / 2 + it.bw / 2,
              -it.h / 2 + it.bw / 2,
              it.w - it.bw,
              it.h - it.bw,
              0.16 * it.px,
            );
            g.stroke();
            g.fillStyle = col;
            g.font = fontOf(s, it.px);
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(it.word, 0, 0);
            g.restore();
          }
          x += it.w + gapX;
        }
        y += lh[li]! + gapY;
      });
    },
  },
  {
    id: 'punch',
    group: 'in',
    zh: '衝向鏡頭',
    en: 'Punch in',
    scheme: 'ink',
    words: ['重磅', '注意', '震撼'],
    poster: 0.22,
    len: (w) => 2.1 * w.length,
    draw(s, t) {
      const { W, H } = s;
      const D = 2.1;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const word = pick(s.words, i);
      const px = fit(s, word, 48, 80);
      const out = seg(tt, 1.7, 2.0);
      // 後面三層殘影（j＝3、2、1，強調色）先畫，最上面是主字（j＝0）
      for (const j of [3, 2, 1, 0]) {
        const raw = seg(tt - j * 0.07, 0, 0.55);
        const p = E.expo(raw);
        const sc = lerp(0.06, 1, p) * (1 + E.in(out) * (0.35 + j * 0.22));
        const trail = j
          ? Math.max(0.34 * (1 - seg(tt, 0.42 + j * 0.07, 0.75 + j * 0.07)), out > 0 ? 0.3 * (1 - out) : 0)
          : 1 - out;
        drawWord(s, word, W / 2, H / 2, px, {
          sx: sc,
          sy: sc,
          alpha: raw > 0 ? clamp(trail) : 0,
          color: j ? s.hi : s.fg,
        });
      }
    },
  },
  {
    id: 'stack',
    group: 'in',
    zh: '左右疊字',
    en: 'Side stack',
    scheme: 'cobalt',
    words: ['不是夢', '是預告', '今晚見'],
    poster: 2.2,
    len: () => 3.4,
    draw(s, t) {
      const { W, H, cqw, cqmin } = s;
      const D = 3.4;
      const tt = t % D;
      const out = seg(tt, 3.0, 3.3);
      const lines = [0, 1, 2].map((i) => {
        const word = pick(s.words, i);
        return { word, px: fit(s, word, 25, 74) };
      });
      const gap = 0.6 * cqmin;
      const hs = lines.map((l) => l.px * 1.1);
      let y = (H - (hs.reduce((a, b) => a + b, 0) + gap * 2)) / 2;
      lines.forEach((l, i) => {
        const st = 0.2 + i * 0.55;
        const raw = seg(tt, st, st + 0.32);
        const p = E.out(raw);
        const dir = i % 2 ? 1 : -1;
        const dim = i < 2 ? lerp(1, 0.45, seg(tt, st + 0.55, st + 0.75)) : 1;
        drawWord(s, l.word, W / 2 + dir * lerp(110, 0, p) * cqw, y + hs[i]! / 2, l.px, {
          skew: dir * lerp(-18, 0, p),
          alpha: clamp((raw > 0 ? 1 : 0) * dim * (1 - out)),
          color: i === 1 ? s.hi : s.fg,
        });
        y += hs[i]! + gap;
      });
    },
  },
  {
    id: 'stretch',
    group: 'in',
    zh: '拉長',
    en: 'Stretch',
    scheme: 'verm',
    words: ['長高了'],
    poster: 0.5,
    len: (w) => 4.2 * w.length,
    draw(s, t) {
      const { W, H, cqh } = s;
      const D = 4.2;
      const word = pick(s.words, Math.floor(t / D));
      const px = fit(s, word, 38, 74);
      // 每個字以自己的底部為基準，輪流往上拉長再彈回來
      drawChars(s, word, W / 2, H / 2 + 9 * cqh, px, (j) => {
        const v = Math.pow(Math.max(0, Math.sin(t * 3.6 - j * 0.75)), 2.2);
        return { sx: 1 - 0.22 * v, sy: 1 + v };
      });
    },
  },
  {
    id: 'through',
    group: 'in',
    zh: '穿過去',
    en: 'Fly through',
    scheme: 'paper',
    words: ['入口', '深處', '出口'],
    poster: 1.55,
    len: (w) => 1.9 * w.length,
    draw(s, t) {
      const { W, H } = s;
      const D = 1.9;
      const Hd = 1.25;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const a = pick(s.words, i);
      const b = pick(s.words, i + 1);
      const q = seg(tt, Hd, D);
      // 後面的詞（b）先畫，前面的詞（a）放大到穿過鏡頭
      const sb = lerp(0.35, 1, E.out(q));
      drawWord(s, b, W / 2, H / 2, fit(s, b, 44, 76), { sx: sb, sy: sb, alpha: seg(q, 0.15, 0.6) });
      const sa = 1 + E.in(q) * 16;
      drawWord(s, a, W / 2, H / 2, fit(s, a, 44, 76), { sx: sa, sy: sa, alpha: 1 - seg(q, 0.75, 1) });
    },
  },
  {
    id: 'squash',
    group: 'in',
    zh: '落地回彈',
    en: 'Drop and squash',
    scheme: 'ink',
    words: ['落地', '回彈', '站穩'],
    poster: 1.2,
    len: (w) => 2.2 * w.length,
    draw(s, t) {
      const { W, H, cqh } = s;
      const D = 2.2;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const word = pick(s.words, i);
      const px = fit(s, word, 44, 76);
      const Y: KeyPt[] = [
        [0, -85],
        [0.28, 0, E.in],
        [0.36, 0],
        [0.56, -20, E.out],
        [0.74, 0, E.in],
        [1.82, 0],
        [2.1, -95, E.in],
      ];
      const S: KeyPt[] = [
        [0, 1.25],
        [0.28, 1.25],
        [0.36, 0.5],
        [0.56, 1.12],
        [0.74, 1.05],
        [0.8, 0.78],
        [0.96, 1, E.out],
        [1.72, 1],
        [1.82, 0.62],
        [2.0, 1.3],
      ];
      const sy = keys(tt, S);
      // 以文字底部（字框 92% 處）為基準壓扁
      drawWord(s, word, W / 2, H / 2 + keys(tt, Y) * cqh, px, {
        sx: 1 + (1 - sy) * 0.6,
        sy,
        color: s.hi,
        originY: 0.92,
      });
    },
  },
];
