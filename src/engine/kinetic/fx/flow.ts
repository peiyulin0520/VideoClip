// 流動（09–16）。改寫自 claude-animated-text（MIT，© 2026 pound / POUND0423）。
import {
  band,
  centerText,
  clamp,
  cs,
  drawWord,
  fitLine,
  fontOf,
  marquee,
  pick,
  stackWords,
  wlen,
  type KineticDef,
} from '../core';
import {
  FLOW_HOLD,
  FLOW_P,
  flattenFactor,
  flowHead,
  flowRoute,
  readForward,
  ribbonShape,
  settleHead,
  settleRoute,
  shapeAt,
  windFactor,
  type Win,
} from './ribbon';

export const FX_FLOW: KineticDef[] = [
  {
    id: 'crawl',
    group: 'flow',
    zh: '巨字橫移',
    en: 'Giant crawl',
    scheme: 'ink',
    words: ['環島公路', '一路向南'],
    poster: 1.5,
    area: 'full',
    fade: 'h',
    sub: '同主標',
    subLabel: '底部小字',
    len: () => null,
    // 停下來：巨字一行置中（縮到整句放得下）＋底部強調色窄帶上的小字
    rest(s) {
      const { g, W, H, cqmin } = s;
      const area = H - 10 * cqmin;
      const { rows, px } = stackWords(s, 58 * cqmin, W * 0.94, area * 0.92);
      rows.forEach((w, i) =>
        centerText(s, w, W / 2, area / 2 + (i - (rows.length - 1) / 2) * px * 1.12, px, s.fg),
      );
      const sh = 5.6 * cqmin * 1.2 + 3.2 * cqmin;
      g.fillStyle = s.hi;
      g.fillRect(0, H - sh, W, sh);
      const sub = s.sub ?? s.words.join('・');
      centerText(s, sub, W / 2, H - sh / 2, fitLine(s, sub, 5.6 * cqmin, W * 0.94, 700), s.hifg, 700);
    },
    hit: [0, 0.2, 1, 0.6],
    draw(s, t) {
      const { g, W, H, cqmin } = s;
      const unit = s.words.join('・') + '・';
      const subUnit = (s.sub ?? s.words.join('・')) + '・';
      // 超大的字（字高 58cqmin，範圍＝整個畫面扣掉底下 10cqmin），由右往左慢慢橫移
      marquee(
        s,
        unit,
        t * 0.55,
        58 * cqmin,
        { x: 0, y: 0, w: W, h: H - 10 * cqmin },
        { min: 8, weight: 900 },
      );
      // 底下一條強調色窄帶，小字反向跑
      const sh = 5.6 * cqmin * 1.2 + 3.2 * cqmin;
      g.fillStyle = s.hi;
      g.fillRect(0, H - sh, W, sh);
      marquee(
        s,
        subUnit,
        -t * 2.4,
        5.6 * cqmin,
        { x: 0, y: H - sh, w: W, h: sh },
        { min: 44, color: s.hifg, weight: 700 },
      );
    },
  },
  {
    id: 'drift',
    group: 'flow',
    zh: '直排對流',
    en: 'Column drift',
    scheme: 'cobalt',
    words: ['潮起', '潮落', '無聲'],
    poster: 1,
    area: 'full',
    len: () => null,
    // 停下來：五欄靜止，每欄一個詞（直排置中）
    rest(s) {
      const { W, H, cqmin } = s;
      const cw = 15 * cqmin;
      const gap = (W - 5 * cw) / 6;
      for (let i = 0; i < 5; i++) {
        const cx = gap * (i + 1) + cw * i + cw / 2;
        const chars = cs(pick(s.words, i));
        const px = Math.min(cw, (H * 0.8) / chars.length);
        chars.forEach((ch, j) =>
          centerText(s, ch, cx, H / 2 + (j - (chars.length - 1) / 2) * px, px, i % 2 ? s.hi : s.fg),
        );
      }
    },
    hit: [0, 0.1, 1, 0.8],
    draw(s, t) {
      const { W, H, cqmin } = s;
      // 五欄直排，字高 15cqmin、欄寬＝一個字寬，等距排開（space-evenly）；一欄往上、一欄往下
      const cw = 15 * cqmin;
      const gap = (W - 5 * cw) / 6;
      for (let i = 0; i < 5; i++) {
        const x = gap * (i + 1) + cw * i;
        marquee(
          s,
          pick(s.words, i) + '・',
          (i % 2 ? -1 : 1) * t * (0.8 + (i % 3) * 0.25),
          cw,
          { x, y: 0, w: cw, h: H },
          { vertical: true, min: 9, color: i % 2 ? s.hi : s.fg },
        );
      }
    },
  },
  {
    id: 'echo',
    group: 'flow',
    zh: '重複波浪',
    en: 'Echo wave',
    scheme: 'paper',
    words: ['呼吸'],
    poster: 1,
    area: 'full',
    len: () => null,
    // 停下來：6 列都亮著（中間兩列強調色），每一列一個詞（把整句的詞都排進去）
    rest(s) {
      const { W, H, cqmin, cqw } = s;
      const rows = 6;
      const rowH = 11 * cqmin * 1.15;
      const gapY = 1.4 * cqmin;
      const top = (H - (rows * rowH + (rows - 1) * gapY)) / 2;
      for (let y = 0; y < rows; y++) {
        const word = pick(s.words, y);
        const n = wlen(word);
        const cols = clamp(Math.round(13 / n), 2, 8);
        const px = Math.min(11 * cqmin, (84 / cols / n) * cqw);
        const colW = (W - 6 * cqw) / cols;
        const a = 0.35 + 0.65 * (1 - Math.abs(y - (rows - 1) / 2) / ((rows - 1) / 2));
        for (let x = 0; x < cols; x++)
          drawWord(s, word, 3 * cqw + colW * (x + 0.5), top + rowH * (y + 0.5), px, {
            weight: 700,
            alpha: a,
            color: y === 2 || y === 3 ? s.hi : s.fg,
          });
      }
    },
    hit: [0, 0.15, 1, 0.7],
    draw(s, t) {
      const { g, W, H, cqmin, cqw } = s;
      const word = pick(s.words, 0);
      const n = wlen(word);
      const cols = clamp(Math.round(13 / n), 2, 8);
      const rows = 6;
      // 同一個詞鋪成 6 列多欄的網格（欄等寬、左右各留 3cqw），亮度像波浪掃過
      const px = Math.min(11 * cqmin, (84 / cols / n) * cqw);
      const colW = (W - 6 * cqw) / cols;
      const rowH = px * 1.15;
      const gapY = 1.4 * cqmin;
      const top = (H - (rows * rowH + (rows - 1) * gapY)) / 2;
      const sx = ((0.55 * 6) / cols) * 1.2;
      g.font = fontOf(s, px, 700);
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const a = Math.pow(Math.max(0, Math.sin(t * 3.2 - (x * sx + y * 0.7))), 2);
          drawWord(s, word, 3 * cqw + colW * (x + 0.5), top + rowH * (y + 0.5), px, {
            weight: 700,
            alpha: 0.1 + 0.9 * a,
            color: a > 0.72 ? s.hi : s.fg,
          });
        }
    },
  },
  {
    id: 'slant',
    group: 'flow',
    zh: '斜帶',
    en: 'Slant bands',
    scheme: 'ink',
    words: ['週五晚上', '不見不散'],
    poster: 1,
    area: 'full',
    len: () => null,
    // 停下來：兩條斜帶靜止，每條帶上一整句（縮到放得進畫面）
    rest(s) {
      const { g, W, H, cqmin } = s;
      const bw = W * 1.6;
      const bh = 13 * cqmin * 1.1 + 3.4 * cqmin;
      const gap = 3.4 * cqmin;
      const rad = (-9 * Math.PI) / 180;
      const text = s.words.join(' ');
      const px = fitLine(s, text, 13 * cqmin, W * 0.82);
      [
        { dy: -(bh + gap) / 2, bg: s.hi, fg: s.hifg },
        { dy: (bh + gap) / 2, bg: s.fg, fg: s.paper },
      ].forEach((b) => {
        g.save();
        g.translate(W / 2 - b.dy * Math.sin(rad), H / 2 + b.dy * Math.cos(rad));
        g.rotate(rad);
        g.fillStyle = b.bg;
        g.fillRect(-bw / 2, -bh / 2, bw, bh);
        centerText(s, text, 0, 0, px, b.fg);
        g.restore();
      });
    },
    hit: [0, 0.25, 1, 0.5],
    draw(s, t) {
      const { W, H, cqmin } = s;
      // 兩條橫跨畫面的色帶上下相鄰，整組逆時針傾斜 9°（寬 160%、兩端超出畫面）；字相反方向跑
      const bw = W * 1.6;
      const bh = 13 * cqmin * 1.1 + 3.4 * cqmin;
      const gap = 3.4 * cqmin;
      const cy = H / 2;
      const rot = -9;
      const rad = (rot * Math.PI) / 180;
      // 每條帶子的中心（在整組旋轉前的位置）轉到畫面上
      const at = (dy: number) => ({
        x: W / 2 - dy * Math.sin(rad),
        y: cy + dy * Math.cos(rad),
      });
      const c1 = at(-(bh + gap) / 2);
      const c2 = at((bh + gap) / 2);
      band(s, {
        cx: c1.x,
        cy: c1.y,
        w: bw,
        h: bh,
        rot,
        bg: s.hi,
        color: s.hifg,
        unit: pick(s.words, 0) + '・',
        dist: t * 1.5,
        px: 13 * cqmin,
        min: 34,
      });
      band(s, {
        cx: c2.x,
        cy: c2.y,
        w: bw,
        h: bh,
        rot,
        bg: s.fg,
        color: s.paper,
        unit: pick(s.words, 1) + '・',
        dist: -t * 1.1,
        px: 13 * cqmin,
        min: 34,
      });
    },
  },
  {
    id: 'path',
    group: 'flow',
    zh: '彎道',
    en: 'Path ribbon',
    scheme: 'verm',
    words: ['順著河走', '就會到海'],
    poster: 1,
    area: 'full',
    calm: false,
    // 整個特效只有一條緞帶，播放時流動和收尾都用真正的時間畫、每秒 60 次（不量化成步，才不會一格大一格小）
    smooth: true,
    // 停在最後畫面：緞帶滑到畫面正中間（第一輪的一半，0.9 秒）時開始收尾——照原方向原速度離開、繞一圈、停在中間拉直（2.3 秒）
    settleLen: 2.3,
    hold: () => FLOW_HOLD + 2.3,
    len: () => null,
    hit: [0, 0.2, 1, 0.6],
    draw(s, t) {
      const { g, W, H } = s;
      const q = s.settle ?? 0;
      // 原版是 320×180 的 SVG（preserveAspectRatio slice＝蓋滿）：先算蓋滿的倍率與位移
      const k = Math.max(W / 320, H / 180);
      const ox = (W - 320 * k) / 2;
      const oy = (H - 180 * k) / 2;
      const vw = W / k; // 畫面看得到的寬度（直式畫面只看得到 320 的一小段）
      const vh = H / k;
      // 緞帶活動的範圍：框的整個寬度；高度只用中間 60%（字卡的選取範圍，使用者會把它放在想看的地方）
      const win: Win = { x0: -ox / k, y0: 90 - vh * 0.3, x1: (W - ox) / k, y1: 90 + vh * 0.3 };
      // 緞帶：整句字（每個詞空一格）＋左右留白；字太長就縮小，放得進畫面。長度、粗細、字的大小從頭到尾不變
      const sentence = cs(s.words.join(' '));
      g.font = fontOf(s, 15, 900);
      const sw0 = g.measureText(sentence.join('')).width;
      const size = Math.min(15, (15 * vw * 0.56) / Math.max(sw0, 1));
      const sw = (sw0 * size) / 15;
      const L = sw + size * 1.2;
      const thick = size * (26 / 15);
      const seed = s.words.join('|');
      const flow = flowRoute(win, L);
      let route = flow;
      let hs: number;
      if (q > 0) {
        const st = settleRoute(win, L, thick, seed);
        route = st.route;
        hs = settleHead(q, st.d0, st.route.total, flow.total / FLOW_P, 2.3);
      } else hs = flowHead(t, flow);
      const shape = ribbonShape(route, hs, L, thick * 0.3 * windFactor(q), t, {
        cx: (win.x0 + win.x1) / 2,
        cy: (win.y0 + win.y1) / 2,
        e: flattenFactor(q),
      });
      g.save();
      g.translate(ox, oy);
      g.scale(k, k);
      g.lineCap = 'butt';
      g.lineJoin = 'round';
      g.strokeStyle = s.hi;
      g.lineWidth = thick;
      g.beginPath();
      shape.p.forEach((pt, i) => (i === 0 ? g.moveTo(pt.x, pt.y) : g.lineTo(pt.x, pt.y)));
      g.stroke();
      g.font = fontOf(s, size, 900);
      g.fillStyle = s.hifg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      // 字排在緞帶正中間；緞帶偏向左走的時候整句反過來排（字不會倒過來）：兩種排法依方向淡入淡出
      const fwd = readForward(shape, L);
      const start = (shape.total - sw) / 2;
      const lay = (rev: boolean, alpha: number) => {
        if (alpha < 0.003) return;
        let pos = 0;
        for (const ch of sentence) {
          const w = g.measureText(ch).width;
          const mid = start + pos + w / 2;
          const pt = shapeAt(shape, rev ? shape.total - mid : mid);
          g.save();
          g.globalAlpha *= alpha;
          g.translate(pt.x, pt.y);
          g.rotate(pt.a + (rev ? Math.PI : 0));
          g.fillText(ch, 0, 0);
          g.restore();
          pos += w;
        }
      };
      lay(false, fwd);
      lay(true, 1 - fwd);
      g.restore();
    },
  },
  {
    id: 'ticker',
    group: 'flow',
    zh: '多層跑馬燈',
    en: 'Ticker stack',
    scheme: 'cobalt',
    words: ['全新一季', '本週上線', '敬請期待', '搶先看'],
    poster: 1,
    area: 'full',
    len: () => null,
    // 停下來：四排靜止，每排一整句置中
    rest(s) {
      const { g, H, W, cqmin } = s;
      const rows = [
        {
          px: 6.2 * cqmin,
          h: 6.2 * cqmin * 1.15,
          weight: 500,
          color: s.fg,
          bg: undefined as string | undefined,
        },
        { px: 27 * cqmin, h: 27 * cqmin * 1.05, weight: 900, color: s.hi, bg: undefined },
        { px: 6.2 * cqmin, h: 6.2 * cqmin * 1.15 + 2 * cqmin, weight: 700, color: s.paper, bg: s.fg },
        { px: 13 * cqmin, h: 13 * cqmin * 1.1, weight: 900, color: s.fg, bg: undefined },
      ];
      const gap = 1.6 * cqmin;
      const text = s.words.join(' ');
      let y = (H - (rows.reduce((a, r) => a + r.h, 0) + gap * 3)) / 2;
      for (const r of rows) {
        if (r.bg) {
          g.fillStyle = r.bg;
          g.fillRect(0, y, W, r.h);
        }
        centerText(
          s,
          text,
          W / 2,
          y + r.h / 2,
          fitLine(s, text, r.px, W * 0.94, r.weight),
          r.color,
          r.weight,
        );
        y += r.h + gap;
      }
    },
    hit: [0, 0.15, 1, 0.7],
    draw(s, t) {
      const { H, W, cqmin } = s;
      // 四排由上到下：小字（快、往左）、超大強調色字（慢、往右）、反白小字帶（更快）、中字（往右）
      const rows = [
        {
          px: 6.2 * cqmin,
          h: 6.2 * cqmin * 1.15,
          sp: 2.0,
          weight: 500,
          color: s.fg,
          bg: undefined as string | undefined,
        },
        { px: 27 * cqmin, h: 27 * cqmin * 1.05, sp: -0.9, weight: 900, color: s.hi, bg: undefined },
        {
          px: 6.2 * cqmin,
          h: 6.2 * cqmin * 1.15 + 2 * cqmin,
          sp: 2.6,
          weight: 700,
          color: s.paper,
          bg: s.fg,
        },
        { px: 13 * cqmin, h: 13 * cqmin * 1.1, sp: -1.4, weight: 900, color: s.fg, bg: undefined },
      ];
      const gap = 1.6 * cqmin;
      let y = (H - (rows.reduce((a, r) => a + r.h, 0) + gap * 3)) / 2;
      rows.forEach((r, i) => {
        band(s, {
          cx: W / 2,
          cy: y + r.h / 2,
          w: W,
          h: r.h,
          bg: r.bg,
          color: r.color,
          unit: pick(s.words, i) + '・',
          dist: r.sp * t,
          px: r.px,
          min: 46,
          weight: r.weight,
        });
        y += r.h + gap;
      });
    },
  },
  {
    id: 'depth',
    group: 'flow',
    zh: '遠近直書',
    en: 'Depth columns',
    scheme: 'paper',
    words: ['山城', '起霧', '慢車'],
    poster: 1,
    area: 'wide',
    len: () => null,
    // 停下來：七欄靜止；兩旁、外側各欄一個詞，中間大字（強調色）把整句直排放進去
    rest(s) {
      const { g, W, H, cqmin } = s;
      const cfg: [string, number][] = [
        ['far', 2],
        ['far', 1],
        ['side', 2],
        ['mid', 0],
        ['side', 1],
        ['far', 0],
        ['far', 2],
      ];
      const size = { far: 7, side: 13, mid: 30 } as const;
      const gap = 5 * cqmin;
      const widths = cfg.map((c) => size[c[0] as keyof typeof size] * cqmin);
      const total = widths.reduce((a, b) => a + b, 0) + gap * (cfg.length - 1);
      let x = (W - total) / 2;
      cfg.forEach(([kind, wi], i) => {
        const w = widths[i]!;
        const chars = cs(kind === 'mid' ? s.words.join('') : pick(s.words, wi));
        const px = Math.min(w, (H * 0.86) / chars.length);
        g.save();
        g.globalAlpha *= kind === 'far' ? 0.28 : kind === 'side' ? 0.55 : 1;
        chars.forEach((ch, j) =>
          centerText(
            s,
            ch,
            x + w / 2,
            H / 2 + (j - (chars.length - 1) / 2) * px,
            px,
            kind === 'mid' ? s.hi : s.fg,
          ),
        );
        g.restore();
        x += w + gap;
      });
    },
    draw(s, t) {
      const { g, W, H, cqmin } = s;
      // 七欄直排置中並排，做出景深：中間大字（強調色）、兩旁中等（55% 透明）、外側小字（28% 透明）
      const cfg: [string, number, number, number][] = [
        ['far', 0.5, 1, 2],
        ['far', 0.7, -1, 1],
        ['side', 0.6, 1, 2],
        ['mid', 0.7, -1, 0],
        ['side', 0.75, 1, 1],
        ['far', 0.6, -1, 0],
        ['far', 0.45, 1, 2],
      ];
      const size = { far: 7, side: 13, mid: 30 } as const;
      const gap = 5 * cqmin;
      const widths = cfg.map((c) => size[c[0] as keyof typeof size] * cqmin);
      const total = widths.reduce((a, b) => a + b, 0) + gap * (cfg.length - 1);
      let x = (W - total) / 2;
      cfg.forEach(([kind, sp, dir, wi], i) => {
        const w = widths[i]!;
        g.save();
        g.globalAlpha *= kind === 'far' ? 0.28 : kind === 'side' ? 0.55 : 1;
        marquee(
          s,
          pick(s.words, wi) + '　',
          sp * dir * t,
          w,
          { x, y: 0, w, h: H },
          { vertical: true, min: kind === 'mid' ? 6 : 16, color: kind === 'mid' ? s.hi : s.fg },
        );
        g.restore();
        x += w + gap;
      });
    },
  },
  {
    id: 'tape',
    group: 'flow',
    zh: '交叉封條',
    en: 'Crossed tape',
    scheme: 'ink',
    words: ['施工中', '請繞道'],
    poster: 1,
    area: 'full',
    len: () => null,
    // 停下來：兩條交叉封條靜止，每條上一整句（縮到放得進畫面）
    rest(s) {
      const { g, W, H, cqmin } = s;
      const bw = W * 1.5;
      const bh = 11 * cqmin * 1.1 + 3 * cqmin;
      const text = s.words.join(' ');
      const px = fitLine(s, text, 11 * cqmin, W * 0.8);
      [
        { rot: -10, bg: s.fg, fg: s.paper },
        { rot: 12, bg: s.hi, fg: s.hifg },
      ].forEach((b) => {
        g.save();
        g.translate(W / 2, H / 2);
        g.rotate((b.rot * Math.PI) / 180);
        g.fillStyle = b.bg;
        g.fillRect(-bw / 2, -bh / 2, bw, bh);
        centerText(s, text, 0, 0, px, b.fg);
        g.restore();
      });
    },
    hit: [0, 0.2, 1, 0.6],
    draw(s, t) {
      const { W, H, cqmin } = s;
      // 兩條封條在中央交叉成 X（寬 150%、兩端超出畫面）：反向跑；先畫兵色那條，強調色那條蓋在上面
      const bw = W * 1.5;
      const bh = 11 * cqmin * 1.1 + 3 * cqmin;
      band(s, {
        cx: W / 2,
        cy: H / 2,
        w: bw,
        h: bh,
        rot: -10,
        bg: s.fg,
        color: s.paper,
        unit: pick(s.words, 1) + '・',
        dist: -t * 1.3,
        px: 11 * cqmin,
        min: 44,
      });
      band(s, {
        cx: W / 2,
        cy: H / 2,
        w: bw,
        h: bh,
        rot: 12,
        bg: s.hi,
        color: s.hifg,
        unit: pick(s.words, 0) + '・',
        dist: t * 1.7,
        px: 11 * cqmin,
        min: 44,
      });
    },
  },
];
