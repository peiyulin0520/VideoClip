import { ensureUrls } from '../../engine/assetUrls';
import { importFiles } from '../../engine/importMedia';
import { layoutById, renderFramePng, type LayoutId } from '../../engine/layouts';
import { applyFrameStyle } from '../../store/actions';
import { useProjectStore } from '../../store/projectStore';
import { toast } from '../../store/uiStore';

/** 版型外框改顏色或透明度：重畫外框圖、換掉外框的素材（一步復原）。舊版型（沒有記錄用哪個版型）不能改 */
export async function restyleFrame(group: string, patch: Partial<{ color: string; opacity: number }>) {
  const p = useProjectStore.getState().project;
  if (!p) return;
  const frame = p.tracks
    .flatMap((t) => t.items)
    .find((x) => x.type !== 'text' && x.type !== 'audio' && x.group === group && x.frameStyle);
  if (!frame || frame.type === 'text' || frame.type === 'audio' || !frame.frameStyle) return;
  const style = { ...frame.frameStyle, ...patch };
  const def = layoutById(style.layout as LayoutId);
  if (!def) return;
  try {
    const blob = await renderFramePng(def, p.width, p.height, style.color, style.opacity);
    const file = new File([blob], `版型-${def.name}.png`, { type: 'image/png' });
    const res = await importFiles(p.id, [file]);
    const asset = res.assets[0];
    if (!asset) return toast('外框重畫失敗', 4000);
    await ensureUrls(p.id, [asset]);
    applyFrameStyle(group, asset, style);
  } catch {
    toast('外框重畫失敗', 4000);
  }
}
