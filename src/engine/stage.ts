// 預覽的「底」永遠是 9:16（預覽和下面的播放列、時間軸位置才不會因為改比例而跳動）。
// 專案的輸出範圍（版面）在底裡面置中、等比放到最大；範圍外的東西也畫，只是蓋一層斜線。

export const BASE_W = 9;
export const BASE_H = 16;

export type StageLayout = {
  /** 底（canvas）的寬高，單位跟輸入的版面寬高一樣 */
  baseW: number;
  baseH: number;
  /** 版面左上角在底上的位置 */
  offX: number;
  offY: number;
  /** 版面占底的比例（0–1） */
  fx: number;
  fy: number;
};

export function stageLayout(w: number, h: number): StageLayout {
  const wider = w * BASE_H >= h * BASE_W; // 版面比 9:16 寬（或一樣）→ 寬度填滿；比較窄 → 高度填滿
  const baseW = wider ? w : Math.round((h * BASE_W) / BASE_H);
  const baseH = wider ? Math.round((w * BASE_H) / BASE_W) : h;
  return {
    baseW,
    baseH,
    offX: Math.round((baseW - w) / 2),
    offY: Math.round((baseH - h) / 2),
    fx: w / baseW,
    fy: h / baseH,
  };
}

/** 版面在底上的位置與大小（都是 0–1 的比例，跟單位無關） */
export function frameFractions(w: number, h: number): { fx: number; fy: number; ox: number; oy: number } {
  const l = stageLayout(w, h);
  const fx = w / l.baseW;
  const fy = h / l.baseH;
  return { fx, fy, ox: (1 - fx) / 2, oy: (1 - fy) / 2 };
}
