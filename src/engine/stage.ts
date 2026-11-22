// 預覽的「底」＝預覽區整塊（寬 × 固定高度；預覽和下面的播放列、時間軸位置才不會因為改比例而跳動）。
// 專案的輸出範圍（版面）在底裡面置中、等比放到最大；範圍外的東西也畫，只是蓋一層斜線。
// 底的寬高比＝預覽區現在的寬高比（量出來之後用 setBaseAspect 記著；還沒量到之前用 9:16）。

export const DEFAULT_BASE_ASPECT = 9 / 16;
let baseAspect = DEFAULT_BASE_ASPECT;
export const getBaseAspect = () => baseAspect;
/** 預覽區的寬 ÷ 高（四捨五入到 0.01，量到的比例差一點點不用重建預覽引擎） */
export function setBaseAspect(a: number) {
  baseAspect = Number.isFinite(a) && a > 0.2 && a < 5 ? Math.round(a * 100) / 100 : DEFAULT_BASE_ASPECT;
}

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

export function stageLayout(w: number, h: number, aspect = baseAspect): StageLayout {
  const wider = w >= h * aspect; // 版面比底寬（或一樣）→ 寬度填滿；比較窄 → 高度填滿
  const baseW = wider ? w : Math.round(h * aspect);
  const baseH = wider ? Math.round(w / aspect) : h;
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
