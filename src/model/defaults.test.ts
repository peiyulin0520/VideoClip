import { ASPECTS, createProject, pickAspect } from './defaults';

describe('pickAspect：挑最接近的專案比例', () => {
  it.each([
    [1080, 1920, '9:16'],
    [320, 568, '9:16'],
    [1920, 1080, '16:9'],
    [480, 270, '16:9'],
    [1000, 1000, '1:1'],
    [4032, 3024, '4:3'],
    [400, 300, '4:3'],
    [3024, 4032, '3:4'],
    [2160, 3840, '9:16'],
  ])('%i×%i → %s', (w, h, expected) => {
    expect(pickAspect(w, h)).toBe(expected);
  });
  it('寬高不合理時退回 9:16', () => {
    expect(pickAspect(0, 100)).toBe('9:16');
    expect(pickAspect(NaN, 100)).toBe('9:16');
  });
  it('每個比例自己的寬高都會選回自己', () => {
    for (const [k, a] of Object.entries(ASPECTS)) expect(pickAspect(a.width, a.height)).toBe(k);
  });
  it('專案解析度偶數、aspectAuto 只在需要時才有', () => {
    for (const a of Object.values(ASPECTS)) expect(a.width % 2 === 0 && a.height % 2 === 0).toBe(true);
    expect(createProject('x', '9:16').aspectAuto).toBeUndefined();
    expect(createProject('x', '9:16', 1, true).aspectAuto).toBe(true);
  });
});
