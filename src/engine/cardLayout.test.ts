import { describe, expect, it } from 'vitest';
import type { CardBox, TextCard, TextRun } from '../model/types';
import { layoutCard, type Measurer } from './cardLayout';

// 假的量字器：全形字寬 = 字級、英數 0.5 倍；墨跡比字型的 ascent/descent 小（跟真實字型一樣）
const measure: Measurer = (ch, _run, px) => {
  const latin = /[\x20-\x7e]/.test(ch);
  const adv = latin ? px * 0.5 : px;
  return { adv, asc: px * 0.8, desc: ch === '，' ? px * 0.2 : px * 0.1, left: 0, right: adv };
};

const run = (text: string, over: Partial<TextRun> = {}): TextRun => ({
  text,
  fontId: 'x',
  size: 100,
  color: '#fff',
  letterSpacing: 0,
  lineHeight: 1.2,
  weight: 'normal',
  ...over,
});
const box = (p: Partial<CardBox['padding']> = {}, nudgeY = 0): CardBox => ({
  shape: 'rect',
  fill: '#f00',
  opacity: 1,
  padding: { top: 20, right: 30, bottom: 40, left: 50, ...p },
  nudgeY,
});
const card = (text: string, over: Partial<TextCard> = {}, r: Partial<TextRun> = {}): TextCard => ({
  align: 'center',
  runs: [run(text, r)],
  ...over,
});

describe('字塊 = 墨跡 + 四邊內距（上下左右各自）', () => {
  it('墨跡上緣離字塊上緣 = padding.top，墨跡下緣離字塊下緣 = padding.bottom', () => {
    const lay = layoutCard(card('字卡測試', { box: box() }), 1, measure);
    expect(lay.ink.y).toBeCloseTo(20);
    expect(lay.h - (lay.ink.y + lay.ink.h)).toBeCloseTo(40);
    expect(lay.ink.x).toBeCloseTo(50);
    expect(lay.w - (lay.ink.x + lay.ink.w)).toBeCloseTo(30);
    // 一行：墨跡高 = ascent 80 + descent 10
    expect(lay.ink.h).toBeCloseTo(90);
    expect(lay.h).toBeCloseTo(20 + 90 + 40);
  });
  it('沒有字塊時尺寸就是墨跡', () => {
    const lay = layoutCard(card('字卡'), 1, measure);
    expect(lay.w).toBeCloseTo(200);
    expect(lay.h).toBeCloseTo(90);
  });
  it('縮放：內距跟著縮', () => {
    const lay = layoutCard(card('字', { box: box() }), 0.5, measure);
    expect(lay.ink.y).toBeCloseTo(10);
    expect(lay.h - (lay.ink.y + lay.ink.h)).toBeCloseTo(20);
  });
  it('垂直微調只移動文字，字塊大小不變', () => {
    const a = layoutCard(card('字', { box: box() }), 1, measure);
    const b = layoutCard(card('字', { box: box({}, 6) }), 1, measure);
    expect(b.h).toBeCloseTo(a.h);
    expect(b.glyphs[0]!.y - a.glyphs[0]!.y).toBeCloseTo(6);
  });
  it('多行：行距用 lineHeight，墨跡取第一行上緣到最後一行下緣', () => {
    const lay = layoutCard(card('一\n二', { box: box() }), 1, measure);
    expect(lay.glyphs.map((g) => g.line)).toEqual([0, 1]);
    expect(lay.glyphs[1]!.y - lay.glyphs[0]!.y).toBeCloseTo(120);
    expect(lay.ink.h).toBeCloseTo(120 + 90);
  });
  it('中英混排：同一行的墨跡取聯集', () => {
    const lay = layoutCard(card('Ab字'), 1, measure);
    expect(lay.ink.h).toBeCloseTo(90);
    expect(lay.w).toBeCloseTo(50 + 50 + 100);
  });
});

describe('字距、對齊、寬度與換行', () => {
  it('字距用 em，最後一字後面不加', () => {
    const lay = layoutCard(card('字字字', {}, { letterSpacing: 0.1 }), 1, measure);
    expect(lay.glyphs.map((g) => g.x)).toEqual([0, 110, 220]);
    expect(lay.w).toBeCloseTo(320);
  });
  it('固定寬度：中文逐字換行，字塊寬度 = 設定寬度 + 左右內距', () => {
    const lay = layoutCard(card('一二三四五六', { width: 300, box: box() }), 1, measure);
    expect(Math.max(...lay.glyphs.map((g) => g.line))).toBe(1);
    expect(lay.w).toBeCloseTo(300 + 50 + 30);
  });
  it('避頭尾：逗號、句號不放行首', () => {
    const lay = layoutCard(card('一二三，四', { width: 300 }), 1, measure);
    const comma = lay.glyphs.find((g) => g.ch === '，')!;
    expect(comma.line).toBe(0); // 擠在第一行末，不掉到第二行開頭
  });
  it('英文在單字邊界換行；太長的單字硬斷', () => {
    const lay = layoutCard(card('hello world', { width: 300 }), 1, measure);
    const lines = new Map<number, string>();
    for (const g of lay.glyphs) lines.set(g.line, (lines.get(g.line) ?? '') + g.ch);
    expect([...lines.values()].map((s) => s.trim())).toEqual(['hello', 'world']);
    const long = layoutCard(card('abcdefghijklmnopqrstuvwxyz', { width: 300 }), 1, measure);
    expect(Math.max(...long.glyphs.map((g) => g.line))).toBeGreaterThan(0);
  });
  it('對齊：置中/靠右時短的那行位移', () => {
    const c = layoutCard(card('一二三\n一', { width: 300, align: 'center' }), 1, measure);
    expect(c.glyphs[0]!.x).toBeCloseTo(0);
    expect(c.glyphs[3]!.x).toBeCloseTo(100);
    const r = layoutCard(card('一二三\n一', { width: 300, align: 'right' }), 1, measure);
    expect(r.glyphs[3]!.x).toBeCloseTo(200);
  });
  it('空字串不會壞', () => {
    const lay = layoutCard(card(''), 1, measure);
    expect(lay.w).toBeGreaterThan(0);
    expect(lay.h).toBeGreaterThan(0);
  });
});
