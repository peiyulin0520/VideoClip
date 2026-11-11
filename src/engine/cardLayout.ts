import type { TextCard, TextRun } from '../model/types';

// 字卡排版（純計算，不碰 canvas，所以可以單元測試）。
// 規格見 docs/TEXT_CARDS.md §2：逐字排、用「墨跡邊界」而不是字型的 ascent/descent 來算字塊大小，
// 這樣上下內距才會跟設定的一樣（修正「字上方色塊多、下方貼底」）。

/** 一個字的度量（單位 px，已乘上縮放）。asc/desc 是墨跡（actualBoundingBox），不是字型度量 */
export type GlyphMetric = { adv: number; asc: number; desc: number; left: number; right: number };
/** left：墨跡左緣在 pen 左邊多遠（canvas 的 actualBoundingBoxLeft）；right：墨跡右緣在 pen 右邊多遠（actualBoundingBoxRight，從 pen 起算） */
export type Measurer = (ch: string, run: TextRun, px: number) => GlyphMetric;

export type GlyphBox = {
  ch: string;
  run: number; // 第幾個 run
  line: number;
  x: number; // pen 位置（相對字塊內容區左上角，含對齊）
  y: number; // baseline（相對字塊內容區左上角）
  adv: number;
};

export type CardLayout = {
  glyphs: GlyphBox[];
  /** 整張字卡（含字塊內距）的大小，px */
  w: number;
  h: number;
  /** 字塊矩形（相對字卡左上角）；沒有字塊時等於墨跡矩形 */
  boxRect: { x: number; y: number; w: number; h: number };
  /** 文字墨跡矩形（相對字卡左上角） */
  ink: { x: number; y: number; w: number; h: number };
  pad: { top: number; right: number; bottom: number; left: number };
};

