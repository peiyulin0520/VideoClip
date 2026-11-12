import { describe, expect, it } from 'vitest';
import { needsProxy, proxySize } from './proxy';

describe('needsProxy：什麼樣的影片要做預覽用輕量影片', () => {
  it('4K、1080p 都要（長邊超過 1280）', () => {
    expect(needsProxy({ width: 3840, height: 2160, codec: 'avc' })).toBe(true);
    expect(needsProxy({ width: 1080, height: 1920, codec: 'avc' })).toBe(true);
  });
  it('HDR 一定要，就算很小', () => {
    expect(needsProxy({ width: 640, height: 360, codec: 'avc', hdr: true })).toBe(true);
  });
  it('iPhone 的 HEVC 要，就算解析度不大', () => {
    expect(needsProxy({ width: 1280, height: 720, codec: 'hevc' })).toBe(true);
  });
  it('已經夠輕的 H.264／VP9 小影片不用', () => {
    expect(needsProxy({ width: 720, height: 1280, codec: 'avc' })).toBe(false);
    expect(needsProxy({ width: 320, height: 568, codec: 'vp8' })).toBe(false);
    expect(needsProxy({ width: 480, height: 270 })).toBe(false);
  });
});

describe('proxySize', () => {
  it('長邊縮到 960、偶數、保持比例', () => {
    expect(proxySize(3840, 2160)).toEqual({ width: 960, height: 540 });
    expect(proxySize(2160, 3840)).toEqual({ width: 540, height: 960 });
    const s = proxySize(1920, 1440);
    expect(Math.max(s.width, s.height)).toBe(960);
    expect(s.width % 2).toBe(0);
    expect(s.height % 2).toBe(0);
  });
  it('本來就小的不放大', () => {
    expect(proxySize(640, 360)).toEqual({ width: 640, height: 360 });
  });
});
