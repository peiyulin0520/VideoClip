import {
  Copy,
  Crop as CropIcon,
  Eye,
  Frame,
  Gauge,
  ListEnd,
  LogIn,
  LogOut,
  MoveVertical,
  PictureInPicture2,
  Split,
  TrendingUpDown,
  Grid2x2,
  LayoutGrid,
  Maximize2,
  SquareSplitHorizontal,
  Music,
  Palette,
  Pencil,
  RotateCcw,
  Scissors,
  Shapes,
  SlidersHorizontal,
  Smile,
  Sparkles,
  WandSparkles,
  SquareStack,
  Trash2,
  Type,
  Volume2,
  VolumeOff,
  Flag,
  SquareRoundCorner,
  RectangleHorizontal,
  TextCursorInput,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { itemHasGrade } from '../../engine/grade';
import { transitionCode } from '../../engine/transitions';
import { kineticById } from '../../engine/kinetic';
import { textFxCode } from '../../engine/textFx';
import { cellItems } from '../../engine/cellGap';
import { cellsOf, frameOfGroup } from '../../engine/layoutTracks';
import { findItem, isVideoItem, visibleLayers } from '../../engine/timeline';
import type { Project } from '../../model/types';
import {
  addText,
  applyGradeToAll,
  duplicateAny,
  removeAnyItem,
  removeGroup,
  renameItem,
  resetGrade,
  separateAudio,
  setAllVideoMuted,
  splitAny,
  videoTracksMuted,
} from '../../store/actions';
import { startCrop } from '../../store/cropStore';
import { useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';
import { PromptSheet } from '../../ui/PromptSheet';
import { ShadowFrameIcon, TransitionIcon } from './toolIcons';
import { GroupToggleButton } from './AddToGroupToggle';
import { GradePeekButton } from './GradePeekButton';
import { KeyframeButton } from './KeyframeButton';
import { MuteSheet } from './MuteSheet';
import { AppearanceTab } from './tabs/AppearanceTab';
import { AssetsTab } from './tabs/AssetsTab';
import { ClipPanel } from './tabs/ClipPanel';
import { LookBadge } from './ColorPanel';
import { ColorTab } from './tabs/ColorTab';
import { EffectTab, type FxPart } from './tabs/EffectTab';
import { LayoutTab, type LayoutPart } from './tabs/LayoutTab';
import { TextTab } from './tabs/TextTab';
import type { TextSection } from './TextPanel';
import type { Badge, CatId, Found, Panel } from './tabs/shared';

/** 功能列每個工具能用到的狀態與動作 */
export interface ToolEnv {
  project: Project;
  found: Found;
  onImportMain: () => void;
  onImportOverlay: () => void;
  /** 開檔案選擇器選背景音樂 */
  pickMusic: () => void;
  /** 升起這一項的視窗（已經開著＝收起來）／關掉目前的視窗 */
  openPopup: (id: string) => void;
  closePopup: () => void;
}

export type ToolDef = {
  /** 唯一，e2e 用 data-testid=`tool-${id}` */
  id: string;
  /** 按鈕上的字（固定不變） */
  label: string;
  icon: LucideIcon;
  /** 工具列分區：換區就畫一條細線 */
  zone: string;
  /** popup＝升起這一項的小視窗；action＝直接執行；toggle＝切換開關 */
  kind: 'popup' | 'action' | 'toggle';
  /** 這一刻能不能用；不能用＝按鈕變淡，點了提示 need */
  enabled?: (e: ToolEnv) => boolean;
  need?: string;
  /** 能用但選到的東西不適合時的提示（回傳訊息就不執行） */
  guard?: (e: ToolEnv) => string | null;
  badge?: (e: ToolEnv) => Badge | null;
  run?: (e: ToolEnv) => void;
  on?: (e: ToolEnv) => boolean;
  danger?: boolean;
  /** popup 的內容；bare＝它自己就是一個視窗（Sheet），不要再包升起的面板 */
  popup?: (e: ToolEnv) => ReactNode;
  bare?: boolean;
  /** 自己畫整顆按鈕（有自己的狀態訂閱的，例如關鍵格、看原色） */
  custom?: () => ReactNode;
};

const sel = (e: ToolEnv) => e.found?.item;
const hasSel = (e: ToolEnv) => !!sel(e);
/** 影片、照片、貼圖（不含文字、音樂） */
const isPicture = (e: ToolEnv) => {
  const i = sel(e);
  return !!i && isVideoItem(i) && i.type !== 'audio';
};
const notAudio = (e: ToolEnv) => {
  const i = sel(e);
  return !!i && i.type !== 'audio';
};
const isText = (e: ToolEnv) => sel(e)?.type === 'text';
const isFrameSel = (e: ToolEnv) => {
  const i = sel(e);
  return !!i && i.type !== 'audio' && !!i.group && !!frameOfGroup(e.project.tracks, i.group);
};
/** 影片原音或音樂 */
const hasSound = (e: ToolEnv) => {
  const i = sel(e);
  return !!i && isVideoItem(i) && i.type !== 'image';
};

const NEED_CLIP = '先點一個片段';
const NEED_PIC = '先點一個影片、照片或貼圖';
const NEED_TEXT = '先點一段文字';
const NEED_LAYOUT = '先點一個版型';
const NEED_SOUND = '先點一個影片或音樂';

function RenameSheet({ e }: { e: ToolEnv }) {
  const it = sel(e);
  return (
    <PromptSheet
      open={!!it}
      title="片段命名"
      label="片段名稱"
      initial={it?.label ?? ''}
      placeholder="例如：開場・揮手（空白＝用預設名稱）"
      onSubmit={(v) => it && renameItem(it.id, v)}
      onClose={e.closePopup}
    />
  );
}

function MuteMarks({ e }: { e: ToolEnv }) {
  const it = sel(e);
  const asset = it && isVideoItem(it) ? e.project.assets.find((a) => a.id === it.assetId) : undefined;
  if (!it || !isVideoItem(it) || !asset) return null;
  return <MuteSheet item={it} asset={asset} onClose={e.closePopup} />;
}

/** 工具列〔各格〕按鈕圖示那一格：版型格子的小示意圖 */
function CellsBadge({ project, group }: { project: Project; group: string }) {
  const W = 22;
  const asp = project.width / project.height;
  const w = asp >= 1 ? W : W * asp;
  const h = asp >= 1 ? W / asp : W;
  return (
    <svg
      className="badge-cells"
      width={w}
      height={h}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {cellsOf(project.tracks, group).map((c) => {
        const box = c.rect ?? cellItems(c.tracks[0]!)[0]?.cell;
        return box ? (
          <rect key={c.no} x={box.x} y={box.y} width={box.w} height={box.h} rx={0.04} fill="currentColor" />
        ) : null;
      })}
    </svg>
  );
}

const clip = (panel: Exclude<Panel, null>) =>
  function ClipPopup(e: ToolEnv) {
    return <ClipPanel panel={panel} setPanel={() => e.closePopup()} found={e.found} />;
  };
const text = (section: TextSection) => (e: ToolEnv) => <TextTab found={e.found} section={section} />;
const fx = (part: FxPart) => (e: ToolEnv) => <EffectTab found={e.found} part={part} />;
const layout = (part: LayoutPart) => (e: ToolEnv) => <LayoutTab found={e.found} part={part} />;

/** 文字特效按鈕上的值：基本特效的代表字，或動態字卡那一式的第一個字 */
const textFxBadge = (e: ToolEnv): Badge | null => {
  const i = sel(e);
  if (i?.type !== 'text') return null;
  if (i.textFx) return { type: 'char', text: textFxCode(i.textFx.kind) };
  const d = i.kinetic ? kineticById(i.kinetic.id) : undefined;
  return d ? { type: 'char', text: d.zh.slice(0, 1) } : null;
};

const gradeBadge = (e: ToolEnv): Badge | null => {
  const i = sel(e);
  return i && i.type !== 'audio' && itemHasGrade(i) ? { type: 'dot' } : null;
};

function splitNow() {
  const { player } = useUI.getState();
  if (!player) return;
  const t = player.time;
  const st = currentSelection();
  const f = st.found;
  // 有選取就切選取的那個；沒選取就切播放頭這一秒最上面的影像物件
  const target =
    f?.item ??
    visibleLayers(st.project, t)
      .filter((l) => l.track.kind === 'media' && !l.track.locked)
      .at(-1)?.item;
  if (!target) return toast('還沒有片段');
  if (!splitAny(target.id, t)) toast('播放頭要在片段中間才能分割（離邊緣至少 0.2 秒）');
}
function currentSelection() {
  const s = useProjectStore.getState();
  return { project: s.project!, found: findItem(s.project!, s.selectedId) };
}

/** 七個類別的工具列：照 docs/plans/2026-11-23-u6-function-bar.md §3 */
export const TOOLS: Record<CatId, ToolDef[]> = {
  edit: [
    {
      id: 'edit.split',
      label: '分割',
      icon: SquareSplitHorizontal,
      zone: 'time',
      kind: 'action',
      run: splitNow,
    },
    {
      id: 'edit.delete',
      label: '刪除',
      icon: Trash2,
      zone: 'time',
      kind: 'action',
      enabled: hasSel,
      need: NEED_CLIP,
      run: (e) => {
        const it = sel(e);
        if (it) removeAnyItem(it.id);
      },
    },
    {
      id: 'edit.copy',
      label: '複製',
      icon: Copy,
      zone: 'time',
      kind: 'action',
      enabled: hasSel,
      need: NEED_CLIP,
      run: (e) => {
        const it = sel(e);
        if (it) duplicateAny(it.id);
      },
    },
    {
      id: 'edit.trim',
      label: '修剪',
      icon: Scissors,
      zone: 'time',
      kind: 'popup',
      enabled: (e) => {
        const i = sel(e);
        return !!i && isVideoItem(i);
      },
      need: NEED_CLIP,
      guard: (e) => (sel(e)?.type === 'image' ? '照片沒有素材區段，請拖時間軸上的把手調長度' : null),
      badge: (e) => {
        const i = sel(e);
        return i && isVideoItem(i) && (i.trimIn > 0 || i.audioRanges) ? { type: 'dot' } : null;
      },
      popup: clip('trim'),
      bare: true,
    },
    {
      id: 'edit.speed',
      label: '變速',
      icon: Gauge,
      zone: 'time',
      kind: 'popup',
      enabled: (e) => {
        const i = sel(e);
        return !!i && isVideoItem(i);
      },
      need: NEED_CLIP,
      guard: (e) => {
        const t = sel(e)?.type;
        return t === 'image' ? '照片不能變速' : t === 'audio' ? '音樂不能變速' : null;
      },
      badge: (e) => {
        const i = sel(e);
        return i && isVideoItem(i) && i.speed !== 1 ? { type: 'text', text: `${i.speed}x` } : null;
      },
      popup: clip('speed'),
    },
    {
      id: 'edit.crop',
      label: '裁切',
      icon: CropIcon,
      zone: 'look',
      kind: 'action',
      enabled: isPicture,
      need: NEED_PIC,
      badge: (e) => {
        const i = sel(e);
        return i && isVideoItem(i) && (i.crop || i.mask || i.maskBitmap) ? { type: 'dot' } : null;
      },
      run: (e) => {
        const it = sel(e);
        if (it) startCrop(it.id);
      },
    },
    {
      id: 'edit.look',
      label: '外觀',
      icon: SquareRoundCorner,
      zone: 'look',
      kind: 'popup',
      enabled: notAudio,
      need: NEED_PIC,
      badge: (e) => {
        const i = sel(e);
        if (!i || i.type === 'audio') return null;
        const changed =
          i.transform.opacity < 1 ||
          (!!i.blend && i.blend !== 'normal') ||
          !!i.cornerRadius ||
          !!i.outline?.width;
        return changed ? { type: 'dot' } : null;
      },
      popup: () => <AppearanceTab />,
    },
    {
      id: 'edit.key',
      label: '關鍵格',
      icon: SquareStack,
      zone: 'look',
      kind: 'action',
      custom: () => <KeyframeButton />,
    },
    {
      id: 'edit.name',
      label: '命名',
      icon: Pencil,
      zone: 'extra',
      kind: 'popup',
      enabled: hasSel,
      need: NEED_CLIP,
      popup: (e) => <RenameSheet e={e} />,
      bare: true,
    },
  ],
  add: [
    {
      id: 'add.append',
      label: '接續',
      icon: ListEnd,
      zone: 'add',
      kind: 'action',
      run: (e) => e.onImportMain(),
    },
    {
      id: 'add.overlay',
      label: '疊加',
      icon: PictureInPicture2,
      zone: 'add',
      kind: 'action',
      run: (e) => e.onImportOverlay(),
    },
    {
      id: 'add.sticker',
      label: '貼圖',
      icon: Smile,
      zone: 'add',
      kind: 'popup',
      popup: () => <AssetsTab />,
    },
  ],
  text: [
    {
      id: 'text.add',
      label: '文字',
      icon: Type,
      zone: 'add',
      kind: 'action',
      run: (e) => {
        addText(useUI.getState().player?.time ?? 0);
        e.openPopup('text.content'); // 剛新增：直接升起內容視窗讓人打字
      },
    },
    {
      id: 'text.shape',
      label: '圖形',
      icon: Shapes,
      zone: 'add',
      kind: 'action',
      run: (e) => {
        addText(useUI.getState().player?.time ?? 0, true);
        e.openPopup('text.box');
      },
    },
    {
      id: 'text.togroup',
      label: '加進版型',
      icon: Type,
      zone: 'add',
      kind: 'toggle',
      custom: () => <GroupToggleButton testId="tool-text.togroup" />,
    },
    {
      id: 'text.content',
      label: '內容',
      icon: TextCursorInput,
      zone: 'adjust',
      kind: 'popup',
      enabled: isText,
      need: NEED_TEXT,
      badge: (e) => {
        const i = sel(e);
        return i?.type === 'text' ? { type: 'swatch', color: i.card.runs[0]!.color } : null;
      },
      popup: text('文字'),
    },
    {
      id: 'text.layout',
      label: '版面',
      icon: Grid2x2,
      zone: 'adjust',
      kind: 'popup',
      enabled: isText,
      need: NEED_TEXT,
      popup: text('版面'),
    },
    {
      id: 'text.box',
      label: '字塊',
      icon: RectangleHorizontal,
      zone: 'adjust',
      kind: 'popup',
      enabled: isText,
      need: NEED_TEXT,
      badge: (e) => {
        const i = sel(e);
        const b = i?.type === 'text' ? i.card.box : undefined;
        return b?.fillOn ? { type: 'swatch', color: b.fill, opacity: b.opacity } : null;
      },
      popup: text('字塊'),
    },
    {
      id: 'text.stroke',
      label: '描邊陰影',
      icon: ShadowFrameIcon,
      zone: 'adjust',
      kind: 'popup',
      enabled: isText,
      need: NEED_TEXT,
      badge: (e) => {
        const i = sel(e);
        const r = i?.type === 'text' ? i.card.runs[0] : undefined;
        return r && (r.strokes?.some((s) => s.width > 0) || r.shadow) ? { type: 'dot' } : null;
      },
      popup: text('描邊陰影'),
    },
    {
      id: 'text.deco',
      label: '裝飾',
      icon: Sparkles,
      zone: 'adjust',
      kind: 'popup',
      enabled: isText,
      need: NEED_TEXT,
      badge: (e) => {
        const i = sel(e);
        return i?.type === 'text' && i.card.decorations?.length ? { type: 'dot' } : null;
      },
      popup: text('裝飾'),
    },
    {
      // 跟〔特效〕類別裡的〔文字特效〕是同一個視窗（不跳類別，免得找不到剛才在調的東西）
      id: 'text.fx',
      label: '特效',
      icon: WandSparkles,
      zone: 'fx',
      kind: 'popup',
      enabled: isText,
      need: NEED_TEXT,
      badge: textFxBadge,
      popup: fx('textfx'),
    },
  ],
  layout: [
    {
      id: 'layout.add',
      label: '版型',
      icon: LayoutGrid,
      zone: 'add',
      kind: 'popup',
      popup: layout('add'),
    },
    {
      id: 'layout.frame',
      label: '外框',
      icon: Frame,
      zone: 'adjust',
      kind: 'popup',
      enabled: isFrameSel,
      need: NEED_LAYOUT,
      badge: (e) => {
        const i = sel(e);
        const f =
          i && i.type !== 'audio' && i.group ? frameOfGroup(e.project.tracks, i.group)?.item : undefined;
        return f?.frameStyle
          ? { type: 'swatch', color: f.frameStyle.color, opacity: f.frameStyle.opacity }
          : null;
      },
      popup: layout('frame'),
    },
    {
      id: 'layout.size',
      label: '大小',
      icon: Maximize2,
      zone: 'adjust',
      kind: 'popup',
      enabled: isFrameSel,
      need: NEED_LAYOUT,
      popup: layout('size'),
    },
    {
      id: 'layout.cells',
      label: '各格',
      icon: Grid2x2,
      zone: 'adjust',
      kind: 'popup',
      enabled: isFrameSel,
      need: NEED_LAYOUT,
      badge: (e) => {
        const i = sel(e);
        return i && i.type !== 'audio' && i.group
          ? { type: 'node', node: <CellsBadge project={e.project} group={i.group} /> }
          : null;
      },
      popup: layout('cells'),
    },
    {
      id: 'layout.time',
      label: '時間',
      icon: Timer,
      zone: 'adjust',
      kind: 'popup',
      enabled: isFrameSel,
      need: NEED_LAYOUT,
      badge: (e) => {
        const i = sel(e);
        const f =
          i && i.type !== 'audio' && i.group ? frameOfGroup(e.project.tracks, i.group)?.item : undefined;
        return f ? { type: 'text', text: `${f.duration.toFixed(1)}s` } : null;
      },
      popup: layout('time'),
    },
    {
      id: 'layout.play',
      label: '播放方式',
      icon: SlidersHorizontal,
      zone: 'adjust',
      kind: 'popup',
      enabled: isFrameSel,
      need: NEED_LAYOUT,
      badge: (e) => {
        const i = sel(e);
        const f =
          i && i.type !== 'audio' && i.group ? frameOfGroup(e.project.tracks, i.group)?.item : undefined;
        return f ? { type: 'text', text: f.layoutPlay === 'seq' ? '依序' : '同步' } : null;
      },
      popup: layout('play'),
    },
    {
      id: 'layout.remove',
      label: '移除',
      icon: Trash2,
      zone: 'danger',
      kind: 'action',
      danger: true,
      enabled: isFrameSel,
      need: NEED_LAYOUT,
      run: (e) => {
        const i = sel(e);
        if (i && i.type !== 'audio' && i.group) removeGroup(i.group);
      },
    },
  ],
  effect: [
    {
      id: 'fx.in',
      label: '進場',
      icon: LogIn,
      zone: 'adjust',
      kind: 'popup',
      enabled: notAudio,
      need: NEED_PIC,
      badge: (e) => {
        const i = sel(e);
        return i && i.type !== 'audio' && i.inEffect
          ? { type: 'char', text: transitionCode(i.inEffect.kind) }
          : null;
      },
      popup: fx('in'),
    },
    {
      id: 'fx.out',
      label: '出場',
      icon: LogOut,
      zone: 'adjust',
      kind: 'popup',
      enabled: notAudio,
      need: NEED_PIC,
      badge: (e) => {
        const i = sel(e);
        return i && i.type !== 'audio' && i.outEffect
          ? { type: 'char', text: transitionCode(i.outEffect.kind) }
          : null;
      },
      popup: fx('out'),
    },
    {
      id: 'fx.seam',
      label: '轉場',
      icon: TransitionIcon,
      zone: 'adjust',
      kind: 'popup',
      enabled: notAudio,
      need: NEED_PIC,
      badge: (e) => {
        const i = sel(e);
        return i && i.type !== 'audio' && i.transitionIn
          ? { type: 'char', text: transitionCode(i.transitionIn.kind) }
          : null;
      },
      popup: fx('seam'),
    },
    {
      id: 'fx.whole',
      label: '整段',
      icon: MoveVertical,
      zone: 'adjust',
      kind: 'popup',
      enabled: notAudio,
      need: NEED_PIC,
      badge: (e) => {
        const i = sel(e);
        return i && i.type !== 'audio' && i.motion
          ? { type: 'char', text: i.motion === 'drift' ? '捲' : '滑' }
          : null;
      },
      popup: fx('whole'),
    },
    {
      id: 'fx.textfx',
      label: '文字特效',
      icon: WandSparkles,
      zone: 'text',
      kind: 'popup',
      enabled: isText,
      need: NEED_TEXT,
      badge: textFxBadge,
      popup: fx('textfx'),
    },
  ],
  color: [
    {
      id: 'color.look',
      label: '色調組合',
      icon: Palette,
      zone: 'adjust',
      kind: 'popup',
      enabled: notAudio,
      need: NEED_PIC,
      badge: (e) => {
        const i = sel(e);
        return i && i.type !== 'audio' && i.look
          ? { type: 'node', node: <LookBadge item={i} project={e.project} /> }
          : null;
      },
      popup: (e) => <ColorTab found={e.found} part="look" />,
    },
    {
      id: 'color.adjust',
      label: '調整',
      icon: SlidersHorizontal,
      zone: 'adjust',
      kind: 'popup',
      enabled: notAudio,
      need: NEED_PIC,
      badge: (e) => {
        const i = sel(e);
        return i && i.type !== 'audio' && i.adjust && Object.values(i.adjust).some(Boolean)
          ? { type: 'dot' }
          : null;
      },
      popup: (e) => <ColorTab found={e.found} part="adjust" />,
    },
    {
      id: 'color.all',
      label: '套用全部',
      icon: Copy,
      zone: 'adjust',
      kind: 'action',
      enabled: (e) => {
        const i = sel(e);
        return !!i && i.type !== 'audio' && itemHasGrade(i);
      },
      need: '先幫一個素材調好色調',
      run: (e) => {
        const it = sel(e);
        if (!it) return;
        const n = applyGradeToAll(it.id);
        toast(n > 0 ? `已套用到另外 ${n} 個` : '沒有其他同類的素材');
      },
    },
    {
      id: 'color.reset',
      label: '重設',
      icon: RotateCcw,
      zone: 'adjust',
      kind: 'action',
      enabled: (e) => {
        const i = sel(e);
        return !!i && i.type !== 'audio' && itemHasGrade(i);
      },
      need: '這個素材還沒調色調',
      badge: gradeBadge,
      run: (e) => {
        const it = sel(e);
        if (it) resetGrade(it.id);
      },
    },
    {
      id: 'color.peek',
      label: '看原色',
      icon: Eye,
      zone: 'peek',
      kind: 'toggle',
      custom: () => <GradePeekButton />,
    },
  ],
  audio: [
    {
      id: 'audio.music',
      label: '背景音樂',
      icon: Music,
      zone: 'add',
      kind: 'action',
      run: (e) => e.pickMusic(),
    },
    {
      id: 'audio.togroup',
      label: '加進版型',
      icon: Music,
      zone: 'add',
      kind: 'toggle',
      custom: () => <GroupToggleButton testId="tool-audio.togroup" />,
    },
    {
      id: 'audio.split',
      label: '分離原音',
      icon: Split,
      zone: 'add',
      kind: 'action',
      enabled: (e) => sel(e)?.type === 'video',
      need: '先點一個有聲音的影片',
      run: (e) => {
        const it = sel(e);
        if (!it) return;
        const id = separateAudio(it.id);
        toast(id ? '原音已分離成一段音樂軌，影片本身靜音了' : '這支影片沒有聲音');
      },
    },
    {
      id: 'audio.volume',
      label: '音量',
      icon: Volume2,
      zone: 'adjust',
      kind: 'popup',
      enabled: hasSound,
      need: NEED_SOUND,
      badge: (e) => {
        const i = sel(e);
        if (!i || !isVideoItem(i) || i.type === 'image') return null;
        return i.volume === 0
          ? { type: 'text', text: '靜音' }
          : i.volume !== 1
            ? { type: 'text', text: `${Math.round(i.volume * 100)}%` }
            : null;
      },
      popup: clip('volume'),
    },
    {
      id: 'audio.fade',
      label: '淡入淡出',
      icon: TrendingUpDown,
      zone: 'adjust',
      kind: 'popup',
      enabled: hasSound,
      need: NEED_SOUND,
      badge: (e) => {
        const i = sel(e);
        return i && isVideoItem(i) && (i.fadeIn || i.fadeOut) ? { type: 'dot' } : null;
      },
      popup: clip('fade'),
    },
    {
      id: 'audio.trim',
      label: '修剪',
      icon: Scissors,
      zone: 'adjust',
      kind: 'popup',
      enabled: hasSound,
      need: NEED_SOUND,
      badge: (e) => {
        const i = sel(e);
        return i && isVideoItem(i) && i.trimIn > 0 ? { type: 'dot' } : null;
      },
      popup: clip('trim'),
      bare: true,
    },
    {
      id: 'audio.mute',
      label: '靜音標記',
      icon: Flag,
      zone: 'adjust',
      kind: 'popup',
      enabled: hasSound,
      need: NEED_SOUND,
      badge: (e) => {
        const i = sel(e);
        return i && isVideoItem(i) && i.audioRanges ? { type: 'dot' } : null;
      },
      popup: (e) => <MuteMarks e={e} />,
      bare: true,
    },
    {
      id: 'audio.allmute',
      label: '全部靜音',
      icon: VolumeOff,
      zone: 'other',
      kind: 'toggle',
      on: (e) => videoTracksMuted(e.project),
      run: (e) => {
        const muted = videoTracksMuted(e.project);
        setAllVideoMuted(!muted);
        toast(muted ? '影片的聲音恢復了' : '所有影片都靜音了（背景音樂不受影響）');
      },
    },
  ],
};

export const toolById = (id: string): ToolDef | undefined =>
  Object.values(TOOLS)
    .flat()
    .find((t) => t.id === id);
