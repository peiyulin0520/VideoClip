import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hexToRgb } from './colorMath';

const css = readFileSync('src/app/styles.css', 'utf-8');

// 讀 styles.css 的主題變數，檢查文字對比（WCAG）與「淺色基底」。

type Vars = Record<string, string>;

function block(selector: string): Vars {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) throw new Error(`找不到 ${selector}`);
  const body = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  const out: Vars = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const root = block(':root');
const THEMES: [string, Vars][] = [
  ['dark', root],
  ['mono', { ...root, ...block(":root[data-theme='mono']") }],
  ['fresh', { ...root, ...block(":root[data-theme='fresh']") }],
  ['warm', { ...root, ...block(":root[data-theme='warm']") }],
];

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
function lum(hex: string): number {
  const full = /^#[0-9a-f]{3}$/i.test(hex) ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex;
  const rgb = hexToRgb(full);
  if (!rgb) throw new Error(`不是色碼：${hex}`);
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(THEMES)('主題 %s 的文字對比', (name, v) => {
  const pairs: [string, string, number][] = [
    ['fg', 'bg', 4.5],
    ['fg', 'panel', 4.5],
    ['fg', 'btn', 4.5],
    ['fg', 'timeline', 4.5],
    ['on-accent', 'accent', 4.5],
    ['muted', 'panel', 3],
    ['clip-text-ink', 'clip-text', 4.5],
    ['clip-audio-ink', 'clip-audio', 4.5],
    ['clip-effect-ink', 'clip-effect', 4.5],
    ['danger', 'panel', 3],
    ['ok', 'panel', 3],
    ['warn', 'panel', 3],
  ];
  it.each(pairs)('%s 對 %s ≥ %s', (fg, bg, min) => {
    // 暗黑的粉紅按鈕是原本的設計（粗體大字，WCAG 大字標準 3）
    const need = name === 'dark' && fg === 'on-accent' ? 3 : min;
    expect(contrast(v[fg]!, v[bg]!), `${name}: --${fg} 對 --${bg}`).toBeGreaterThanOrEqual(need);
  });
});

describe('淺色基底', () => {
  it.each(['mono', 'fresh', 'warm'])('%s 的底色是淺色', (name) => {
    const v = THEMES.find((t) => t[0] === name)![1];
    expect(lum(v['bg']!)).toBeGreaterThan(0.7);
    expect(lum(v['panel']!)).toBeGreaterThan(0.7);
  });
  it('溫暖是米色：偏黃、不是純白也不是深咖啡', () => {
    const v = THEMES.find((t) => t[0] === 'warm')![1];
    const [r, , b] = hexToRgb(v['bg']!)!;
    expect(r).toBeGreaterThan(b + 10); // 偏暖
    expect(lum(v['bg']!)).toBeLessThan(0.95); // 不是純白
  });
});
