// 流動（09–16）。改寫自 claude-animated-text（MIT，© 2026 pound / POUND0423）。
import { band, clamp, cs, drawWord, fontOf, marquee, pick, wlen, type KineticDef } from '../core';

// 彎道（path）的帶子：原版 SVG 的路徑（座標系 320×180，S 形曲線），兩段三次貝茲曲線
const RIB: [number, number, number, number, number, number, number, number][] = [
  [-60, 128, 30, 20, 110, 30, 165, 92],
  [165, 92, 220, 154, 300, 170, 390, 50],
];
let ribPts: { x: number; y: number; a: number; s: number }[] | null = null;
/** 把路徑取樣成一串點（含累計長度與切線角），算一次就好 */
function ribSamples() {
  if (ribPts) return ribPts;
  const out: { x: number; y: number; a: number; s: number }[] = [];
  let acc = 0;
  for (const [x0, y0, x1, y1, x2, y2, x3, y3] of RIB) {
    for (let i = 0; i <= 120; i++) {
      const u = i / 120;
      const m = 1 - u;
      const x = m * m * m * x0 + 3 * m * m * u * x1 + 3 * m * u * u * x2 + u * u * u * x3;
      const y = m * m * m * y0 + 3 * m * m * u * y1 + 3 * m * u * u * y2 + u * u * u * y3;
      const dx = 3 * m * m * (x1 - x0) + 6 * m * u * (x2 - x1) + 3 * u * u * (x3 - x2);
      const dy = 3 * m * m * (y1 - y0) + 6 * m * u * (y2 - y1) + 3 * u * u * (y3 - y2);
      const prev = out[out.length - 1];
      if (prev && i === 0) continue; // 兩段的接點只留一個
      if (prev) acc += Math.hypot(x - prev.x, y - prev.y);
      out.push({ x, y, a: Math.atan2(dy, dx), s: acc });
    }
  }
  ribPts = out;
  return out;
}
/** 路徑上離起點 d 的位置（超出就停在兩端） */
function ribAt(d: number) {
  const pts = ribSamples();
  if (d <= 0) return pts[0]!;
  const last = pts[pts.length - 1]!;
  if (d >= last.s) return last;
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid]!.s <= d) lo = mid;
    else hi = mid;
  }
  const a = pts[lo]!;
  const b = pts[hi]!;
  const f = (d - a.s) / Math.max(b.s - a.s, 1e-6);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, a: a.a + (b.a - a.a) * f, s: d };
}

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
    len: () => null,
    hit: [0, 0.2, 1, 0.6],
    draw(s, t) {
      const { g, W, H } = s;
      // 原版是 320×180 的 SVG（preserveAspectRatio slice＝蓋滿）：先算蓋滿的倍率與位移
      const k = Math.max(W / 320, H / 180);
      const ox = (W - 320 * k) / 2;
      const oy = (H - 180 * k) / 2;
      g.save();
      g.translate(ox, oy);
      g.scale(k, k);
      // 一條寬的強調色帶子沿 S 形曲線
      g.strokeStyle = s.hi;
      g.lineWidth = 26;
      g.lineCap = 'butt';
      g.beginPath();
      g.moveTo(RIB[0]![0], RIB[0]![1]);
      for (const [, , x1, y1, x2, y2, x3, y3] of RIB) g.bezierCurveTo(x1, y1, x2, y2, x3, y3);
      g.stroke();
      // 字沿著曲線排（字高 15、粗體），整串字以 24／秒的速度流過去
      const unit = s.words.join('・') + '・';
      g.font = fontOf(s, 15, 900);
      g.fillStyle = s.hifg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const unitLen = g.measureText(unit).width;
      const reps = Math.ceil(64 / wlen(unit)) + 2;
      const chars = cs(unit.repeat(reps));
      const total = ribSamples()[ribSamples().length - 1]!.s;
      let pos = -((t * 24) % unitLen);
      for (const ch of chars) {
        const w = g.measureText(ch).width;
        if (pos > total) break;
        if (pos + w >= 0) {
          const p = ribAt(pos + w / 2);
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.a);
          g.fillText(ch, 0, 0);
          g.restore();
        }
        pos += w;
      }
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
