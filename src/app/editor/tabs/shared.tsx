import type { LucideIcon } from 'lucide-react';
import { findItem } from '../../../engine/timeline';
import { BLEND_LABELS } from '../../../engine/geometry';
import type { BlendMode } from '../../../model/types';

export type Tab = 'edit' | 'overlay' | 'text' | 'layers' | 'layout' | 'assets' | 'audio';
export type Panel = 'speed' | 'volume' | 'trim' | null;
export type Found = ReturnType<typeof findItem>;

export const TABS: { id: Tab; label: string }[] = [
  { id: 'edit', label: '剪輯' },
  { id: 'overlay', label: '疊加' },
  { id: 'text', label: '文字' },
  { id: 'layers', label: '圖層' },
  { id: 'layout', label: '版型' },
  { id: 'assets', label: '素材' },
  { id: 'audio', label: '音訊' },
];

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
