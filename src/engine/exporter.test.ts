import { describe, expect, it } from 'vitest';
import { createClip, createProject } from '../model/defaults';
import type { Asset, Project } from '../model/types';
import { audibleItems, chooseFormat, estimateBytes, outputSize, videoBitrate } from './exporter';
import { placeSequential } from './timeline';

describe('outputSize', () => {
  it('長邊縮到 1920／1280，偶數，不放大', () => {
    expect(outputSize({ width: 1080, height: 1920 }, 1920)).toEqual({ width: 1080, height: 1920 });
    expect(outputSize({ width: 1080, height: 1920 }, 1280)).toEqual({ width: 720, height: 1280 });
    expect(outputSize({ width: 1920, height: 1080 }, 1280)).toEqual({ width: 1280, height: 720 });
    expect(outputSize({ width: 1080, height: 1080 }, 1280)).toEqual({ width: 1080, height: 1080 }); // 長邊是上限，不放大
    expect(outputSize({ width: 540, height: 960 }, 1920)).toEqual({ width: 540, height: 960 });
    const s = outputSize({ width: 1080, height: 1440 }, 1280);
    expect(s.width % 2).toBe(0);
    expect(s.height % 2).toBe(0);
  });
});

describe('videoBitrate / estimateBytes', () => {
  it('1080p30 標準 8M、高 14M；60fps 多 5 成；720p 依像素減少', () => {
    expect(videoBitrate(1080, 1920, 30, 'standard')).toBe(8_000_000);
    expect(videoBitrate(1080, 1920, 30, 'high')).toBe(14_000_000);
    expect(videoBitrate(1080, 1920, 60, 'standard')).toBe(12_000_000);
    expect(videoBitrate(720, 1280, 30, 'standard')).toBeCloseTo(3_555_556, -3);
  });
  it('預估大小＝（影片＋聲音）位元率 × 長度', () => {
    const p: Project = createProject('x');
    const a: Asset = {
      id: 'a',
      kind: 'video',
      name: 'a',
      mime: 'video/mp4',
      size: 1,
      duration: 10,
      width: 100,
      height: 100,
      hasAudio: true,
      thumbs: [],
    };
    p.assets = [a];
    p.tracks[0]!.items = placeSequential([createClip(a)]);
    const b = estimateBytes(p, { longSide: 1920, fps: 30, quality: 'standard' });
    expect(b).toBeCloseTo(((8_000_000 + 192_000) * 10) / 8, -3);
  });
});

describe('chooseFormat：依能編的格式決定封裝', () => {
  it('H.264＋AAC → MP4 有聲音', () => {
    const c = chooseFormat({ avc: true, aac: true, vp9: true, opus: true }, true)!;
    expect(c).toMatchObject({ container: 'mp4', videoCodec: 'avc', audioCodec: 'aac', warnings: [] });
  });
  it('H.264 但編不出 AAC → 無聲 MP4，而且一定有警告（不偷偷失敗）', () => {
    const c = chooseFormat({ avc: true, aac: false, vp9: true, opus: true }, true)!;
    expect(c).toMatchObject({ container: 'mp4', audioCodec: null });
    expect(c.warnings.join('')).toContain('AAC');
    expect(c.warnings.join('')).toContain('沒有聲音');
  });
  it('專案本來就沒有聲音：編不出 AAC 也不用警告', () => {
    const c = chooseFormat({ avc: true, aac: false, vp9: false, opus: false }, false)!;
    expect(c.warnings).toEqual([]);
  });
  it('編不出 H.264 → WebM（VP9＋Opus），並說明', () => {
    const c = chooseFormat({ avc: false, aac: false, vp9: true, opus: true }, true)!;
    expect(c).toMatchObject({ container: 'webm', videoCodec: 'vp9', audioCodec: 'opus' });
    expect(c.warnings.join('')).toContain('H.264');
  });
  it('測試用 preferWebm：有 VP9 就走 WebM（沙盒編不出 AAC，要測聲音）', () => {
    const c = chooseFormat({ avc: true, aac: false, vp9: true, opus: true }, true, true)!;
    expect(c).toMatchObject({ container: 'webm', audioCodec: 'opus' });
  });
  it('什麼都編不出 → null', () => {
    expect(chooseFormat({ avc: false, aac: true, vp9: false, opus: true }, true)).toBeNull();
  });
});

describe('audibleItems：哪些影片要出聲', () => {
  const asset = (id: string, hasAudio: boolean): Asset => ({
    id,
    kind: 'video',
    name: id,
    mime: 'video/mp4',
    size: 1,
    duration: 4,
    width: 100,
    height: 100,
    hasAudio,
    thumbs: [],
  });
  it('有音軌、音量 > 0、軌道沒靜音沒隱藏才算；照片與文字不算', () => {
    const p = createProject('x');
    const a = asset('a', true);
    const b = asset('b', false);
    const c = asset('c', true);
    p.assets = [a, b, c];
    p.tracks[0]!.items = placeSequential([createClip(a), createClip(b), { ...createClip(c), volume: 0 }]);
    expect(audibleItems(p).map((x) => x.asset.id)).toEqual(['a']);
    p.tracks[0]!.muted = true;
    expect(audibleItems(p)).toHaveLength(0);
    p.tracks[0]!.muted = false;
    p.tracks[0]!.hidden = true;
    expect(audibleItems(p)).toHaveLength(0);
  });
});
