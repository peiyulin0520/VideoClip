import {
  ArrowLeftToLine,
  Copy,
  Crop as CropIcon,
  Gauge,
  Maximize,
  Minimize,
  MoveHorizontal,
  Plus,
  Scissors,
  Trash2,
  Volume2,
} from 'lucide-react';
import { isVideoItem, visibleLayers } from '../../../engine/timeline';
import type { Item } from '../../../model/types';
import { duplicateAny, editItem, removeAnyItem, rippleRemoveItem, splitAny } from '../../../store/actions';
import { startCrop, useCrop } from '../../../store/cropStore';
import { useProjectStore } from '../../../store/projectStore';
import { toast, useUI } from '../../../store/uiStore';
import { CropPanel } from '../CropPanel';
import { ClipPanel, panelActive } from './ClipPanel';
import { ToolButton, type Found, type Panel } from './shared';

/** 剪輯分頁：跟剪輯影片直接有關的基本功能（分割、刪除、複製、修剪、裁切、變速、音量、填滿／完整） */
export function EditTab({
  panel,
  setPanel,
  onImport,
  found,
}: {
  panel: Panel;
  setPanel: (p: Panel) => void;
  onImport: () => void;
  found: Found;
}) {
  const project = useProjectStore((s) => s.project)!;
  const player = useUI((s) => s.player);
  const cropping = useCrop((s) => !!s.s);
  const selected = found?.item;

  const need = (): Item | undefined => {
    if (!selected) toast('請先點選一個片段');
    return selected;
  };

  const split = () => {
    if (!player) return;
    const t = player.time;
    // 有選取就切選取的那個；沒選取就切播放頭這一秒最上面的影像物件
    const target =
      selected ??
      visibleLayers(project, t)
        .filter((l) => l.track.kind === 'media' && !l.track.locked)
        .at(-1)?.item;
    if (!target) return toast('還沒有片段');
    if (!splitAny(target.id, t)) toast('播放頭要在片段中間才能分割（離邊緣至少 0.2 秒）');
  };

  const remove = () => {
    const s = need();
    if (!s) return;
    removeAnyItem(s.id);
    setPanel(null);
  };

  /** 刪除並補齊：同一軌在它後面的物件整個往前移，填掉空位 */
  const removeAndClose = () => {
    const s = need();
    if (!s) return;
    rippleRemoveItem(s.id);
    setPanel(null);
  };

  const toggleFit = () => {
    const s = need();
    if (!s) return;
    if (!isVideoItem(s)) return toast('文字沒有填滿/完整');
    editItem(s.id, (it) => {
      if (it.type !== 'text') it.fit = it.fit === 'cover' ? 'contain' : 'cover';
    });
    toast(s.fit === 'cover' ? '完整顯示（上下或左右留黑邊）' : '填滿畫面（裁掉多餘部分）');
  };

  const openPanel = (p: Exclude<Panel, null>) => {
    const s = need();
    if (!s) return;
    if (!isVideoItem(s)) return toast('文字不能變速或調音量');
    if (p === 'speed' && s.type === 'image') return toast('照片不能變速');
    if (p === 'speed' && s.type === 'audio') return toast('音樂不能變速');
    if (p === 'volume' && s.type === 'image') return toast('照片沒有聲音');
    if (p === 'trim' && s.type === 'image') return toast('照片沒有素材區段，請拖時間軸上的把手調長度');
    setPanel(p);
  };

  if (cropping) return <CropPanel />;
  if (panelActive(panel, found)) return <ClipPanel panel={panel} setPanel={setPanel} found={found} />;

  return (
    <div className="toolbar" role="toolbar" aria-label="剪輯工具">
      <ToolButton icon={Plus} label="匯入" onClick={onImport} />
      <ToolButton icon={Scissors} label="分割" onClick={split} />
      <ToolButton icon={Trash2} label="刪除" onClick={remove} />
      <ToolButton icon={ArrowLeftToLine} label="刪除並補齊" onClick={removeAndClose} />
      <ToolButton icon={Copy} label="複製" onClick={() => need() && duplicateAny(selected!.id)} />
      <ToolButton icon={MoveHorizontal} label="修剪" onClick={() => openPanel('trim')} />
      <ToolButton
        icon={CropIcon}
        label="裁切"
        onClick={() => {
          const s = need();
          if (!s) return;
          if (!isVideoItem(s)) return toast('文字不能裁切');
          startCrop(s.id);
        }}
      />
      <ToolButton icon={Gauge} label="變速" onClick={() => openPanel('speed')} />
      <ToolButton icon={Volume2} label="音量" onClick={() => openPanel('volume')} />
      <ToolButton
        icon={selected && isVideoItem(selected) && selected.fit === 'contain' ? Minimize : Maximize}
        label={selected && isVideoItem(selected) && selected.fit === 'contain' ? '填滿' : '完整'}
        onClick={toggleFit}
      />
    </div>
  );
}
