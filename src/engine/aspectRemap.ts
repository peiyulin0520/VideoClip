import type { Keyframe, Project } from '../model/types';
import { itemBox, type GeoCtx } from './geometry';
import { frameFractions } from './stage';

/**
 * 改比例時「保持原樣」：每個物件在預覽底上看起來的位置、大小、旋轉都不變，
 * 只是輸出範圍（版面）換了形狀——超出新版面的部分留在斜線區、不會輸出。
 * 直接改傳進來的專案（immer 草稿也可以）。ctxFor(w, h)＝在那個寬高的畫面上量物件大小的環境。
 */
export function remapKeepOnStage(
  p: Pick<Project, 'tracks'>,
  oldW: number,
  oldH: number,
  newW: number,
  newH: number,
  ctxFor: (w: number, h: number) => GeoCtx,
): void {
  const lo = frameFractions(oldW, oldH);
  const ln = frameFractions(newW, newH);
  const cOld = ctxFor(oldW, oldH);
  const cNew = ctxFor(newW, newH);
  const mapX = (x: number) => (lo.ox + x * lo.fx - ln.ox) / ln.fx;
  const mapY = (y: number) => (lo.oy + y * lo.fy - ln.oy) / ln.fy;
  for (const tr of p.tracks) {
    for (const it of tr.items) {
      if (it.type === 'audio') continue;
      // 物件在「縮放 1」時的方框寬度：舊畫面、新畫面各量一次（框寬跟縮放成正比，其他欄位不影響）
      const unit = (ctx: GeoCtx) => itemBox({ ...it, transform: { ...it.transform, scale: 1 } }, ctx)?.w;
      const wOld = unit(cOld);
      const wNew = unit(cNew);
      // 在底上的寬度比例 ＝ 框寬 / 畫面寬 × 版面占底的比例；新舊要一樣
      const R = wOld && wNew ? ((wOld / oldW) * lo.fx) / ((wNew / newW) * ln.fx) : 1;
      const t = it.transform;
      t.x = mapX(t.x);
      t.y = mapY(t.y);
      t.scale = t.scale * R;
      for (const k of (it.keyframes ?? []) as Keyframe[]) {
        k.x = mapX(k.x);
        k.y = mapY(k.y);
        k.scale = k.scale * R;
      }
    }
  }
}
