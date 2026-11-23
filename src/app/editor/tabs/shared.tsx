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

export type Panel = 'speed' | 'volume' | 'fade' | 'trim' | null;
export type Found = ReturnType<typeof findItem>;

/** 功能列第一層的 7 個類別（docs/plans/2026-11-23-u6-function-bar.md） */
export type CatId = 'edit' | 'add' | 'text' | 'layout' | 'effect' | 'color' | 'audio';
export const CATS: { id: CatId; label: string; icon: LucideIcon }[] = [
  { id: 'edit', label: '剪輯', icon: Scissors },
  { id: 'add', label: '加入', icon: ImagePlus },
  { id: 'text', label: '文字', icon: Type },
  { id: 'layout', label: '版型', icon: LayoutGrid },
  { id: 'effect', label: '特效', icon: Sparkles },
  { id: 'color', label: '色調', icon: Palette },
  { id: 'audio', label: '音訊', icon: Music },
];

/** 工具按鈕圖示那一格要顯示的「目前的值」（項目名固定不變，只換這一格） */
export type Badge =
  | { type: 'char'; text: string } // 特效的代表字小圓圈（跟時間軸上的同款）
  | { type: 'swatch'; color: string; opacity?: number } // 顏色小色塊
  | { type: 'text'; text: string } // 很短的值（音量「80%」、變速「2x」）
  | { type: 'dot' }; // 有設定，值要打開視窗才看得到（圖示右上角小圓點）

export function BadgeView({ badge }: { badge: Badge }) {
  if (badge.type === 'char') return <i className="badge-char">{badge.text}</i>;
  if (badge.type === 'swatch')
    return (
      <i
        className="badge-swatch"
        style={{ background: badge.color, opacity: badge.opacity ?? 1 }}
        aria-hidden="true"
      />
    );
  if (badge.type === 'text') return <i className="badge-text">{badge.text}</i>;
  return null;
}

export function ToolButton({
  icon: Icon,
  label,
  ariaLabel,
  onClick,
  active,
  fill,
  dim,
  danger,
  badge,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  /** 螢幕閱讀器／測試用的完整名稱（預設就是 label） */
  ariaLabel?: string;
  onClick: () => void;
  active?: boolean;
  /** 圖示實心（例如這個時間有關鍵格時的菱形） */
  fill?: boolean;
  /** 現在不能用：按鈕變淡，但還是點得到（點了提示要先選什麼） */
  dim?: boolean;
  danger?: boolean;
  badge?: Badge | null;
  testId?: string;
}) {
  const showBadge = badge && badge.type !== 'dot';
  return (
    <button
      className={`tool${active ? ' active' : ''}${dim ? ' dim' : ''}${danger ? ' danger' : ''}`}
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      aria-pressed={fill === undefined ? undefined : fill}
      aria-disabled={dim ? true : undefined}
      data-testid={testId}
    >
      <span className="tool-ico">
        {showBadge ? (
          <BadgeView badge={badge} />
        ) : (
          <Icon size={22} fill={fill ? 'currentColor' : 'none'} aria-hidden="true" />
        )}
        {badge?.type === 'dot' && <i className="badge-dot" aria-hidden="true" />}
      </span>
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
