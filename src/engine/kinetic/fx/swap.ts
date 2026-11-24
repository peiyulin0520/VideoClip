// 切換（17–24）。改寫自 claude-animated-text（MIT，© 2026 pound / POUND0423）。
import {
  clamp,
  cs,
  drawRotY,
  drawWord,
  E,
  fitN,
  fit,
  fontOf,
  lerp,
  marquee,
  pick,
  rnd,
  scratch,
  seg,
  wlen,
  wrapLines,
  type KineticDef,
  type Stage,
} from '../core';

const maxChars = (words: string[]) => Math.max(...words.map((w) => cs(w).length));
const poolOf = (words: string[]) => cs(words.join('')).filter((x) => x.trim());

/** 一排方牌（原版 .tiles／.tile）：每塊寬 1.22em、高 1.42em、間隔 .12em，底色＝主文字色、字用對比色，小圓角 */
function tileLayout(s: Stage, px: number, n: number) {
  const tw = 1.22 * px;
  const th = 1.42 * px;
  const gap = 0.12 * px;
  const total = n * tw + (n - 1) * gap;
  const x0 = (s.W - total) / 2;
  return { tw, th, cx: (i: number) => x0 + i * (tw + gap) + tw / 2, cy: s.H / 2 };
}
function tileBg(g: CanvasRenderingContext2D, color: string, tw: number, th: number, px: number) {
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(-tw / 2, -th / 2, tw, th, 0.08 * px);
  g.fill();
}
/** 方牌裡的字（字高 .84em、粗體、置中） */
function tileChar(s: Stage, ch: string, px: number, color: string, dy = 0, sy = 1) {
  const { g } = s;
  g.save();
  g.translate(0, dy);
  g.scale(1, sy);
  g.font = fontOf(s, px * 0.84);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(ch, 0, 0);
  g.restore();
}

