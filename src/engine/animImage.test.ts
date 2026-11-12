import { describe, expect, it } from 'vitest';
import { decodeAnimBlob, frameIndexAt, sniffImageType } from './animImage';

describe('frameIndexAt：會動的圖片依時間取第幾格', () => {
  const d = [0.3, 0.3, 0.3]; // 一圈 0.9 秒
  it('依經過的時間取格', () => {
    expect(frameIndexAt(d, 0)).toBe(0);
    expect(frameIndexAt(d, 0.29)).toBe(0);
    expect(frameIndexAt(d, 0.3)).toBe(1);
    expect(frameIndexAt(d, 0.65)).toBe(2);
  });
  it('會循環：超過一圈接回第一格', () => {
    expect(frameIndexAt(d, 0.9)).toBe(0);
    expect(frameIndexAt(d, 1.0)).toBe(0);
    expect(frameIndexAt(d, 1.25)).toBe(1);
    expect(frameIndexAt(d, 2.5)).toBe(2);
  });
  it('每格長度不一樣', () => {
    const v = [0.1, 0.5, 0.1];
    expect(frameIndexAt(v, 0.05)).toBe(0);
    expect(frameIndexAt(v, 0.3)).toBe(1);
    expect(frameIndexAt(v, 0.65)).toBe(2);
  });
  it('負的時間（物件還沒開始）、只有一格、長度是 0：都回第 0 格不當掉', () => {
    expect(frameIndexAt(d, -0.1)).toBe(2); // 往回繞
    expect(frameIndexAt([0.2], 5)).toBe(0);
    expect(frameIndexAt([], 5)).toBe(0);
    expect(frameIndexAt([0, 0], 5)).toBe(0);
  });
});

describe('sniffImageType / decodeAnimBlob', () => {
  const bytes = (s: string) => new Blob([new TextEncoder().encode(s)]);
  it('看檔頭認 GIF 與 WebP', async () => {
    expect(await sniffImageType(bytes('GIF89a....'))).toBe('image/gif');
    expect(await sniffImageType(bytes('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp');
    expect(await sniffImageType(bytes('\u0089PNG\r\n'))).toBeNull();
  });
  it('不是動圖或壞掉的檔：回傳 null，不會丟錯', async () => {
    expect(await decodeAnimBlob(bytes('hello world'))).toBeNull();
    expect(await decodeAnimBlob(bytes('GIF89a-broken'))).toBeNull();
  });
});
