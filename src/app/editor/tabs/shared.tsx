import {
  ImagePlus,
  LayoutGrid,
  Music,
  Palette,
  Scissors,
  Sparkles,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { findItem } from '../../../engine/timeline';
import { BLEND_LABELS } from '../../../engine/geometry';
import type { BlendMode } from '../../../model/types';

export type Tab = 'edit' | 'overlay' | 'text' | 'layers' | 'layout' | 'effect' | 'color' | 'assets' | 'audio';
export type Panel = 'speed' | 'volume' | 'trim' | null;
export type Found = ReturnType<typeof findItem>;

/** 功能列第一層的 7 個類別（docs/plans/2026-11-23-roadmap-ui.md §1.2） */
export type CatId = 'edit' | 'add' | 'text' | 'layout' | 'effect' | 'color' | 'audio';
/** 第三層升起的小視窗：每個都是原本某個分頁（或分頁的一部分）的內容 */
export type ToolId = 'clip' | 'layers' | 'sticker' | 'textedit' | 'layout' | 'effect' | 'color' | 'audio';

export const CATS: { id: CatId; label: string; icon: LucideIcon }[] = [
  { id: 'edit', label: '剪輯', icon: Scissors },
  { id: 'add', label: '加入', icon: ImagePlus },
  { id: 'text', label: '文字', icon: Type },
  { id: 'layout', label: '版型', icon: LayoutGrid },
  { id: 'effect', label: '特效', icon: Sparkles },
  { id: 'color', label: '色調', icon: Palette },
  { id: 'audio', label: '音訊', icon: Music },
];

/** 只有一個工具的類別：點了類別就直接升起那個視窗 */
export const SINGLE_TOOL: Partial<Record<CatId, ToolId>> = {
  layout: 'layout',
  effect: 'effect',
  color: 'color',
  audio: 'audio',
};

export const TOOL_TITLE: Record<ToolId, string> = {
  clip: '片段設定',
  layers: '位置與大小',
  sticker: '貼圖',
  textedit: '文字',
  layout: '版型',
  effect: '特效',
  color: '色調',
  audio: '音訊',
};

/** 舊的分頁 id（別處用 requestTab 要求切分頁）對應到新的類別／視窗 */
export function targetOfTab(t: Tab): { cat: CatId; tool: ToolId | null } {
  switch (t) {
    case 'edit':
      return { cat: 'edit', tool: null };
    case 'overlay':
      return { cat: 'add', tool: null };
    case 'assets':
      return { cat: 'add', tool: 'sticker' };
    case 'text':
      return { cat: 'text', tool: 'textedit' };
    case 'layers':
      return { cat: 'edit', tool: 'layers' };
    case 'layout':
      return { cat: 'layout', tool: 'layout' };
    case 'effect':
      return { cat: 'effect', tool: 'effect' };
    case 'color':
      return { cat: 'color', tool: 'color' };
    case 'audio':
      return { cat: 'audio', tool: 'audio' };
  }
}

export function ToolButton({
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

export const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 4];
export const COLORS = [
  '#ffffff',
  '#111111',
  '#ff4d8d',
  '#ffd23f',
  '#4dd0ff',
  '#7CFC6A',
  '#b388ff',
  '#ff7a45',
];
export const BLENDS = Object.keys(BLEND_LABELS) as BlendMode[];