export const FX_SWAP: KineticDef[] = [
  {
    id: 'flap',
    group: 'swap',
    zh: '翻牌看板',
    en: 'Split flap',
    scheme: 'ink',
    words: ['即將抵達', '開往花蓮', '請勿奔跑'],
    poster: 2.6,
    len: (w) => 3.2 * w.length,
    // 最後一個詞每一格牌都翻定了（第 i 格 0.35 + i×0.28 秒翻定）
    hold: (w) => 3.2 * (w.length - 1) + 0.35 + (clamp(maxChars(w), 1, 7) - 1) * 0.28 + 0.3,
    draw(s, t) {
      const { g } = s;
      const n = clamp(maxChars(s.words), 1, 7);
      const pool = poolOf(s.words);
      const px = fitN(s, n * 1.34, 30, 80);
      const L = tileLayout(s, px, n);
      const ink = s.paper;
      const D = 3.2;
      const rate = 11;
      const k = Math.floor(t / D);
      const tt = t - k * D;
      const target = cs(pick(s.words, k));
      for (let i = 0; i < n; i++) {
        const dur = 0.35 + i * 0.28;
        let ch: string;
        let sy: number;
        if (tt < dur) {
          const st = tt * rate;
          const si = Math.floor(st);
          ch = pool[Math.floor(rnd(k, i, si) * pool.length)]!;
          sy = 0.12 + 0.88 * Math.abs(Math.sin((st - si) * Math.PI));
        } else {
          ch = target[i] || '　';
          const lt = tt - dur;
          sy = lt < 0.09 ? 0.12 + 0.88 * Math.sin(((lt / 0.09) * Math.PI) / 2) : 1;
        }
        g.save();
        g.translate(L.cx(i), L.cy);
        tileBg(g, s.fg, L.tw, L.th, px);
        g.beginPath();
        g.roundRect(-L.tw / 2, -L.th / 2, L.tw, L.th, 0.08 * px);
        g.clip();
        tileChar(s, ch, px, ink, 0, sy);
        // 牌面中間那條細縫
        g.globalAlpha *= 0.32;
        g.fillStyle = ink;
        g.fillRect(-L.tw / 2, -0.01 * px, L.tw, 0.02 * px);
        g.restore();
      }
    },
  },
  {
    id: 'flip',
    group: 'swap',
    zh: '翻卡',
    en: 'Card flip',
    scheme: 'cobalt',
    words: ['春日限定', '夏夜特映', '秋季新番', '冬眠計畫'],
    poster: 1,
    // 每個詞一輪（翻到下一個詞）：總長是詞數 × 一輪
    len: (w) => (1.5 + 0.5 + (clamp(maxChars(w), 1, 7) - 1) * 0.1 + 0.1) * w.length,
    // 最後一個詞停著、還沒開始翻（1.5 秒才開始翻）
    hold: (w) => (1.5 + 0.5 + (clamp(maxChars(w), 1, 7) - 1) * 0.1 + 0.1) * (w.length - 1) + 1.2,
    draw(s, t) {
      const { g } = s;
      const n = clamp(maxChars(s.words), 1, 7);
      const px = fitN(s, n * 1.34, 30, 80);
      const L = tileLayout(s, px, n);
      const ink = s.paper;
      const H = 1.5;
      const D = H + 0.5 + (n - 1) * 0.1 + 0.1;
      const k = Math.floor(t / D);
      const tt = t - k * D;
      const A = cs(pick(s.words, k));
      const B = cs(pick(s.words, k + 1));
      const w = Math.ceil(L.tw);
      const h = Math.ceil(L.th);
      for (let i = 0; i < n; i++) {
        const a = 180 * E.io(seg(tt, H + i * 0.1, H + i * 0.1 + 0.5));
        const ch = (a < 90 ? A[i] : B[i]) || '　';
        // 先把方牌（底色＋字）畫在暫存畫布上，再轉過來（繞垂直軸＋透視）
        const cv = scratch(w, h);
        const c2 = cv.getContext('2d')!;
        c2.save();
        c2.translate(w / 2, h / 2);
        tileBg(c2, s.fg, w, h, px);
        c2.restore();
        const sub = { ...s, g: c2 } as Stage;
        c2.save();
        c2.translate(w / 2, h / 2);
        tileChar(sub, ch, px, ink);
        c2.restore();
        drawRotY(g, cv, L.cx(i), L.cy, L.tw, L.th, a < 90 ? a : a - 180, 0.44 * s.W);
      }
    },
  },
  {
    id: 'type',
    group: 'swap',
    zh: '打字機',
    en: 'Typewriter',
    scheme: 'paper',
    words: ['凌晨三點，還醒著', '再寫一行就睡'],
    poster: 1.6,
    len: (w) => w.reduce((a, x) => a + cs(x).length / 7 + 1.1 + cs(x).length / 18 + 0.35, 0),
    draw(s, t) {
      const { g, W, H, cqmin, cqw } = s;
      const P = s.words.map(cs);
      const maxw = Math.max(...s.words.map(wlen));
      // 字大小照最長的句子縮到放得下，但不小於 8cqmin；還是放不下就換行（不再縮到看不清）
      const px = Math.max(Math.min(24 * cqmin, (84 / (Math.max(maxw, 3) + 0.6)) * cqw), 8 * cqmin);
      const T = P.map((p) => p.length / 7 + 1.1 + p.length / 18 + 0.35);
      const total = T.reduce((a, b) => a + b, 0);
      let tt = t % total;
      let k = 0;
      while (k < T.length - 1 && tt >= T[k]!) {
        tt -= T[k]!;
        k++;
      }
      const p = P[k]!;
      const n = p.length;
      const tin = n / 7;
      let c: number;
      if (tt < tin) c = Math.floor(tt * 7) + 1;
      else if (tt < tin + 1.1) c = n;
      else c = Math.max(0, n - Math.floor((tt - tin - 1.1) * 18));
      const typed = Math.min(n, c);
      g.font = fontOf(s, px, 700);
      // 整句先換好行（版面不會因為打了幾個字而跳），再露出前 typed 個字
      const lines = wrapLines(g, p.join(''), 84 * cqw);
      const lh = px * 1.3;
      const blockW =
        lines.length > 1 ? Math.max(...lines.map((l) => g.measureText(l).width)) : (maxw + 0.4) * px;
      const x0 = (W - blockW) / 2;
      const y0 = (H - lines.length * lh) / 2;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = s.fg;
      let left = typed;
      let cx = x0;
      let cyl = y0 + lh / 2;
      lines.forEach((line, li) => {
        const chars = cs(line);
        const show = chars.slice(0, Math.max(0, Math.min(left, chars.length))).join('');
        g.fillText(show, x0, y0 + li * lh + lh / 2);
        if (left >= 0 && left <= chars.length && (li === lines.length - 1 || left < chars.length)) {
          if (left >= 0 && cx === x0 && (left < chars.length || li === lines.length - 1)) {
            cx = x0 + g.measureText(show).width;
            cyl = y0 + li * lh + lh / 2;
          }
        }
        left -= chars.length;
      });
      // 句尾的游標（強調色直線）：停住時閃爍
      const blink = tt > tin && tt < tin + 1.1 ? (Math.floor(t * 2.5) % 2 ? 0 : 1) : 1;
      if (blink) {
        g.fillStyle = s.hi;
        g.fillRect(cx + 0.08 * px, cyl - 0.37 * px, 0.09 * px, px);
      }
    },
  },
  {
    id: 'slot',
    group: 'swap',
    zh: '拉霸',
    en: 'Slot reel',
    scheme: 'verm',
    words: ['好運到', '大滿貫', '再一次'],
    poster: 3,
    // 每個詞一輪：每一欄依序停下來（最後一欄 1 + (n−1)×0.5 秒停），再閃一下
    len: (w) => (1.0 + (clamp(maxChars(w), 1, 6) - 1) * 0.5 + 1.3) * w.length,
    hold: (w) =>
      (1.0 + (clamp(maxChars(w), 1, 6) - 1) * 0.5 + 1.3) * (w.length - 1) +
      1.0 +
      (clamp(maxChars(w), 1, 6) - 1) * 0.5 +
      0.9,
    draw(s, t) {
      const { g } = s;
      const n = clamp(maxChars(s.words), 1, 6);
      const pool = poolOf(s.words);
      const px = fitN(s, n * 1.34, 34, 76);
      const L = tileLayout(s, px, n);
      const ink = s.paper;
      const last = 1.0 + (n - 1) * 0.5;
      const D = last + 1.3;
      const k = Math.floor(t / D);
      const tt = t - k * D;
      const target = cs(pick(s.words, k));
      const flash = tt > last && tt < last + 0.6 && Math.floor((tt - last) * 7) % 2 === 0;
      for (let i = 0; i < n; i++) {
        const N = 10 + i * 5;
        const pos = N * (1 - E.out(seg(tt, 0, 1.0 + i * 0.5)));
        const ri = Math.floor(pos);
        const f = pos - ri;
        const a = ri === 0 ? target[i] || '　' : pool[Math.floor(rnd(k, i, ri) * pool.length)]!;
        const b = pool[Math.floor(rnd(k, i, ri + 1) * pool.length)]!;
        g.save();
        g.translate(L.cx(i), L.cy);
        tileBg(g, s.fg, L.tw, L.th, px);
        g.beginPath();
        g.roundRect(-L.tw / 2, -L.th / 2, L.tw, L.th, 0.08 * px);
        g.clip();
        const col = flash ? s.hi : ink;
        tileChar(s, a, px, col, -f * L.th);
        tileChar(s, b, px, col, (1 - f) * L.th);
        g.restore();
      }
    },
  },
  {
    id: 'odo',
    group: 'swap',
    zh: '跳錶',
    en: 'Odometer',
    scheme: 'paper',
    words: ['累積觀看', '次'],
    num: '36920',
    poster: 3,
    len: () => 3.8,
    draw(s, t) {
      const { g, W, H } = s;
      const found = s.words.join(' ').match(/\d[\d,]*/);
      const num = (found ? found[0].replace(/,/g, '') : '36920').slice(0, 8).replace(/^0+(?=\d)/, '');
      const fmt = Number(num).toLocaleString('en-US');
      const labels = s.words.map((w) => w.replace(/\d[\d,]*/g, '').trim()).filter(Boolean);
      const pre = labels[0] || '';
      const post = labels[1] || '';
      const digits = cs(fmt).filter((c) => c !== ',').length;
      const commas = cs(fmt).length - digits;
      const em = digits * 0.86 + commas * 0.3 + (wlen(pre) + wlen(post)) * 0.34 + 1.2;
      const px = fitN(s, em, 26, 86);
      const D = 3.8;
      const tt = t % D;
      const ink = s.paper;
      const dw = 0.8 * px;
      const dh = 1.25 * px;
      const small = 0.34 * px;
      // 先量出整排的寬度（標籤、數字欄、逗號、標籤；欄與欄、標籤之間的間隔照原版）
      g.font = fontOf(s, small, 700);
      const preW = pre ? g.measureText(pre).width : 0;
      const postW = post ? g.measureText(post).width : 0;
      g.font = fontOf(s, px, 900);
      const commaW = g.measureText(',').width;
      const items: ('d' | ',')[] = cs(fmt).map((c) => (c === ',' ? ',' : 'd'));
      const numW =
        items.reduce((a, it) => a + (it === 'd' ? dw : commaW), 0) + (items.length - 1) * 0.06 * px;
      const gap = 0.3 * px;
      const total = (pre ? preW + gap : 0) + numW + (post ? gap + postW : 0);
      let x = (W - total) / 2;
      const cy = H / 2;
      g.textBaseline = 'middle';
      if (pre) {
        g.font = fontOf(s, small, 700);
        g.fillStyle = s.fg;
        g.textAlign = 'left';
        g.fillText(pre, x, cy);
        x += preW + gap;
      }
      let col = 0;
      const digitsArr = cs(fmt)
        .filter((c) => c !== ',')
        .map((c) => +c);
      items.forEach((it) => {
        if (it === ',') {
          g.font = fontOf(s, px, 900);
          g.fillStyle = s.fg;
          g.textAlign = 'left';
          g.fillText(',', x, cy + dh * 0.18);
          x += commaW + 0.06 * px;
          return;
        }
        const i = col++;
        const v = (digitsArr[i]! + 10 * (2 + i)) * E.out(seg(tt, 0.1, 1.5 + i * 0.18));
        const pos = v % 10;
        g.save();
        g.translate(x + dw / 2, cy);
        g.fillStyle = s.fg;
        g.beginPath();
        g.roundRect(-dw / 2, -dh / 2, dw, dh, 0.08 * px);
        g.fill();
        g.clip();
        g.font = fontOf(s, px, 900);
        g.textAlign = 'center';
        g.fillStyle = ink;
        for (let j = 0; j <= 10; j++) g.fillText(String(j % 10), 0, (j - pos) * dh);
        g.restore();
        x += dw + 0.06 * px;
      });
      if (post) {
        g.font = fontOf(s, small, 700);
        g.fillStyle = s.fg;
        g.textAlign = 'left';
        g.fillText(post, x - 0.06 * px + gap, cy);
      }
    },
  },
  {
    id: 'swapline',
    group: 'swap',
    zh: '標題輪替',
    en: 'Headline swap',
    scheme: 'ink',
    words: ['颱風轉向', '明日放晴', '票已售完'],
    label: '速報',
    sub: '速報',
    poster: 0.8,
    len: (w) => 1.8 * w.length,
    draw(s, t) {
      const { g, W, H } = s;
      const label = s.sub ?? '速報';
      const maxw = Math.max(...s.words.map(wlen));
      const px = fitN(s, maxw + wlen(label) + 2.2, 21, 84);
      const D = 1.8;
      const Hd = 1.3;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const a = pick(s.words, i);
      const b = pick(s.words, i + 1);
      const q = E.io(seg(tt, Hd, D));
      g.font = fontOf(s, px);
      const labW = g.measureText(label).width + 2 * (0.32 * px + 0.08 * px);
      const winW = (maxw + 0.9) * px;
      const winH = 1.66 * px;
      const gap = 0.28 * px;
      const total = labW + gap + winW;
      const x0 = (W - total) / 2;
      const cy = H / 2;
      // 左邊固定的外框標籤
      g.strokeStyle = s.fg;
      g.lineWidth = 0.08 * px;
      g.strokeRect(x0 + 0.04 * px, cy - winH / 2 + 0.04 * px, labW - 0.08 * px, winH - 0.08 * px);
      g.fillStyle = s.fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, x0 + labW / 2, cy);
      // 右邊強調色的窗，兩個詞上下滑動換
      const wx = x0 + labW + gap;
      g.fillStyle = s.hi;
      g.fillRect(wx, cy - winH / 2, winW, winH);
      g.save();
      g.beginPath();
      g.rect(wx, cy - winH / 2, winW, winH);
      g.clip();
      g.fillStyle = s.hifg;
      g.fillText(a, wx + winW / 2, cy - q * winH);
      g.fillText(b, wx + winW / 2, cy + (1 - q) * winH);
      g.restore();
    },
  },
  {
    id: 'led',
    group: 'swap',
    zh: '點陣看板',
    en: 'Dot matrix',
    scheme: 'ink',
    words: ['下一站', '台南', '請準備下車'],
    poster: 1,
    area: 'full',
    len: () => null,
    hit: [0, 0.25, 1, 0.5],
    draw(s, t) {
      const { g, W, H, cqmin } = s;
      const d = 2.7 * cqmin; // 燈點的間距
      // 一顆燈點的遮罩（中間實心、邊緣很快淡掉）：原版 radial-gradient(circle, #000 0 44%, transparent 50%)
      const dot = Math.max(Math.round(d), 2);
      const tile = document.createElement('canvas');
      tile.width = tile.height = dot;
      const tg = tile.getContext('2d')!;
      const r = (dot * Math.SQRT2) / 2;
      const gr = tg.createRadialGradient(dot / 2, dot / 2, 0, dot / 2, dot / 2, r);
      gr.addColorStop(0.44, 'rgba(0,0,0,1)');
      gr.addColorStop(0.5, 'rgba(0,0,0,0)');
      tg.fillStyle = gr;
      tg.fillRect(0, 0, dot, dot);
      const pat = g.createPattern(tile, 'repeat')!;
      // 沒亮的燈點：強調色 16%
      const bgc = scratch(W, H);
      const bg = bgc.getContext('2d')!;
      bg.fillStyle = s.hi;
      bg.fillRect(0, 0, W, H);
      bg.globalCompositeOperation = 'destination-in';
      bg.fillStyle = pat;
      bg.fillRect(0, 0, W, H);
      g.save();
      g.globalAlpha *= 0.16;
      g.drawImage(bgc, 0, 0);
      g.restore();
      // 亮的燈點：字（強調色、字高 46cqmin）只透過燈點的洞露出來，橫向一格一格跑
      const txt = scratch(W, H);
      const tc = txt.getContext('2d')!;
      const sub = { ...s, g: tc } as Stage;
      const step = 2.7 / 46;
      marquee(
        sub,
        s.words.join('　') + '　　',
        Math.round((t * 1.25) / step) * step,
        46 * cqmin,
        { x: 0, y: 0, w: W, h: H },
        { min: 12, color: s.hi, weight: 900 },
      );
      tc.globalCompositeOperation = 'destination-in';
      tc.fillStyle = pat;
      tc.fillRect(0, 0, W, H);
      g.drawImage(txt, 0, 0);
    },
  },
  {
    id: 'split',
    group: 'swap',
    zh: '上下裂開',
    en: 'Split reveal',
    scheme: 'cobalt',
    words: ['結束', '開始'],
    poster: 1.9,
    len: (w) => 2.2 * w.length,
    draw(s, t) {
      const { W, H, cqw, cqh } = s;
      const D = 2.2;
      const Hd = 1.45;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const w1 = pick(s.words, i);
      const w2 = pick(s.words, i + 1);
      const c1 = i % 2 ? s.hi : s.fg;
      const c2 = i % 2 ? s.fg : s.hi;
      const p1 = fit(s, w1, 46, 78);
      const p2 = fit(s, w2, 46, 78);
      const q = E.io(seg(tt, Hd, D - 0.1));
      // 下一個詞在後面慢慢放大浮現
      const sc = lerp(0.7, 1, q);
      drawWord(s, w2, W / 2, H / 2, p2, { color: c2, sx: sc, sy: sc, alpha: seg(q, 0.1, 0.7) });
      // 目前的詞從水平中線裂成上下兩半，一個往左上、一個往右下飛出
      drawWord(s, w1, W / 2 - q * 12 * cqw, H / 2 - q * 62 * cqh, p1, { color: c1, clip: [-30, 50] });
      drawWord(s, w1, W / 2 + q * 12 * cqw, H / 2 + q * 62 * cqh, p1, { color: c1, clip: [50, 130] });
    },
  },
];
