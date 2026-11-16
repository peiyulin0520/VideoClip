// 恐怖片（57–64）。改寫自 claude-animated-text（MIT，© 2026 pound / POUND0423）。
// 原版用襯線字（Noto Serif）；這裡一律用字卡選的字體。
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
  rnd,
  scratch,
  seg,
  withAlpha,
  type KineticDef,
  type Stage,
} from '../core';

const VERM = '#ff4d2e';
const RAD = Math.PI / 180;

export const FX_HR: KineticDef[] = [
  {
    id: 'flick',
    group: 'hr',
    zh: '燈泡將熄',
    en: 'Dying bulb',
    scheme: 'ink',
    words: ['有人在嗎', '別回頭'],
    poster: 1,
    len: (w) => 3.6 * w.length,
    draw(s, t) {
      const { W, H } = s;
      const D = 3.6;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const st = Math.floor(t * 30);
      const word = pick(s.words, i);
      const px = fit(s, word, 40, 76);
      let o = 1;
      if (tt < 0.2 || tt > 3.3) o = 0.02;
      else if (tt > 2.9) o = rnd(st, 1, 5) < 0.55 ? 0.08 : 1;
      else if (tt > 1.5 && tt < 1.62) o = 0.03;
      else if (rnd(st, 2, 5) < 0.1) o = 0.1;
      // 字有一圈淡淡的光（text-shadow 0 0 .25em，字色 45%）
      drawWord(s, word, W / 2, H / 2, px, { alpha: o, shadow: [withAlpha(s.fg, 0.45), 0.25 * px] });
    },
  },
  {
    id: 'drip',
    group: 'hr',
    zh: '往下滴',
    en: 'Drip',
    scheme: 'paper',
    hi: VERM,
    words: ['午夜', '禁入'],
    poster: 3.2,
    len: (w) => 4.4 * w.length,
    draw(s, t) {
      const { g, W, H, cqh } = s;
      const D = 4.4;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const word = pick(s.words, i);
      const n = cs(word).length;
      const px = fit(s, word, 40, 66);
      const op = seg(tt, 0, 0.3) * (1 - seg(tt, 4.0, 4.35));
      if (op <= 0) return;
      const cy = H / 2 - 12 * cqh;
      g.save();
      g.font = fontOf(s, px, 900);
      const tw = g.measureText(word).width;
      g.restore();
      g.save();
      g.globalAlpha *= op;
      drawWord(s, word, W / 2, cy, px, { color: s.hi });
      // 每個字下面兩條痕跡：位置、粗細、開始時間、長度都是固定亂數（每一句不同）
      g.fillStyle = s.hi;
      const left = W / 2 - tw / 2;
      const top = cy - 0.55 * px + 0.88 * px; // 字框（行高 1.1）往下 80% 處
      for (let j = 0; j < n * 2; j++) {
        const x = left + ((Math.floor(j / 2) + 0.18 + rnd(i, j, 1) * 0.6) / n) * tw;
        const w = (0.05 + rnd(i, j, 2) * 0.06) * px;
        const d = 0.3 + rnd(i, j, 3) * 1.2;
        const len = 0.35 + rnd(i, j, 4) * 1.1;
        const h = len * E.io(seg(tt, d, d + 2.4)) * px;
        if (h <= 0.5) continue;
        // 下面兩個角是圓的（原版 border-radius: 0 0 1em 1em，超過一半寬會被縮成半圓）
        const r = Math.min(w / 2, h);
        g.beginPath();
        g.moveTo(x, top);
        g.lineTo(x + w, top);
        g.lineTo(x + w, top + h - r);
        g.arc(x + w - r, top + h - r, r, 0, Math.PI / 2);
        g.lineTo(x + r, top + h);
        g.arc(x + r, top + h - r, r, Math.PI / 2, Math.PI);
        g.closePath();
        g.fill();
      }
      g.restore();
    },
  },
  {
    id: 'creep',
    group: 'hr',
    zh: '慢慢逼近',
    en: 'Slow creep',
    scheme: 'ink',
    words: ['它靠近了'],
    poster: 3.4,
    len: (w) => 5.2 * w.length,
    draw(s, t) {
      const { W, H, cqmin } = s;
      const D = 5.2;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const st = Math.floor(t * 20);
      const word = pick(s.words, i);
      const px = fit(s, word, 34, 60);
      if (tt < 4.5) {
        const p = tt / 4.5;
        const sc = lerp(0.5, 1.1, p * p);
        drawWord(
          s,
          word,
          W / 2 + (rnd(st, 1, 7) - 0.5) * (0.3 + p) * cqmin,
          H / 2 + (rnd(st, 2, 7) - 0.5) * (0.3 + p) * cqmin,
          px,
          { alpha: lerp(0.15, 1, p), sx: sc, sy: sc },
        );
      } else if (tt < 4.7) {
        // 突然衝到臉上：變強調色、一直放大
        const sc = 3.4 + (tt - 4.5) * 4;
        drawWord(s, word, W / 2, H / 2, px, { sx: sc, sy: sc, color: s.hi });
      }
    },
  },
  {
    id: 'ghost',
    group: 'hr',
    zh: '重影抽搐',
    en: 'Double vision',
    scheme: 'paper',
    hi: VERM,
    words: ['你不是一個人', '看後面'],
    poster: 1,
    len: (w) => 3.4 * w.length,
    draw(s, t) {
      const { W, H, cqmin } = s;
      const D = 3.4;
      const i = Math.floor(t / D);
      const st = Math.floor(t * 24);
      const tw = rnd(Math.floor(t * 3), 1, 9) < 0.32;
      const word = pick(s.words, i);
      const px = fit(s, word, 36, 78);
      const at = (dx: number, dy: number) => [W / 2 + dx * cqmin, H / 2 + dy * cqmin] as const;
      let p1: readonly [number, number];
      let p2: readonly [number, number];
      let pm: readonly [number, number];
      let a1: number;
      let a2: number;
      if (tw) {
        // 抽一下：兩層重影亂跳、本體也左右抖一點
        p1 = at((rnd(st, 1, 8) - 0.5) * 12, (rnd(st, 2, 8) - 0.5) * 4);
        p2 = at((rnd(st, 3, 8) - 0.5) * 12, (rnd(st, 4, 8) - 0.5) * 4);
        pm = at((rnd(st, 5, 8) - 0.5) * 2, 0);
        a1 = 0.7;
        a2 = 0.4;
      } else {
        // 平常：兩層重影慢慢飄
        p1 = at(Math.sin(t * 1.3) * 1.4, Math.cos(t * 1.1) * 0.9);
        p2 = at(-Math.sin(t * 1.1) * 1.6, Math.cos(t * 1.5) * 0.7);
        pm = at(0, 0);
        a1 = 0.45;
        a2 = 0.22;
      }
      drawWord(s, word, p1[0], p1[1], px, { color: s.hi, alpha: a1 });
      drawWord(s, word, p2[0], p2[1], px, { alpha: a2 });
      drawWord(s, word, pm[0], pm[1], px);
    },
  },
  {
    id: 'corrupt',
    group: 'hr',
    zh: '字被換掉',
    en: 'Corrupt',
    scheme: 'ink',
    words: ['你在看我', '我在看你'],
    poster: 2.4,
    len: (w) => 4.4 * w.length,
    draw(s, t) {
      const { W, H } = s;
      const D = 4.4;
      const Wd = s.words;
      const n = clamp(Math.max(...Wd.map((w) => cs(w).length)), 1, 10);
      const pool = cs(Wd.join('')).filter((x) => x.trim());
      const px = fitN(s, n, 40, 80);
      const k = Math.floor(t / D);
      const tt = t - k * D;
      const A = cs(pick(Wd, k));
      const B = cs(pick(Wd, k + 1));
      const st = Math.floor(t * 14);
      const chars: string[] = [];
      const hot: boolean[] = [];
      for (let j = 0; j < n; j++) {
        const sj = 1.2 + rnd(k, j, 1) * 2;
        let ch: string | undefined;
        let h = false;
        if (tt < sj - 0.55) ch = A[j];
        else if (tt < sj) {
          h = true;
          const v = rnd(st, j, 2);
          ch = v < 0.4 ? A[j] : v < 0.75 ? B[j] : pool[Math.floor(rnd(st, j, 3) * pool.length)];
        } else ch = B[j];
        chars.push(ch || '　');
        hot.push(h);
      }
      drawChars(s, chars.join(''), W / 2, H / 2, px, (j) => ({ color: hot[j] ? s.hi : s.fg }));
    },
  },
  {
    id: 'mirror',
    group: 'hr',
    zh: '鏡中倒影',
    en: 'Mirror',
    scheme: 'paper',
    words: ['鏡子裡', '不是你'],
    poster: 1,
    len: (w) => 3.2 * w.length,
    draw(s, t) {
      const { g, W, H } = s;
      const D = 3.2;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const word = pick(s.words, i);
      const px = fit(s, word, 30, 74);
      const fl = (x: number) => (x > 1.4 && x < 1.52) || (x > 2.2 && x < 2.27);
      // 上面主字、下面倒影（兩行各 1.1em 高、貼在一起）
      drawWord(s, word, W / 2, H / 2 - 0.55 * px, px, { sx: fl(tt) ? -1 : 1 });
      // 倒影：先在暫存畫布（只開字那一條的大小）畫正的字，再做「上面透明、下面慢慢實」的遮罩，最後上下翻過來（慢半拍才左右翻、傾斜一點）貼上去
      const bh = Math.ceil(1.4 * px);
      const cv = scratch(W, bh);
      const c = cv.getContext('2d')!;
      drawWord({ ...s, g: c } as Stage, word, W / 2, bh / 2, px);
      c.globalCompositeOperation = 'destination-in';
      const gr = c.createLinearGradient(0, bh / 2 - 0.55 * px, 0, bh / 2 + 0.55 * px);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(0.25, 'rgba(0,0,0,0)');
      gr.addColorStop(0.95, 'rgba(0,0,0,1)');
      gr.addColorStop(1, 'rgba(0,0,0,1)');
      c.fillStyle = gr;
      c.fillRect(0, 0, W, bh);
      g.save();
      g.globalAlpha *= 0.3;
      g.translate(W / 2, H / 2 + 0.55 * px);
      g.scale(fl(tt - 0.3) ? -1 : 1, -1);
      g.transform(1, 0, Math.tan(Math.sin(t * 2) * 5 * RAD), 1, 0, 0);
      g.drawImage(cv, -W / 2, -bh / 2);
      g.restore();
    },
  },
  {
    id: 'torch',
    group: 'hr',
    zh: '手電筒',
    en: 'Flashlight',
    scheme: 'ink',
    words: ['不要開燈', '牆上有字'],
    poster: 1.3,
    area: 'full',
    hit: [0, 0.3, 1, 0.4],
    len: (w) => 5 * w.length,
    draw(s, t) {
      const { g, W, H, cqmin } = s;
      const D = 5;
      const i = Math.floor(t / D);
      const word = pick(s.words, i);
      const px = fit(s, word, 36, 78);
      const x = ((50 + 36 * Math.sin(t * 1.1) + 5 * Math.sin(t * 3.7)) / 100) * W;
      const y = ((50 + 20 * Math.sin(t * 1.7 + 1)) / 100) * H;
      const r2 = 30 * cqmin;
      // 光暈：字色 13% 淡到透明
      const beam = g.createRadialGradient(x, y, 0, x, y, r2);
      beam.addColorStop(0, withAlpha(s.fg, 0.13));
      beam.addColorStop(1, withAlpha(s.fg, 0));
      g.fillStyle = beam;
      g.fillRect(0, 0, W, H);
      // 暗處幾乎看不到（5%）
      drawWord(s, word, W / 2, H / 2, px, { alpha: 0.05 });
      // 光圈照到的地方：15cqmin 內全亮，到 30cqmin 淡掉（暫存畫布只開字那一條的大小）
      const bh = Math.min(H, Math.ceil(1.4 * px));
      const top = Math.round(H / 2 - bh / 2);
      const cv = scratch(W, bh);
      const c = cv.getContext('2d')!;
      drawWord({ ...s, g: c } as Stage, word, W / 2, H / 2 - top, px);
      c.globalCompositeOperation = 'destination-in';
      const mg = c.createRadialGradient(x, y - top, 0, x, y - top, r2);
      mg.addColorStop(0, 'rgba(0,0,0,1)');
      mg.addColorStop(0.5, 'rgba(0,0,0,1)');
      mg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = mg;
      c.fillRect(0, 0, W, bh);
      g.drawImage(cv, 0, top);
    },
  },
  {
    id: 'melt',
    group: 'hr',
    zh: '融化拉長',
    en: 'Melt',
    scheme: 'verm',
    words: ['快逃', '來不及了'],
    poster: 2.8,
    len: (w) => 4.2 * w.length,
    draw(s, t) {
      const { W, H, cqh } = s;
      const D = 4.2;
      const k = Math.floor(t / D);
      const tt = t - k * D;
      const word = pick(s.words, k);
      const px = fit(s, word, 34, 74);
      const p = E.in(seg(tt, 0.5, 3.6));
      const op = seg(tt, 0, 0.25) * (1 - seg(tt, 3.7, 4.15));
      if (op <= 0) return;
      // 每個字從上緣（10%）往下被拉長、越拉越歪
      drawChars(
        s,
        word,
        W / 2,
        H / 2 - 14 * cqh,
        px,
        (j) => ({
          skew: Math.sin(t * 2 + j) * p * 6,
          sx: 1 - p * 0.12,
          sy: 1 + p * (0.8 + rnd(k, j, 1) * 1.6),
          alpha: op,
        }),
        { originY: 0.1 },
      );
    },
  },
];
