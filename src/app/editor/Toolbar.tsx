import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftToLine,
  ArrowRight,
  ArrowUp,
  Copy,
  Crop as CropIcon,
  Eye,
  EyeOff,
  Gauge,
  Layers,
  Lock,
  Maximize,
  Minimize,
  MoveHorizontal,
  Plus,
  Scissors,
  Trash2,
  Type,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { ensureUrls } from '../../engine/assetUrls';
import { BLEND_LABELS } from '../../engine/geometry';
import { importFiles } from '../../engine/importMedia';
import {
  findItem,
  gapOf,
  isVideoItem,
  itemAt,
  layersAt,
  mainItems,
  moveItem,
  removeGap,
  setSpeed,
  totalDuration,
} from '../../engine/timeline';
import { MAX_SPEED, MIN_SPEED } from '../../model/defaults';
import type { BlendMode, Item, VideoItem } from '../../model/types';
import {
  addMusic,
  addText,
  duplicateAny,
  editItem,
  patchTrack,
  removeAnyItem,
  removeGroup,
  shiftTrackLayer,
  setAllVideoMuted,
  splitAny,
  videoTracksMuted,
} from '../../store/actions';
import { setMainItems, setTrackItems, useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';
import { Slider } from '../../ui/Slider';
import { LayoutPicker } from './LayoutPicker';
import { StickerPicker } from './StickerPicker';
import { TextPanel } from './TextPanel';
import { CropPanel } from './CropPanel';
import { TrimPanel } from './TrimPanel';
import { cancelCrop, startCrop, useCrop } from '../../store/cropStore';
import { TransformControls } from './TransformControls';

export type Tab = 'edit' | 'overlay' | 'text' | 'layers';
type Panel = 'speed' | 'volume' | 'trim' | null;

const TABS: { id: Tab; label: string }[] = [
  { id: 'edit', label: '剪輯' },
  { id: 'overlay', label: '疊加' },
  { id: 'text', label: '文字' },
  { id: 'layers', label: '圖層' },
];

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
const COLORS = ['#ffffff', '#111111', '#ff4d8d', '#ffd23f', '#4dd0ff', '#7CFC6A', '#b388ff', '#ff7a45'];
const BLENDS = Object.keys(BLEND_LABELS) as BlendMode[];

export function BottomBar({
  onImportMain,
  onImportOverlay,
}: {
  onImportMain: () => void;
  onImportOverlay: () => void;
}) {
  const project = useProjectStore((s) => s.project)!;
  const selectedId = useProjectStore((s) => s.selectedId);
  const [tab, setTab] = useState<Tab>('edit');
  const [panel, setPanel] = useState<Panel>(null);
  const [collapsed, setCollapsed] = useState(false);

  const found = findItem(project, selectedId);
  const items = mainItems(project);
  const barRef = useRef<HTMLDivElement>(null);

  // 點目前的分頁＝收合/展開下面的面板（讓出空間給預覽畫面）
  const switchTab = (t: Tab) => {
    setPanel(null);
    cancelCrop(); // 離開剪輯分頁就結束裁切模式（不套用）
    if (t === tab) setCollapsed((c) => !c);
    else {
      setTab(t);
      setCollapsed(false);
    }
    // 分頁列黏在頂端時（已經往下捲過），切分頁後停在分頁列的位置，不要停在新面板的一半
    const el = barRef.current;
    if (el) {
      const stickTop = parseFloat(getComputedStyle(el).getPropertyValue('--top-h')) || 52;
      if (el.getBoundingClientRect().top <= stickTop + 1)
        requestAnimationFrame(() => window.scrollTo({ top: el.offsetTop - stickTop }));
    }
  };

  return (
    <div className="bottombar" ref={barRef}>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            aria-expanded={tab === t.id ? !collapsed : undefined}
            className={`tab${tab === t.id ? ' active' : ''}`}
            onClick={() => switchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'edit' && (
        <EditTab panel={panel} setPanel={setPanel} onImport={onImportMain} found={found} items={items} />
      )}
      {!collapsed && tab === 'overlay' && <OverlayTab onImportOverlay={onImportOverlay} />}
      {!collapsed && tab === 'text' && <TextTab found={found} />}
      {!collapsed && tab === 'layers' && <LayersTab />}
    </div>
  );
}

type Found = ReturnType<typeof findItem>;

function EditTab({
  panel,
  setPanel,
  onImport,
  found,
  items,
}: {
  panel: Panel;
  setPanel: (p: Panel) => void;
  onImport: () => void;
  found: Found;
  items: VideoItem[];
}) {
  const project = useProjectStore((s) => s.project)!;
  const player = useUI((s) => s.player);
  const cropping = useCrop((s) => !!s.s);
  const selected = found?.item;
  const isMain = found?.track.kind === 'main';

  const need = (): Item | undefined => {
    if (!selected) toast('請先點選一個片段');
    return selected;
  };

  const split = () => {
    if (!player) return;
    const t = player.time;
    // 有選取就切選取的那個；沒選取就切主軌上播放頭所在的片段
    const target = selected ?? itemAt(items, t)?.item;
    if (!target) return toast('還沒有片段');
    if (!splitAny(target.id, t)) toast('播放頭要在片段中間才能分割（離邊緣至少 0.2 秒）');
  };

  const remove = () => {
    const s = need();
    if (!s) return;
    const idx = found!.index;
    const wasMain = isMain;
    const nextId = wasMain
      ? items[Math.min(idx + 1, items.length - 1)]?.id !== s.id
        ? items[Math.min(idx + 1, items.length - 1)]?.id
        : items[idx - 1]?.id
      : null;
    removeAnyItem(s.id);
    if (nextId) useProjectStore.getState().select(nextId);
    setPanel(null);
  };

  const move = (dir: -1 | 1) => {
    const s = need();
    if (!s) return;
    if (!isMain) return toast('疊加素材請長按後左右拖曳，調整出現的時間');
    const idx = found!.index;
    if (idx + dir < 0 || idx + dir >= items.length) return toast(dir < 0 ? '已經是第一個' : '已經是最後一個');
    setMainItems(moveItem(items, s.id, idx + dir));
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

  const removeMainGap = (id: string) => setMainItems(removeGap(items, id));

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

  if (panel === 'trim' && selected && isVideoItem(selected) && found) {
    const asset = project.assets.find((a) => a.id === selected.assetId);
    if (asset)
      return <TrimPanel item={selected} asset={asset} track={found.track} onClose={() => setPanel(null)} />;
  }

  if (panel && selected && isVideoItem(selected)) {
    const asset = project.assets.find((a) => a.id === selected.assetId);
    const setVideo = (patch: Partial<VideoItem>, coalesce?: string) =>
      editItem(selected.id, (it) => void Object.assign(it, patch), coalesce ? { coalesce } : undefined);
    const applySpeed = (v: number, coalesce?: string) => {
      const f = findItem(project, selected.id)!;
      if (f.track.kind === 'main')
        setMainItems(
          setSpeed(f.track.items as VideoItem[], selected.id, v),
          coalesce ? { coalesce } : undefined,
        );
      else {
        // 疊加軌：改速度時長度跟著變，但不能壓到後面的物件
        const span = selected.duration * selected.speed;
        const want = Math.max(span / v, 0.2);
        const next = (f.track.items as Item[]).map((x) =>
          x.id === selected.id ? { ...x, speed: v, duration: want } : x,
        );
        const nextStart = (f.track.items as Item[])
          .filter((x) => x.id !== selected.id && x.start >= selected.start + 1e-6)
          .reduce((m, x) => Math.min(m, x.start), Infinity);
        if (selected.start + want > nextStart + 1e-6) return toast('後面有別的物件，這個速度會讓它們重疊');
        setTrackItems(f.track.id, next, coalesce ? { coalesce } : undefined);
      }
    };
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
              onChange={(e) =>
                applySpeed(Math.round(2 ** Number(e.target.value) * 100) / 100, `speed:${selected.id}`)
              }
            />
            <div className="chips">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  className={`chip${selected.speed === s ? ' active' : ''}`}
                  onClick={() => applySpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="panel-head">
              <span>
                {selected.type === 'audio' ? '音樂音量' : '音量'}
                {asset && !asset.hasAudio ? '（這支影片沒有聲音）' : ''}
              </span>
              <b data-testid="volume-value">{Math.round(selected.volume * 100)}%</b>
            </div>
            {found?.track.muted && (
              <p className="hint warn">這條軌道目前是靜音的（點時間軸左邊的圖示可以取消靜音）。</p>
            )}
            <input
              type="range"
              aria-label="音量"
              min={0}
              max={2}
              step={0.01}
              value={selected.volume}
              onChange={(e) => setVideo({ volume: Number(e.target.value) }, `vol:${selected.id}`)}
            />
            <div className="chips">
              {[0, 0.5, 1, 1.5, 2].map((v) => (
                <button
                  key={v}
                  className={`chip${selected.volume === v ? ' active' : ''}`}
                  aria-label={v === 0 ? '關閉聲音' : `音量 ${v * 100}%`}
                  onClick={() => setVideo({ volume: v })}
                >
                  {v === 0 ? '關閉聲音' : `${v * 100}%`}
                </button>
              ))}
            </div>
            <Slider
              label="淡入"
              value={selected.fadeIn ?? 0}
              min={0}
              max={Math.max(Math.min(5, Math.round((selected.duration / 2) * 10) / 10), 0.1)}
              step={0.1}
              format={(v) => `${v.toFixed(1)} 秒`}
              onChange={(v) => setVideo({ fadeIn: v }, `fi:${selected.id}`)}
            />
            <Slider
              label="淡出"
              value={selected.fadeOut ?? 0}
              min={0}
              max={Math.max(Math.min(5, Math.round((selected.duration / 2) * 10) / 10), 0.1)}
              step={0.1}
              format={(v) => `${v.toFixed(1)} 秒`}
              onChange={(v) => setVideo({ fadeOut: v }, `fo:${selected.id}`)}
            />
          </>
        )}
        <button className="btn primary done" onClick={() => setPanel(null)}>
          完成
        </button>
      </div>
    );
  }

  // 選到背景音樂：只有音樂用得到的工具
  if (selected && selected.type === 'audio') {
    return (
      <div className="toolbar" role="toolbar" aria-label="音樂工具">
        <ToolButton icon={Scissors} label="分割" onClick={split} />
        <ToolButton icon={Trash2} label="刪除" onClick={remove} />
        <ToolButton icon={Copy} label="複製" onClick={() => duplicateAny(selected.id)} />
        <ToolButton icon={MoveHorizontal} label="修剪" onClick={() => openPanel('trim')} />
        <ToolButton icon={Volume2} label="音量" onClick={() => openPanel('volume')} />
      </div>
    );
  }

  const allMuted = videoTracksMuted(project);
  return (
    <div className="toolbar" role="toolbar" aria-label="剪輯工具">
      <ToolButton icon={Plus} label="匯入" onClick={onImport} />
      <ToolButton icon={Scissors} label="分割" onClick={split} />
      <ToolButton icon={Trash2} label="刪除" onClick={remove} />
      {selected && isVideoItem(selected) && selected.group && (
        <ToolButton icon={Trash2} label="移除版型" onClick={() => removeGroup(selected.group!)} />
      )}
      <ToolButton icon={Copy} label="複製" onClick={() => need() && duplicateAny(selected!.id)} />
      <ToolButton icon={ArrowLeft} label="前移" onClick={() => move(-1)} />
      <ToolButton icon={ArrowRight} label="後移" onClick={() => move(1)} />
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
      {isMain && selected && isVideoItem(selected) && gapOf(selected) > 0 && (
        <ToolButton icon={ArrowLeftToLine} label="刪除空白" onClick={() => removeMainGap(selected.id)} />
      )}
      <ToolButton icon={Gauge} label="變速" onClick={() => openPanel('speed')} />
      <ToolButton icon={Volume2} label="音量" onClick={() => openPanel('volume')} />
      <ToolButton
        icon={allMuted ? Volume2 : VolumeX}
        label={allMuted ? '恢復影片聲音' : '全部影片靜音'}
        active={allMuted}
        onClick={() => {
          setAllVideoMuted(!allMuted);
          toast(allMuted ? '影片的聲音恢復了' : '所有影片都靜音了（背景音樂不受影響）');
        }}
      />
      <ToolButton
        icon={selected && isVideoItem(selected) && selected.fit === 'contain' ? Minimize : Maximize}
        label={selected && isVideoItem(selected) && selected.fit === 'contain' ? '填滿' : '完整'}
        onClick={toggleFit}
      />
    </div>
  );
}

