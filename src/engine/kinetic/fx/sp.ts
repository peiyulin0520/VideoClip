// 空間（33–40）。改寫自 claude-animated-text（MIT，© 2026 pound / POUND0423）。
// 3D 的幾式（四角柱、透視字幕、環繞）原版靠 CSS 3D／SVG：這裡用「切成細條各自縮放」或逐行縮放近似透視。
import {
  clamp,
  cs,
  drawChars,
  drawRotX,
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
  wlen,
  type KeyPt,
  type KineticDef,
  type Stage,
} from '../core';

export const FX_SP: KineticDef[] = [
  {
    id: 'cube',
    group: 'sp',
    zh: '四角柱翻面',
    en: 'Prism roll',
    scheme: 'cobalt',
    words: ['第一幕', '第二幕', '第三幕'],
    poster: 0.5,
    len: (w) => 2.0 * w.length,
    draw(s, t) {
      const { g, W, H, cqmin } = s;
      const maxw = Math.max(...s.words.map(wlen));
      const px = fitN(s, maxw + 0.9, 36, 80);
      const D = 2.0;
      const Hd = 1.3;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const a = pick(s.words, i);
      const b = pick(s.words, i + 1);
      const q = E.io(seg(tt, Hd, D));
      const fh = 1.32 * px; // 柱面高度
      const fw = Math.ceil(maxw * px + 0.72 * px);
      const face = (word: string) => {
        // 一個柱面：強調色底、字（強調色上的字色）、左右各留 .36em
        const cv = scratch(Math.ceil(fw), Math.ceil(fh));
        const c = cv.getContext('2d')!;
        c.fillStyle = s.hi;
        c.fillRect(0, 0, cv.width, cv.height);
        c.font = fontOf(s, px);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = s.hifg;
        c.fillText(word, cv.width / 2, cv.height / 2);
        return cv;
      };
      const P = 95 * cqmin;
      const tz = 0.66 * px;
      // 柱子往上滾：目前這面轉到上面去、下一面從下面轉上來（兩面各轉 90°）；整根柱子往後退半個高度
      drawRotX(g, face(b), W / 2, H / 2, fw, fh, q * 90 - 90, tz, -tz, P);
      drawRotX(g, face(a), W / 2, H / 2, fw, fh, q * 90, tz, -tz, P);
    },
  },
  {
    id: 'crawl3d',
    group: 'sp',
    zh: '透視字幕',
    en: 'Perspective crawl',
    scheme: 'ink',
    words: ['很久以前', '在一座島上', '有人按下錄影', '故事開始了'],
    poster: 1,
    area: 'full',
    len: () => null,
    hit: [0, 0.2, 1, 0.6],
    draw(s, t) {
      const { g, W, H, cqmin } = s;
      const lines: string[] = [];
      do s.words.forEach((w) => lines.push(w));
      while (lines.length < 16);
      const n = lines.length;
      const px = fitN(s, Math.max(...s.words.map(wlen)), 15, 78);
      const lineH = 21.75 * cqmin;
      const P = 70 * cqmin;
      const O = { x: W / 2, y: 0.25 * H }; // perspective-origin
      const rot = (56 * Math.PI) / 180;
      const bottom = 1.06 * H; // 平面的下緣（transform-origin 在下緣中央）
      const top = bottom - 1.9 * H;
      const off = (((t * 0.75) / n) % 1) * n * lineH; // 兩份疊在一起，捲一份就接回來
      g.font = fontOf(s, px);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = s.hi;
      for (let m = 0; m < 2 * n; m++) {
        const yl = top + m * lineH + lineH / 2 - off - bottom; // 離下緣的距離（往上為負）
        if (yl > 0 || yl < -1.9 * H) continue;
        // 平面往後躺 56°：高度縮短、離鏡頭越來越遠，再做透視
        const Y = yl * Math.cos(rot);
        const Z = yl * Math.sin(rot);
        const k = P / (P - Z);
        const sy = bottom + Y;
        const screenY = O.y + (sy - O.y) * k;
        // 字幕上緣被背景色蓋住的漸層（上面 52% 高度：25% 之前全蓋、之後漸漸透明）
        const a = clamp((screenY - 0.13 * H) / (0.39 * H));
        if (a <= 0 || screenY > H * 1.1) continue;
        g.save();
        g.globalAlpha *= a;
        g.translate(W / 2, screenY);
        g.scale(k, k * Math.cos(rot));
        g.fillText(lines[m % n]!, 0, 0);
        g.restore();
      }
    },
  },
  {
    id: 'orbit',
    group: 'sp',
    zh: '環繞',
    en: 'Orbit ring',
    scheme: 'paper',
    words: ['循環', '日復一日', '周而復始'],
    poster: 1,
    area: 'wide',
    len: () => null,
    draw(s, t) {
      const { g, W, H } = s;
      // 原版是 320×180 的 SVG（meet：整個放進去置中）
      const k = Math.min(W / 320, H / 180);
      const center = s.words[0]!;
      const unit = (s.words.length > 1 ? s.words.slice(1) : s.words).join('・') + '・';
      let str = unit;
      while (wlen(str + unit) <= 27) str += unit;
      const chars = cs(str);
      const fs = Math.min(14, 392 / wlen(str));
      g.save();
      g.translate((W - 320 * k) / 2, (H - 180 * k) / 2);
      g.scale(k, k);
      g.font = fontOf(s, fs);
      // 一圈字平均排在半徑 64 的圓上（字距把圓周 401 填滿），整圈每秒轉 30°
      const ws = chars.map((c) => g.measureText(c).width);
      const L0 = ws.reduce((a, b) => a + b, 0);
      const ls = Math.max(0, (401 - L0) / chars.length);
      g.save();
      g.translate(160, 90);
      g.rotate(((t * 30) % 360) * (Math.PI / 180));
      g.fillStyle = s.fg;
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      let pos = 0;
      chars.forEach((ch, i) => {
        const th = (pos + ws[i]! / 2) / 64; // 從左邊的點開始，順時針（先過上方）
        const x = -64 * Math.cos(th);
        const y = -64 * Math.sin(th);
        g.save();
        g.translate(x, y);
        g.rotate(Math.atan2(-Math.cos(th), Math.sin(th)));
        g.fillText(ch, 0, 0);
        g.restore();
        pos += ws[i]! + ls;
      });
      g.restore();
      // 中央的詞（強調色）
      g.font = fontOf(s, Math.min(40, 98 / wlen(center)));
      g.fillStyle = s.hi;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(center, 160, 91);
      g.restore();
    },
  },
  {
    id: 'tunnel',
    group: 'sp',
    zh: '隧道',
    en: 'Tunnel',
    scheme: 'verm',
    words: ['前進', '更深'],
    poster: 1,
    len: (w) => 4.2 * w.length,
    draw(s, t) {
      const { W, H } = s;
      const N = 7;
      const D = 4.2;
      const word = pick(s.words, Math.floor(t / D));
      const px = fit(s, word, 30, 56);
      // 同一個詞 7 層，一層一層朝鏡頭飛過來（越近越大）；實心與空心描邊交錯，近的蓋在遠的上面
      const L = Array.from({ length: N }, (_, j) => ({ j, z: ((j + t * 0.9) % N) / N }));
      L.sort((a, b) => a.z - b.z);
      for (const { j, z } of L) {
        const sc = 0.08 * Math.pow(60, z);
        const alpha = Math.min(1, z * 5) * (1 - seg(z, 0.72, 1));
        if (alpha <= 0) continue;
        drawWord(s, word, W / 2, H / 2, px, {
          sx: sc,
          sy: sc,
          alpha,
          ...(j % 2 ? { stroke: 0.025 * px } : {}),
        });
      }
    },
  },
  {
    id: 'scatter',
    group: 'sp',
    zh: '散開聚合',
    en: 'Scatter assemble',
    scheme: 'ink',
    words: ['拼起來', '找到了'],
    poster: 1.6,
    len: (w) => 3.2 * w.length,
    draw(s, t) {
      const { W, H, cqw, cqh } = s;
      const D = 3.2;
      const k = Math.floor(t / D);
      const tt = t - k * D;
      const word = pick(s.words, k);
      const px = fit(s, word, 40, 74);
      // 散落各處的字飛回來拼成詞，停一下再炸開
      drawChars(s, word, W / 2, H / 2, px, (j) => {
        const raw = seg(tt, 0.1 + j * 0.06, 0.75 + j * 0.06);
        const p = E.out(raw);
        const q = E.in(seg(tt, 2.5 + j * 0.04, 3.1 + j * 0.04));
        const sd = q > 0 ? 5 : 0;
        const m = q > 0 ? q : 1 - p;
        const sc = 1 + m * 0.8;
        return {
          dx: (rnd(k, j, 1 + sd) - 0.5) * m * 95 * cqw,
          dy: (rnd(k, j, 2 + sd) - 0.5) * m * 95 * cqh,
          rot: (rnd(k, j, 3 + sd) - 0.5) * m * 300,
          sx: sc,
          sy: sc,
          alpha: clamp(raw * 3) * (1 - q),
        };
      });
    },
  },
  {
    id: 'extrude',
    group: 'sp',
    zh: '厚度陰影',
    en: 'Extrude',
    scheme: 'cobalt',
    words: ['厚片', '加料'],
    poster: 1.2,
    len: (w) => 3 * w.length,
    draw(s, t) {
      const { g, W, H } = s;
      const D = 3;
      const N = 12;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const word = pick(s.words, i);
      const px = fit(s, word, 42, 72);
      const K: KeyPt[] = [
        [0, 0],
        [0.5, 1, E.back],
        [2.5, 1],
        [2.9, 0, E.in],
      ];
      const dep = Math.max(0, keys(tt, K)) * 0.2;
      const ang = 0.78 + Math.sin(t * 1.2) * 0.9;
      const cx = Math.cos(ang);
      const sy = Math.sin(ang);
      const alpha = seg(tt, 0, 0.15) * (1 - seg(tt, 2.8, 2.95));
      if (alpha <= 0) return;
      // 整個字（含厚度）先畫在暫存畫布上，再一起套透明度：厚度是 12 層強調色的字往同一個方向疊出來的
      const cv = scratch(W, H);
      const sub = { ...s, g: cv.getContext('2d')! } as Stage;
      const ox = -cx * dep * 0.5 * px;
      const oy = -sy * dep * 0.5 * px;
      for (let j = N; j >= 1; j--) {
        const d = (dep * j) / N;
        drawWord(sub, word, W / 2 + ox + cx * d * px, H / 2 + oy + sy * d * px, px, { color: s.hi });
      }
      drawWord(sub, word, W / 2 + ox, H / 2 + oy, px);
      g.save();
      g.globalAlpha *= alpha;
      g.drawImage(cv, 0, 0);
      g.restore();
    },
  },
  {
    id: 'blinds',
    group: 'sp',
    zh: '橫條拼字',
    en: 'Slice in',
    scheme: 'paper',
    words: ['切換頻道', '下一台'],
    poster: 1.2,
    len: (w) => 2.6 * w.length,
    draw(s, t) {
      const { W, H, cqw } = s;
      const N = 6;
      const D = 2.6;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const word = pick(s.words, i);
      const px = fit(s, word, 44, 76);
      // 字切成 6 條橫條，左右交錯滑進來拼好，再交錯滑出去
      for (let j = 0; j < N; j++) {
        const p = E.out(seg(tt, j * 0.06, 0.4 + j * 0.06));
        const q = E.in(seg(tt, 1.9 + j * 0.05, 2.3 + j * 0.05));
        const dir = j % 2 ? 1 : -1;
        drawWord(s, word, W / 2 + (dir * lerp(115, 0, p) - dir * q * 115) * cqw, H / 2, px, {
          clip: [(j * 100) / N - 0.4, ((j + 1) * 100) / N + 0.4],
        });
      }
    },
  },
  {
    id: 'block',
    group: 'sp',
    zh: '色塊揭開',
    en: 'Block reveal',
    scheme: 'ink',
    words: ['導演版', '未公開', '獨家'],
    poster: 1.4,
    len: (w) => 2.8 * w.length,
    draw(s, t) {
      const { g, W, H } = s;
      const D = 2.8;
      const i = Math.floor(t / D);
      const tt = t - i * D;
      const word = pick(s.words, i);
      const px = fitN(s, wlen(word) + 0.44, 42, 78);
      g.font = fontOf(s, px);
      const bw = g.measureText(word).width + 0.44 * px;
      const bh = 1.25 * px;
      const x0 = (W - bw) / 2;
      const y0 = (H - bh) / 2;
      // 色塊從左掃過去、字就出現；再從左掃一次，從右邊帶走
      const ph = tt < 0.76 ? tt : tt >= 2.0 ? tt - 2.0 : -1;
      let sx = 0;
      let fromRight = false;
      if (ph >= 0 && ph < 0.38) sx = E.io(ph / 0.38);
      else if (ph >= 0.38 && ph < 0.76) {
        sx = 1 - E.io((ph - 0.38) / 0.38);
        fromRight = true;
      }
      if (tt >= 0.38 && tt < 2.38) drawWord(s, word, W / 2, H / 2, px);
      if (sx > 0.001) {
        g.fillStyle = s.hi;
        const w = bw * sx;
        g.fillRect(fromRight ? x0 + bw - w : x0, y0, w, bh);
      }
    },
  },
];
