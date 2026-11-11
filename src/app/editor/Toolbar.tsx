import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Gauge,
  Maximize,
  Minimize,
  Plus,
  Scissors,
  Trash2,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { MAX_SPEED, MIN_SPEED } from '../../model/defaults';
import {
  duplicateItem,
  itemAt,
  mainTrack,
  moveItem,
  removeItem,
  setSpeed,
  splitItem,
} from '../../engine/timeline';
import { setMainItems, useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';

type Panel = 'speed' | 'volume' | null;

function ToolButton({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button className={`tool${active ? ' active' : ''}`} onClick={onClick} aria-label={label}>
      <Icon size={22} />
      <span>{label}</span>
    </button>
  );
}

const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 4];

export function Toolbar({ onImport }: { onImport: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const selectedId = useProjectStore((s) => s.selectedId);
  const player = useUI((s) => s.player);
  const [panel, setPanel] = useState<Panel>(null);

  const items = mainTrack(project).items;
  const selected = items.find((i) => i.id === selectedId);

  const needSelection = (): typeof selected => {
    if (!selected) toast('請先點選一個片段');
    return selected;
  };

  const split = () => {
    if (!player) return;
    const t = player.time;
    const target =
      selected && t > selected.start && t < selected.start + selected.duration
        ? selected
        : itemAt(items, t)?.item;
    if (!target) return toast('還沒有片段');
    const out = splitItem(items, target.id, t);
    if (!out) return toast('播放頭要在片段中間才能分割（離邊緣至少 0.2 秒）');
    const idx = items.findIndex((i) => i.id === target.id);
    setMainItems(out);
    useProjectStore.getState().select(out[idx + 1]!.id);
  };

  const remove = () => {
    const s = needSelection();
    if (!s) return;
    const idx = items.findIndex((i) => i.id === s.id);
    const out = removeItem(items, s.id);
    setMainItems(out, { select: out[Math.min(idx, out.length - 1)]?.id ?? null });
    setPanel(null);
  };

  const duplicate = () => {
    const s = needSelection();
    if (!s) return;
    const r = duplicateItem(items, s.id);
    if (r) setMainItems(r.items, { select: r.newId });
  };

  const move = (dir: -1 | 1) => {
    const s = needSelection();
    if (!s) return;
    const idx = items.findIndex((i) => i.id === s.id);
    if (idx + dir < 0 || idx + dir >= items.length) return toast(dir < 0 ? '已經是第一個' : '已經是最後一個');
    setMainItems(moveItem(items, s.id, idx + dir));
  };

  const toggleFit = () => {
    const s = needSelection();
    if (!s) return;
    setMainItems(
      items.map((i) => (i.id === s.id ? { ...i, fit: i.fit === 'cover' ? 'contain' : 'cover' } : i)),
    );
    toast(s.fit === 'cover' ? '完整顯示（上下或左右留黑邊）' : '填滿畫面（裁掉多餘部分）');
  };

  const openPanel = (p: Exclude<Panel, null>) => {
    const s = needSelection();
    if (!s) return;
    if (p === 'speed' && s.type === 'image') return toast('照片不能變速');
    if (p === 'volume' && s.type === 'image') return toast('照片沒有聲音');
    setPanel(p);
  };

  if (panel && selected) {
    const asset = project.assets.find((a) => a.id === selected.assetId);
    return (
      <div className="panel" role="group" aria-label={panel === 'speed' ? '變速' : '音量'}>
        {panel === 'speed' ? (
          <>
            <div className="panel-head">
              <span>播放速度</span>
              <b data-testid="speed-value">{selected.speed}x</b>
            </div>
            <input
              type="range"
              aria-label="播放速度"
              min={Math.log2(MIN_SPEED)}
              max={Math.log2(MAX_SPEED)}
              step={0.01}
              value={Math.log2(selected.speed)}
              onChange={(e) => {
                const v = Math.round(2 ** Number(e.target.value) * 100) / 100;
                setMainItems(setSpeed(items, selected.id, v), { coalesce: `speed:${selected.id}` });
              }}
            />
            <div className="chips">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  className={`chip${selected.speed === s ? ' active' : ''}`}
                  onClick={() => setMainItems(setSpeed(items, selected.id, s))}
                >
                  {s}x
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="panel-head">
              <span>音量{asset && !asset.hasAudio ? '（這支影片沒有聲音）' : ''}</span>
              <b data-testid="volume-value">{Math.round(selected.volume * 100)}%</b>
            </div>
            <input
              type="range"
              aria-label="音量"
              min={0}
              max={1}
              step={0.01}
              value={selected.volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMainItems(
                  items.map((i) => (i.id === selected.id ? { ...i, volume: v } : i)),
                  { coalesce: `vol:${selected.id}` },
                );
              }}
            />
            <div className="chips">
              {[0, 0.5, 1].map((v) => (
                <button
                  key={v}
                  className={`chip${selected.volume === v ? ' active' : ''}`}
                  onClick={() =>
                    setMainItems(items.map((i) => (i.id === selected.id ? { ...i, volume: v } : i)))
                  }
                >
                  {v === 0 ? '靜音' : `${v * 100}%`}
                </button>
              ))}
            </div>
          </>
        )}
        <button className="btn primary done" onClick={() => setPanel(null)}>
          完成
        </button>
      </div>
    );
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="剪輯工具">
      <ToolButton icon={Plus} label="匯入" onClick={onImport} />
      <ToolButton icon={Scissors} label="分割" onClick={split} />
      <ToolButton icon={Trash2} label="刪除" onClick={remove} />
      <ToolButton icon={Copy} label="複製" onClick={duplicate} />
      <ToolButton icon={ArrowLeft} label="前移" onClick={() => move(-1)} />
      <ToolButton icon={ArrowRight} label="後移" onClick={() => move(1)} />
      <ToolButton icon={Gauge} label="變速" onClick={() => openPanel('speed')} />
      <ToolButton icon={Volume2} label="音量" onClick={() => openPanel('volume')} />
      <ToolButton
        icon={selected?.fit === 'contain' ? Minimize : Maximize}
        label={selected?.fit === 'contain' ? '填滿' : '完整'}
        onClick={toggleFit}
      />
    </div>
  );
}