/** 背景音樂：從「檔案」選 mp3／m4a／wav…，放在播放頭這一秒的音樂軌 */
function MusicImport() {
  const input = useRef<HTMLInputElement>(null);
  const onFiles = async (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (input.current) input.current.value = '';
    if (!files.length) return;
    const st = useProjectStore.getState();
    const pid = st.project?.id;
    if (!pid) return;
    if (totalDuration(st.project!) <= 0) return toast('先匯入影片或照片，再加背景音樂');
    const { setBusy, player } = useUI.getState();
    setBusy('匯入音樂中…');
    try {
      const res = await importFiles(pid, files);
      if (res.assets.length) {
        await ensureUrls(pid, res.assets);
        addMusic(res.assets, player?.time ?? 0);
        toast(`已加入背景音樂：${res.assets.map((a) => a.name).join('、')}`);
      }
      if (res.failed.length)
        toast(`無法匯入：${res.failed.map((f) => `${f.name}（${f.reason}）`).join('、')}`, 8000);
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <div className="panel-head">
        <span>背景音樂</span>
      </div>
      <button className="btn done" onClick={() => input.current?.click()}>
        ＋ 加入背景音樂（從「檔案」選 mp3、m4a、wav…）
      </button>
      <input
        ref={input}
        type="file"
        accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac,.caf"
        multiple
        hidden
        data-testid="music-input"
        onChange={(e) => void onFiles(e.target.files)}
      />
      <p className="hint music-note">
        音樂會放在目前這一秒，最長到影片結束。點時間軸上的音樂可以分割、修剪、調音量和淡入淡出。發 Reels
        時，也可以先匯出，再在 Instagram 裡加熱門音樂（比較不會有版權問題）。
      </p>
    </>
  );
}

function OverlayTab({ onImportOverlay }: { onImportOverlay: () => void }) {
  return (
    <div className="panel">
      <p className="hint">
        疊加的影片、照片、貼圖會放在播放頭這一秒，同一秒可以疊很多個（每個放在自己的軌道）。加好後在預覽上拖移、雙指縮放旋轉，細節到「圖層」調整。
      </p>
      <button className="btn primary done" onClick={onImportOverlay}>
        ＋ 加入影片或照片（疊在目前這一秒）
      </button>
      <div className="panel-head">
        <span>貼圖</span>
      </div>
      <StickerPicker />
      <LayoutPicker />
      <MusicImport />
    </div>
  );
}

function TextTab({ found }: { found: Found }) {
  const player = useUI((s) => s.player);
  const item = found?.item.type === 'text' ? found.item : null;
  const add = () => addText(player?.time ?? 0);
  return (
    <div className="panel text-panel">
      {item ? (
        <TextPanel item={item} onAdd={add} onAddShape={() => addText(player?.time ?? 0, true)} />
      ) : (
        <>
          <button className="btn primary done" onClick={add}>
            ＋ 新增文字（放在目前這一秒）
          </button>
          <button className="btn done" onClick={() => addText(player?.time ?? 0, true)}>
            ＋ 新增圖形（星形、對話框、雲朵…）
          </button>
          <p className="hint">新增或點選一個文字後，可以在這裡改內容、字體、字塊和描邊。</p>
        </>
      )}
    </div>
  );
}

function LayersTab() {
  const project = useProjectStore((s) => s.project)!;
  const selectedId = useProjectStore((s) => s.selectedId);
  const player = useUI((s) => s.player);
  const t = player?.time ?? 0;
  // 目前這一秒有哪些圖層（最上層在最上面）
  const layers = layersAt(project, t, true).slice().reverse();
  const found = findItem(project, selectedId);
  const it = found && found.item.type !== 'audio' ? found.item : undefined;

  return (
    <div className="panel">
      <div className="panel-head">
        <span>這一秒的圖層（上面的會蓋住下面的）</span>
      </div>
      <ul className="layer-list" data-testid="layer-list">
        {layers.map(({ item, track, trackIndex }) => {
          const asset = isVideoItem(item) ? project.assets.find((a) => a.id === item.assetId) : undefined;
          const label =
            item.type === 'text'
              ? item.card.runs[0]?.text === ''
                ? '圖形'
                : `文字：${item.card.runs[0]?.text.slice(0, 8) ?? ''}`
              : (asset?.name ?? '素材');
          const isMain = track.kind === 'main';
          return (
            <li
              key={item.id}
              className={`layer-row${item.id === selectedId ? ' selected' : ''}`}
              data-testid="layer-row"
              data-item-id={item.id}
            >
              <button className="layer-name" onClick={() => useProjectStore.getState().select(item.id)}>
                <span className="layer-ico">
                  {item.type === 'text' ? <Type size={16} /> : <Layers size={16} />}
                </span>
                <span className="layer-text">
                  {isMain ? '主軌 · ' : `${track.name} · `}
                  {label}
                </span>
              </button>
              <button
                className="icon-btn sm"
                aria-label={`${track.name} ${track.hidden ? '顯示' : '隱藏'}`}
                onClick={() => patchTrack(track.id, { hidden: !track.hidden })}
              >
                {track.hidden ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              <button
                className={`icon-btn sm${track.locked ? ' on' : ''}`}
                aria-label={`${track.name} ${track.locked ? '解鎖' : '鎖定'}`}
                onClick={() => patchTrack(track.id, { locked: !track.locked })}
              >
                <Lock size={18} />
              </button>
              <button
                className="icon-btn sm"
                aria-label={`${track.name} 往上一層`}
                onClick={() =>
                  isMain || trackIndex >= project.tracks.length - 1
                    ? toast(isMain ? '主軌固定在最底層' : '已經在最上層')
                    : shiftTrackLayer(track.id, 1)
                }
              >
                <ArrowUp size={18} />
              </button>
              <button
                className="icon-btn sm"
                aria-label={`${track.name} 往下一層`}
                onClick={() =>
                  isMain || trackIndex <= 1
                    ? toast(isMain ? '主軌固定在最底層' : '不能放到主軌下面')
                    : shiftTrackLayer(track.id, -1)
                }
              >
                <ArrowDown size={18} />
              </button>
            </li>
          );
        })}
        {layers.length === 0 && <li className="hint">這一秒沒有任何圖層</li>}
      </ul>

      {it ? (
        <div className="props" data-testid="layer-props">
          <div className="panel-head">
            <span>選取的圖層</span>
          </div>
          <TransformControls item={it} />
          <Slider
            label="透明度"
            value={Math.round(it.transform.opacity * 100)}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) =>
              editItem(it.id, (x) => void (x.transform.opacity = v / 100), { coalesce: `op:${it.id}` })
            }
          />
          <div className="slider-label">混合模式</div>
          <div className="chips">
            {BLENDS.map((b) => (
              <button
                key={b}
                className={`chip${(it.blend ?? 'normal') === b ? ' active' : ''}`}
                onClick={() => editItem(it.id, (x) => void (x.blend = b))}
              >
                {BLEND_LABELS[b]}
              </button>
            ))}
          </div>
          <Slider
            label="圓角"
            value={Math.round((it.cornerRadius ?? 0) * 100)}
            min={0}
            max={50}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) =>
              editItem(it.id, (x) => void (x.cornerRadius = v / 100), { coalesce: `cr:${it.id}` })
            }
          />
          <Slider
            label="外框粗細"
            value={it.outline?.width ?? 0}
            min={0}
            max={40}
            step={1}
            format={(v) => `${v}`}
            onChange={(v) =>
              editItem(it.id, (x) => void (x.outline = { color: x.outline?.color ?? '#ffffff', width: v }), {
                coalesce: `ow:${it.id}`,
              })
            }
          />
          <div className="chips">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`swatch${it.outline?.color === c ? ' active' : ''}`}
                style={{ background: c }}
                aria-label={`外框顏色 ${c}`}
                onClick={() =>
                  editItem(it.id, (x) => void (x.outline = { width: x.outline?.width || 8, color: c }))
                }
              />
            ))}
          </div>
          <button
            className="btn"
            onClick={() =>
              editItem(it.id, (x) => {
                x.transform.x = 0.5;
                x.transform.y = 0.5;
                x.transform.scale = x.type === 'text' || found?.track.kind === 'main' ? 1 : 0.5;
                x.transform.rotation = 0;
              })
            }
          >
            位置、大小、旋轉歸位
          </button>
        </div>
      ) : (
        <p className="hint">
          點一個圖層（或預覽畫面上的物件）後，可以調透明度、混合模式、圓角和外框。裁切在「剪輯」分頁。
        </p>
      )}
    </div>
  );
}
