import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeHex, PALETTE } from './ColorPicker';

describe('顏色工具', () => {
  it('色碼：接受 #RRGGBB（大小寫、有無 #、前後空白），其他不接受', () => {
    expect(normalizeHex('#12AB34')).toBe('#12ab34');
    expect(normalizeHex('12ab34')).toBe('#12ab34');
    expect(normalizeHex('  #FFFFFF ')).toBe('#ffffff');
    for (const bad of ['#fff', '#12ab3', '#12ab345', 'red', '', '#gg0000'])
      expect(normalizeHex(bad)).toBeNull();
  });
  it('色票剛好 32 色、4 組、沒有重複、都是合法色碼', () => {
    const all = PALETTE.flatMap((g) => g.colors);
    expect(PALETTE).toHaveLength(4);
    expect(all).toHaveLength(32);
    expect(new Set(all.map((c) => c.toLowerCase())).size).toBe(32);
    for (const c of all) expect(normalizeHex(c)).not.toBeNull();
  });
});

describe('最近用過', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });
  it('最新在最前面、重複的移到最前、最多 8 個，並存在 localStorage', async () => {
    const m = await import('./ColorPicker');
    for (const c of [
      '#000001',
      '#000002',
      '#000003',
      '#000004',
      '#000005',
      '#000006',
      '#000007',
      '#000008',
      '#000009',
    ])
      m.pushRecent(c);
    m.pushRecent('#000005'); // 重複 → 移到最前
    m.pushRecent('not a color'); // 無效 → 忽略
    const saved = JSON.parse(localStorage.getItem('vc-recent-colors')!);
    expect(saved).toHaveLength(8);
    expect(saved[0]).toBe('#000005');
    expect(saved[1]).toBe('#000009');
    expect(saved.filter((c: string) => c === '#000005')).toHaveLength(1);
  });
  it('重新載入後讀得回來；壞掉的資料不會讓它當掉', async () => {
    localStorage.setItem('vc-recent-colors', JSON.stringify(['#abcdef', 5, null]));
    const m = await import('./ColorPicker');
    m.pushRecent('#111111');
    expect(JSON.parse(localStorage.getItem('vc-recent-colors')!)).toEqual(['#111111', '#abcdef']);
    vi.resetModules();
    localStorage.setItem('vc-recent-colors', '{壞掉');
    const m2 = await import('./ColorPicker');
    m2.pushRecent('#222222');
    expect(JSON.parse(localStorage.getItem('vc-recent-colors')!)).toEqual(['#222222']);
  });
});
