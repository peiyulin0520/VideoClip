import { describe, expect, it } from 'vitest';
import { describeError, mb } from './importMedia';
import { canDecodeThumbs } from './probe';

describe('匯入錯誤訊息', () => {
  it('Safari 的 UnknownError／out of memory → 記憶體不足', () => {
    const e = new DOMException(
      'The operation failed for an unknown transient reason (e.g. out of memory).',
      'UnknownError',
    );
    expect(describeError(e)).toBe('記憶體不足');
    expect(describeError(new Error('Out of memory'))).toBe('記憶體不足');
  });
  it('配額用完 → 手機儲存空間不足', () => {
    expect(describeError(new DOMException('x', 'QuotaExceededError'))).toBe('手機儲存空間不足');
  });
  it('其他錯誤保留原文，空的給預設', () => {
    expect(describeError(new Error('壞掉了'))).toBe('壞掉了');
    expect(describeError(undefined)).toBe('undefined');
    expect(describeError(new Error(''))).toBe('Error');
  });
  it('檔案大小用 MB 顯示，至少 1', () => {
    expect(mb(312 * 1024 * 1024)).toBe('312 MB');
    expect(mb(10)).toBe('1 MB');
  });
});

describe('縮圖要不要用 WebCodecs 解碼', () => {
  it('1080p、小檔 → 解；4K 或大檔 → 不解（交給播放器補）', () => {
    expect(canDecodeThumbs(1080, 1920, 20e6)).toBe(true);
    expect(canDecodeThumbs(2160, 3840, 20e6)).toBe(false);
    expect(canDecodeThumbs(1080, 1920, 400e6)).toBe(false);
  });
});
