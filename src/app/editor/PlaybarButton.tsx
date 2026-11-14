import type { LucideIcon } from 'lucide-react';

/**
 * 播放列的按鈕：圖示在上、中文在下（播放鍵不加字，不傳 label）。
 * on＝這個功能目前是開著的（例如這個時間有定格）：主題色底、白字；按下去的瞬間也有顏色回饋（全站的 :active）。
 */
export function PlaybarButton({
  icon: Icon,
  label,
  ariaLabel,
  onClick,
  on,
  disabled,
  testId,
  fill,
}: {
  icon: LucideIcon;
  label?: string;
  ariaLabel: string;
  onClick: () => void;
  on?: boolean;
  disabled?: boolean;
  testId?: string;
  /** 圖示實心（例如有定格時的菱形） */
  fill?: boolean;
}) {
  return (
    <button
      className={`pb-btn${on ? ' on' : ''}`}
      aria-label={ariaLabel}
      aria-pressed={on === undefined ? undefined : on}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={20} fill={fill ? 'currentColor' : 'none'} aria-hidden="true" />
      {label && <small>{label}</small>}
    </button>
  );
}
