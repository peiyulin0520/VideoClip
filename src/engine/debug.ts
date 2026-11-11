import { useProjectStore } from '../store/projectStore';
import { urlFor } from './assetUrls';
import { renderFrame } from './exportFrame';
import type { Player } from './player';

/** 測試/除錯用：localStorage 的 vc-debug 設成 1 才會掛出 window.__videoclip。正常使用者看不到。 */
export function installDebugHook(player: Player) {
  const on = (() => {
    try {
      return localStorage.getItem('vc-debug') === '1';
    } catch {
      return false;
    }
  })();
  if (!on) return;
  const hook = {
    project: () => JSON.parse(JSON.stringify(useProjectStore.getState().project)),
    time: () => player.time,
    selected: () => useProjectStore.getState().selectedId,
    /** 預覽畫面某區塊（0–1 比例）裡，和 rgb 差不多（每個色版差 tol 以內）的像素有幾個 */
    countColor(
      rgb: [number, number, number],
      tol: number,
      nx0: number,
      ny0: number,
      nx1: number,
      ny1: number,
    ) {
      const c = player.compositor;
      const px = c.readRegion(nx0 * c.width, ny0 * c.height, (nx1 - nx0) * c.width, (ny1 - ny0) * c.height);
      let n = 0;
      for (let i = 0; i < px.length; i += 4)
        if (
          Math.abs(px[i]! - rgb[0]) <= tol &&
          Math.abs(px[i + 1]! - rgb[1]) <= tol &&
          Math.abs(px[i + 2]! - rgb[2]) <= tol
        )
          n++;
      return n;
    },
    /** 預覽畫面上某一點的顏色，座標用 0–1 的比例 */
    samplePreview(nx: number, ny: number) {
      const c = player.compositor;
      return c.samplePixel(nx * c.width, ny * c.height);
    },
    /** 用輸出解析度畫出 t 秒那一格（匯出共用的流程），回傳 PNG 大小與幾個取樣點的顏色 */
    async exportFrame(t: number, points: [number, number][]) {
      const p = useProjectStore.getState().project!;
      const { blob } = await renderFrame(p, t, (id) => urlFor(p.id, id));
      const bmp = await createImageBitmap(blob);
      const cv = document.createElement('canvas');
      cv.width = bmp.width;
      cv.height = bmp.height;
      const ctx = cv.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      return {
        width: bmp.width,
        height: bmp.height,
        bytes: blob.size,
        samples: points.map(([nx, ny]) =>
          Array.from(ctx.getImageData(Math.floor(nx * bmp.width), Math.floor(ny * bmp.height), 1, 1).data),
        ),
      };
    },
  };
  (window as unknown as { __videoclip: typeof hook }).__videoclip = hook;
}
