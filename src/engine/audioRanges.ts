import type { VideoItem } from '../model/types';

// 音訊靜音標記（VideoItem.audioRanges）：保留聲音的素材秒數範圍，範圍外靜音。預覽、匯出共用這裡的判斷。

type R = [number, number];

/** 素材第 s 秒有沒有聲音（沒有 audioRanges ＝ 整段都有） */
export function audioRetained(item: Pick<VideoItem, 'audioRanges'>, s: number): boolean {
  return !item.audioRanges || item.audioRanges.some(([a, b]) => s >= a && s < b);
}

/** 這個物件要出聲的素材範圍（跟物件自己用到的 [srcStart, srcEnd] 取交集，匯出混音時一段一段處理） */
export function audioSpans(item: VideoItem): R[] {
  const srcStart = item.trimIn;
  const srcEnd = item.trimIn + item.duration * item.speed;
  if (!item.audioRanges) return [[srcStart, srcEnd]];
  return item.audioRanges
    .map(([a, b]): R => [Math.max(a, srcStart), Math.min(b, srcEnd)])
    .filter(([a, b]) => b - a > 1e-4)
    .sort((x, y) => x[0] - y[0]);
}

/** 標記全部等於物件目前用到的整段（沒有靜音的地方）＝不需要存 audioRanges */
export function isFullRange(item: VideoItem, ranges: R[]): boolean {
  const srcStart = item.trimIn;
  const srcEnd = item.trimIn + item.duration * item.speed;
  const spans = [...ranges].sort((x, y) => x[0] - y[0]);
  let at = srcStart;
  for (const [a, b] of spans) {
    if (a > at + 1e-3) return false;
    at = Math.max(at, b);
  }
  return at >= srcEnd - 1e-3;
}
