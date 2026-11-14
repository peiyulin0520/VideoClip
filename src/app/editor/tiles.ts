/** 一個片段最多畫幾格縮圖（太多手機會卡） */
export const MAX_TILES = 120;

/**
 * 時間軸片段上縮圖的格數與每格寬度：
 * 一般＝每格 tileW、剛好鋪滿；需要的格數超過上限時，格數維持上限、每格放寬，整個片段一定填滿
 * （以前超過上限就少畫，長影片 1 分鐘之後會是空的）。
 */
export function tileLayout(
  widthPx: number,
  tileW: number,
  max = MAX_TILES,
): { count: number; tileW: number } {
  const w = Math.max(widthPx, 0);
  const need = Math.max(Math.ceil(w / Math.max(tileW, 1)), 1);
  if (need <= max) return { count: need, tileW };
  return { count: max, tileW: w / max };
}
