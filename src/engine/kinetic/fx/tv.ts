// 綜藝字卡（49–56）。改寫自 claude-animated-text（MIT，© 2026 pound / POUND0423）。
// 原版的 .vt：字是填色、外面一圈粗框（-webkit-text-stroke .16em，paint-order: stroke fill）→ drawWord 的 vt。
import {
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
  scratch,
  seg,
  sentenceAt,
  wlen,
  type KeyPt,
  type KineticDef,
} from '../core';

const VERM = '#ff4d2e';
const RAD = Math.PI / 180;

/** 一個一個字的寬度（px） */
function charWidths(g: CanvasRenderingContext2D, str: string) {
  return cs(str).reduce((a, c) => a + g.measureText(c).width, 0);
}

export const FX_TV: KineticDef[] = [
  {
    id: 'vpop',
    group: 'tv',
    zh: '彈出字卡',
    en: 'Pop caption',
    scheme: 'verm',
    words: ['太扯了', '真的假的', '笑死'],
    poster: 1,
    len: (w) => 2.2 * w.length,
    draw(s, t) {
      const { W, H } = s;
      const D = 2.2;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const word = pick(s.words, i);
      const px = fit(s, word, 40, 70);
      const out = E.in(seg(tt, 1.85, 2.1));
      const sc = E.el(seg(tt, 0, 0.7)) * (1 - out);
      if (sc <= 0.001) return;
      drawWord(s, word, W / 2, H / 2, px, {
        sx: sc,
        sy: sc,
        rot: Math.sin(tt * 10) * 5 * (1 - seg(tt, 0.2, 1.1)) + (i % 2 ? 3 : -3),
        color: s.hi,
        vt: s.fg,
      });
    },
  },
  {
    id: 'slam',
    group: 'tv',
    zh: '斜砸下來',
    en: 'Diagonal slam',
    scheme: 'ink',
    words: ['才怪', '並沒有', '想太多'],
    poster: 1,
    len: (w) => 2.2 * w.length,
    draw(s, t) {
      const { g, W, H, cqmin, cqw, cqh } = s;
      const D = 2.2;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const st = Math.floor(t * 30);
      const word = pick(s.words, i);
      const px = fit(s, word, 40, 68);
      const p = E.in(seg(tt, 0, 0.16));
      const sh = tt > 0.16 ? 1 - seg(tt, 0.16, 0.55) : 0;
      const q = E.in(seg(tt, 1.8, 2.1));
      // 砸到的那一瞬間整個畫面閃成字色，之後震幾下
      if (tt > 0.16 && tt < 0.23) {
        g.fillStyle = s.fg;
        g.fillRect(0, 0, W, H);
      }
      const jx = (rnd(st, 1, 3) - 0.5) * sh * 5 * cqmin;
      const jy = (rnd(st, 2, 3) - 0.5) * sh * 5 * cqmin;
      const sc = lerp(2.4, 1, p);
      drawWord(
        s,
        word,
        W / 2 + jx + lerp(70, 0, p) * cqw,
        H / 2 + jy + (lerp(-80, 0, p) + q * 130) * cqh,
        px,
        { rot: -7 + q * 25, sx: sc, sy: sc, color: s.hi, vt: s.fg },
      );
    },
  },
  {
    id: 'lines',
    group: 'tv',
    zh: '集中線',
    en: 'Speed lines',
    scheme: 'paper',
    hi: VERM,
    words: ['震驚', '什麼'],
    poster: 1,
    area: 'full',
    hit: [0, 0.25, 1, 0.5],
    len: (w) => 2.4 * w.length,
    draw(s, t) {
      const { g, W, H } = s;
      const D = 2.4;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const st = Math.floor(t * 12);
      const word = pick(s.words, i);
      const px = fit(s, word, 38, 56);
      const a = rnd(st, 1, 2) * 360;
      const sc = 1 + 0.06 * rnd(st, 2, 2);
      // 兩層放射線（每 7° 一條 0.9° 寬、每 11° 一條 1.5° 寬，第二層起點是第一層的 1.7 倍），中間挖空（橢圓遮罩）
      // 放射線很細、又會淡出，用一半的解析度畫再放大（省 4 倍的力氣）
      const cv = scratch(Math.ceil(W / 2), Math.ceil(H / 2));
      const c = cv.getContext('2d')!;
      const R = Math.hypot(W, H);
      c.scale(0.5, 0.5);
      c.translate(W / 2, H / 2);
      c.scale(sc, sc);
      c.fillStyle = s.fg;
      const rays = (from: number, step: number, width: number) => {
        for (let k = 0; k * step < 360; k++) {
          const a0 = (from + k * step - 90) * RAD;
          const a1 = (from + k * step + Math.min(width, 360 - k * step) - 90) * RAD;
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
          c.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
          c.closePath();
          c.fill();
        }
      };
      rays(a, 7, 0.9);
      rays(a * 1.7, 11, 1.5);
      // 遮罩：橢圓（原版元素是 150% 大，最遠角的橢圓），30% 以內全透明、66% 以外全實
      c.globalCompositeOperation = 'destination-in';
      c.setTransform(sc * 0.375 * W * Math.SQRT2, 0, 0, sc * 0.375 * H * Math.SQRT2, W / 4, H / 4);
      const gr = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(0.3, 'rgba(0,0,0,0)');
      gr.addColorStop(0.66, 'rgba(0,0,0,1)');
      gr.addColorStop(1, 'rgba(0,0,0,1)');
      c.fillStyle = gr;
      c.fillRect(-5, -5, 10, 10);
      g.drawImage(cv, 0, 0, W, H);
      const z = E.back(seg(tt, 0, 0.3)) * (1 + 0.05 * Math.sin(t * 16));
      drawWord(s, word, W / 2, H / 2, px, { sx: z, sy: z, color: s.hi, vt: s.fg });
    },
  },
  {
    id: 'marks',
    group: 'tv',
    zh: '問號驚嘆號',
    en: 'Reaction marks',
    scheme: 'cobalt',
    words: ['蛤', '是喔', '等一下'],
    poster: 1.7,
    len: (w) => 2.6 * w.length,
    draw(s, t) {
      const { W, H, cqmin } = s;
      const D = 2.6;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const word = pick(s.words, i);
      const px = fit(s, word, 36, 42);
      const out = seg(tt, 2.35, 2.55);
      const P: [string, number, number, number][] = [
        ['？', 33, -19, 14],
        ['！', -34, -17, -16],
        ['？！', 40, 14, 8],
      ];
      P.forEach(([m, dx, dy, r], j) => {
        const sc = E.back(seg(tt, 0.55 + j * 0.32, 0.8 + j * 0.32)) * (1 - out);
        if (sc <= 0) return;
        drawWord(s, m, W / 2 + dx * cqmin, H / 2 + dy * cqmin, 24 * cqmin, {
          rot: r + Math.sin(t * 7 + j) * 6,
          sx: sc,
          sy: sc,
          color: s.fg,
          vt: s.hi,
        });
      });
      const z = E.back(seg(tt, 0, 0.3)) * (1 - out);
      if (z > 0) drawWord(s, word, W / 2, H / 2, px, { sx: z, sy: z, color: s.fg, vt: s.hi });
    },
  },
  {
    id: 'telop',
    group: 'tv',
    zh: '字卡條',
    en: 'Telop bar',
    scheme: 'ink',
    words: ['今日挑戰', '限時三分鐘', '失敗要受罰'],
    poster: 1.2,
    len: (w) => 2.6 * w.length,
    draw(s, t) {
      const { g, W, H, cqw } = s;
      const D = 2.6;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const word = pick(s.words, i);
      const px = fitN(s, wlen(word) + 1.2, 30, 84);
      g.save();
      g.font = fontOf(s, px, 900);
      const bw = charWidths(g, word) + px; // 左右各 .5em
      const bh = 1.48 * px; // 行高 1.2em ＋ 上下各 .14em
      g.translate(W / 2 + E.in(seg(tt, 2.2, 2.55)) * 130 * cqw, H / 2);
      g.rotate(-3 * RAD);
      const sx = E.out(seg(tt, 0, 0.3));
      if (sx > 0) {
        g.save();
        g.translate(-bw / 2, 0);
        g.transform(1, 0, Math.tan(-10 * RAD), 1, 0, 0);
        g.fillStyle = s.hi;
        g.fillRect(0, -bh / 2, bw * sx, bh);
        g.restore();
      }
      drawChars(
        s,
        word,
        0,
        0,
        px,
        (j) => {
          const p = E.back(seg(tt, 0.2 + j * 0.06, 0.44 + j * 0.06));
          const z = Math.max(0, p);
          return { sx: z, sy: z, dy: (1 - p) * 0.45 * 1.2 * px, color: s.hifg, alpha: z > 0 ? 1 : 0 };
        },
        { originY: 0.88 },
      );
      g.restore();
    },
  },
  {
    id: 'emph',
    group: 'tv',
    zh: '關鍵字放大',
    en: 'Keyword zoom',
    scheme: 'verm',
    words: ['其實', '超好吃', '結果', '全吃光'],
    poster: 1.5,
    len: (w) => 2.8 * Math.max(1, Math.ceil(w.length / 2)),
    draw(s, t) {
      const { g, W, H } = s;
      const D = 2.8;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const s1 = pick(s.words, 2 * i);
      const s2 = pick(s.words, 2 * i + 1);
      const px = fitN(s, wlen(s1) * 0.5 + wlen(s2) * 1.35 + 0.6, 40, 82);
      g.save();
      g.font = fontOf(s, px * 0.5, 900);
      const wa = g.measureText(s1).width;
      g.font = fontOf(s, px, 900);
      const wb = g.measureText(s2).width;
      g.restore();
      const gap = 0.2 * px;
      const x0 = W / 2 - (wa + gap + wb) / 2;
      const out = seg(tt, 2.5, 2.75);
      // 前半句小小的（跟關鍵字同一條基線）
      const oa = seg(tt, 0, 0.15) * (1 - out);
      if (oa > 0) drawWord(s, s1, x0 + wa / 2, H / 2 + 0.19 * px, px * 0.5, { alpha: oa, color: s.fg });
      // 關鍵字：放大（0.5 秒出現、衝到 135% 再縮到 115%）、抖
      const ob = tt > 0.5 ? 1 - out : 0;
      if (ob > 0) {
        const S: KeyPt[] = [
          [0.5, 0],
          [0.72, 1.35, E.out],
          [0.9, 1.15],
        ];
        const sc = keys(tt, S);
        const rot = Math.sin(tt * 22) * 4 * (1 - seg(tt, 0.7, 1.5));
        const bcx = x0 + wa + gap + wb / 2;
        const ox = bcx - wb / 2 + 0.3 * wb;
        const oy = H / 2 + 0.36 * px;
        g.save();
        g.globalAlpha *= ob;
        g.translate(ox, oy);
        g.rotate(rot * RAD);
        g.scale(sc, sc);
        g.translate(-ox, -oy);
        drawWord(s, s2, bcx, H / 2, px, { color: s.hi, vt: s.fg });
        g.restore();
      }
    },
  },
  {
    id: 'bouncy',
    group: 'tv',
    zh: '逐字蹦跳',
    en: 'Bouncy letters',
    scheme: 'cobalt',
    words: ['開心到飛起來', '大成功'],
    poster: 1.5,
    len: (w) => w.reduce((a, x) => a + cs(x).length * 0.1 + 2.4, 0),
    draw(s, t) {
      const { W, H, cqh } = s;
      const T = s.words.map((w) => cs(w).length * 0.1 + 2.4);
      const { i, tt } = sentenceAt(T, t);
      const word = s.words[i]!;
      const px = fitN(s, wlen(word) * 1.12, 34, 80);
      const n = cs(word).length;
      const tj = n * 0.1 + 0.9;
      const jump = Math.sin(Math.PI * seg(tt, tj, tj + 0.36)) * 15;
      const out = E.in(seg(tt, T[i]! - 0.28, T[i]!));
      const Y: KeyPt[] = [
        [0, -95],
        [0.22, 0, E.in],
        [0.34, -13, E.out],
        [0.46, 0, E.in],
      ];
      drawChars(
        s,
        word,
        W / 2,
        H / 2,
        px,
        (j) => {
          const lt = tt - j * 0.1;
          if (lt <= 0) return { alpha: 0 };
          return {
            dy: (keys(lt, Y) - jump) * cqh,
            rot: j % 2 ? 6 : -6,
            sx: 1 - out,
            sy: 1 - out,
            color: j % 2 ? VERM : s.fg,
            vt: s.hi,
          };
        },
        { spacing: 0.08 * px },
      );
    },
  },
  {
    id: 'star',
    group: 'tv',
    zh: '爆炸框',
    en: 'Starburst',
    scheme: 'paper',
    words: ['獨家', '必看', '大驚'],
    poster: 1,
    len: (w) => 2.4 * w.length,
    draw(s, t) {
      const { g, W, H, cqmin } = s;
      const D = 2.4;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const word = pick(s.words, i);
      const px = fit(s, word, 29, 36);
      const out = E.in(seg(tt, 2.1, 2.35));
      const ss = E.back(seg(tt, 0, 0.35)) * (1 + 0.05 * Math.sin(t * 11)) * (1 - out);
      if (ss > 0) {
        // 32 個角的尖刺框（外 50%、內 37%，邊長 92cqmin），一直慢慢轉
        const B = 92 * cqmin;
        g.save();
        g.translate(W / 2, H / 2);
        g.rotate(t * 22 * RAD);
        g.scale(ss, ss);
        g.beginPath();
        for (let j = 0; j < 32; j++) {
          const a = (j / 32) * Math.PI * 2;
          const r = (j % 2 ? 37 : 50) / 100;
          const x = Math.cos(a) * r * B;
          const y = Math.sin(a) * r * B;
          if (j === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.fillStyle = s.hi;
        g.fill();
        g.restore();
      }
      const ts = E.back(seg(tt, 0.12, 0.45)) * (1 - out);
      if (ts > 0) drawWord(s, word, W / 2, H / 2, px, { sx: ts, sy: ts, rot: -5, color: s.hifg });
    },
  },
];
