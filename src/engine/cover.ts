import { urlFor } from './assetUrls';
import { renderFrame } from './exportFrame';
import type { Project } from '../model/types';

// 專案封面：長邊 480px 的 JPEG data URL，存在專案裡（Project.cover）。

export const COVER_LONG_SIDE = 480;
const QUALITY = 0.85;

/** 任何圖（Blob／File／縮圖的 data URL）縮成封面 */
export async function coverFromBlob(blob: Blob): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, COVER_LONG_SIDE / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(bmp.width * k));
  cv.height = Math.max(1, Math.round(bmp.height * k));
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close();
  return cv.toDataURL('image/jpeg', QUALITY);
}

export async function coverFromDataUrl(url: string): Promise<string> {
  return coverFromBlob(await (await fetch(url)).blob());
}

/** 用目前預覽的這一格（整個專案合起來的畫面）當封面 */
export async function coverFromProject(p: Project, t: number): Promise<string> {
  const { blob } = await renderFrame(p, t, (id) => urlFor(p.id, id, 'export'));
  return coverFromBlob(blob);
}