const NO_LINE_START = new Set('，。、！？；：）」』】》〉,.!?;:)]}%…～ー'.split(''));
const NO_LINE_END = new Set('（「『【《〈([{'.split(''));
const WORD = /[A-Za-z0-9'’_-]/;

type Cell = { ch: string; run: number; m: GlyphMetric; lh: number };

/** 斷行：中文逐字、英文在空白處（太長就硬斷）、避頭尾 */
function breakLines(cells: Cell[], spacing: (c: Cell) => number, maxW: number): Cell[][] {
  const lines: Cell[][] = [];
  let cur: Cell[] = [];
  let curW = 0;
  // 先切成「不可分割的單位」：連續英數字是一個字，其他一字一單位
  const units: Cell[][] = [];
  for (let i = 0; i < cells.length;) {
    const c = cells[i]!;
    if (c.ch === '\n') {
      units.push([c]);
      i++;
      continue;
    }
    if (WORD.test(c.ch)) {
      const u: Cell[] = [];
      while (i < cells.length && WORD.test(cells[i]!.ch)) u.push(cells[i++]!);
      units.push(u);
    } else {
      units.push([c]);
      i++;
    }
  }
  const unitW = (u: Cell[]) => u.reduce((s, c) => s + c.m.adv + spacing(c), 0);
  const push = () => {
    lines.push(cur);
    cur = [];
    curW = 0;
  };
  for (let k = 0; k < units.length; k++) {
    const u = units[k]!;
    if (u[0]!.ch === '\n') {
      push();
      continue;
    }
    const w = unitW(u);
    const prev = cur[cur.length - 1];
    // 行首禁則：這個單位不能放行首、或前一字不能放行尾 → 盡量擠在同一行
    const cantStart = u.length === 1 && NO_LINE_START.has(u[0]!.ch);
    const cantEndPrev = !!prev && NO_LINE_END.has(prev.ch);
    if (cur.length > 0 && curW + w > maxW + 0.01 && !cantStart && !cantEndPrev) push();
    // 單一單位就比一行還寬（長英文字）：硬斷
    if (u.length > 1 && w > maxW) {
      for (const c of u) {
        const cw = c.m.adv + spacing(c);
        if (cur.length > 0 && curW + cw > maxW + 0.01) push();
        cur.push(c);
        curW += cw;
      }
      continue;
    }
    // 空白放在行首沒有意義
    if (cur.length === 0 && u.length === 1 && u[0]!.ch === ' ' && lines.length > 0) continue;
    cur.push(...u);
    curW += w;
  }
  push();
  return lines;
}

export function layoutCard(card: TextCard, scale: number, measure: Measurer): CardLayout {
  const cells: Cell[] = [];
  card.runs.forEach((run, ri) => {
    const px = run.size * scale;
    for (const ch of Array.from(run.text)) {
      if (ch === '\n')
        cells.push({
          ch,
          run: ri,
          m: { adv: 0, asc: 0, desc: 0, left: 0, right: 0 },
          lh: run.lineHeight * px,
        });
      else cells.push({ ch, run: ri, m: measure(ch, run, px), lh: run.lineHeight * px });
    }
  });
  const spacing = (c: Cell) => card.runs[c.run]!.letterSpacing * card.runs[c.run]!.size * scale;
  const maxW = card.width && card.width > 0 ? card.width * scale : Infinity;
  const lines = breakLines(cells, spacing, maxW);

  // 每行：pen 寬度（最後一字後面不加字距）、墨跡上下緣、行距
  type LineInfo = { cells: Cell[]; w: number; asc: number; desc: number; lh: number };
  const infos: LineInfo[] = lines.map((cs) => {
    let w = 0;
    let asc = 0;
    let desc = 0;
    let lh = 0;
    cs.forEach((c, i) => {
      w += c.m.adv + (i < cs.length - 1 ? spacing(c) : 0);
      if (c.ch.trim() !== '') {
        asc = Math.max(asc, c.m.asc);
        desc = Math.max(desc, c.m.desc);
      }
      lh = Math.max(lh, c.lh);
    });
    return { cells: cs, w, asc, desc, lh };
  });
  if (infos.length === 0) infos.push({ cells: [], w: 0, asc: 0, desc: 0, lh: 0 });
  // 空白行（只有換行）的墨跡高度用相鄰行補，避免被當成 0
  const refAsc = Math.max(...infos.map((l) => l.asc), 1);
  const refDesc = Math.max(...infos.map((l) => l.desc), 0);
  for (const l of infos) {
    if (l.asc === 0 && l.desc === 0) {
      l.asc = refAsc;
      l.desc = refDesc;
    }
  }

  const contentW = Number.isFinite(maxW) ? maxW : Math.max(...infos.map((l) => l.w), 1);
  // baseline：第一行 = 0，往下每行加該行的行距
  const baselines: number[] = [];
  infos.forEach((l, i) => baselines.push(i === 0 ? 0 : baselines[i - 1]! + l.lh));
  const inkTop = baselines[0]! - infos[0]!.asc;
  const last = infos.length - 1;
  const inkBottom = baselines[last]! + infos[last]!.desc;
  const inkH = Math.max(inkBottom - inkTop, 1);

  const glyphs: GlyphBox[] = [];
  let inkL = Infinity;
  let inkR = -Infinity;
  infos.forEach((l, li) => {
    const x0 = card.align === 'left' ? 0 : card.align === 'right' ? contentW - l.w : (contentW - l.w) / 2;
    let pen = x0;
    l.cells.forEach((c, i) => {
      if (c.ch.trim() !== '') {
        inkL = Math.min(inkL, pen - c.m.left);
        inkR = Math.max(inkR, pen + c.m.right);
      }
      glyphs.push({ ch: c.ch, run: c.run, line: li, x: pen, y: baselines[li]! - inkTop, adv: c.m.adv });
      pen += c.m.adv + (i < l.cells.length - 1 ? spacing(c) : 0);
    });
  });
  if (!Number.isFinite(inkL)) {
    inkL = 0;
    inkR = contentW;
  }
  // 固定寬度時，墨跡區就是整個文字區（字塊寬度才跟設定的寬度一致）
  const textL = Number.isFinite(maxW) ? 0 : inkL;
  const textR = Number.isFinite(maxW) ? contentW : inkR;
  const inkW = Math.max(textR - textL, 1);

  const b = card.box;
  const pad = b
    ? {
        top: b.padding.top * scale,
        right: b.padding.right * scale,
        bottom: b.padding.bottom * scale,
        left: b.padding.left * scale,
      }
    : { top: 0, right: 0, bottom: 0, left: 0 };
  const nudge = b ? b.nudgeY * scale : 0;
  const w = inkW + pad.left + pad.right;
  const h = inkH + pad.top + pad.bottom;
  const dx = pad.left - textL;
  for (const g of glyphs) {
    g.x += dx;
    g.y += pad.top + nudge;
  }
  return {
    glyphs,
    w,
    h,
    boxRect: { x: 0, y: 0, w, h },
    ink: { x: pad.left, y: pad.top + nudge, w: inkW, h: inkH },
    pad,
  };
}
