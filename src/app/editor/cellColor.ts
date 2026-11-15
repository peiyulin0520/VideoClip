import { ensureUrls } from '../../engine/assetUrls';
import { importFiles } from '../../engine/importMedia';
import type { Asset } from '../../model/types';
import { addToCell } from '../../store/actions';
import { useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';

/** 色塊素材：16×16 純色小圖，當成照片放進版型的格子（origin:'color'）；同一個顏色重複用同一個素材 */
export async function ensureColorAsset(projectId: string, color: string): Promise<Asset | null> {
  const p = useProjectStore.getState().project;
  const old = p?.assets.find((a) => a.origin === 'color' && a.color?.toLowerCase() === color.toLowerCase());
  if (old) return old;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 16, 16);
  const blob: Blob = await new Promise((ok, bad) =>
    c.toBlob((b) => (b ? ok(b) : bad(new Error('色塊轉成圖片失敗'))), 'image/png'),
  );
  const file = new File([blob], `色塊-${color}.png`, { type: 'image/png' });
  const res = await importFiles(projectId, [file]);
  const a = res.assets[0];
  if (!a) return null;
  const asset: Asset = { ...a, origin: 'color', color, name: '色塊' };
  await ensureUrls(projectId, [asset]);
  return asset;
}

/** 在版型某一格最後加一段色塊（顏色可以之後在素材清單改不同的一段） */
export async function addColorToCell(projectId: string, trackId: string, color: string): Promise<boolean> {
  const { setBusy } = useUI.getState();
  setBusy('加色塊…');
  try {
    const asset = await ensureColorAsset(projectId, color);
    if (!asset) {
      toast('色塊做不出來');
      return false;
    }
    return !!addToCell(trackId, asset);
  } finally {
    setBusy(null);
  }
}
