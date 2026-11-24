import type { LucideIcon, LucideProps } from 'lucide-react';

const base = (p: LucideProps) => ({
  width: p.size ?? 24,
  height: p.size ?? 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: p.className,
});

/** 描邊陰影：一個框，後面有偏移的陰影 */
export const ShadowFrameIcon = ((p: LucideProps) => (
  <svg {...base(p)}>
    <rect x="8" y="8" width="13" height="13" rx="2.5" fill="currentColor" stroke="none" opacity="0.35" />
    <rect x="3" y="3" width="13" height="13" rx="2.5" />
  </svg>
)) as unknown as LucideIcon;

/** 轉場：兩個素材，中間用一條鏈子接起來 */
export const TransitionIcon = ((p: LucideProps) => (
  <svg {...base(p)}>
    <rect x="1" y="6" width="6" height="12" rx="1.5" />
    <rect x="17" y="6" width="6" height="12" rx="1.5" />
    <rect x="7.2" y="9.4" width="6.8" height="5.2" rx="2.6" strokeWidth="1.8" />
    <rect x="10" y="9.4" width="6.8" height="5.2" rx="2.6" strokeWidth="1.8" />
  </svg>
)) as unknown as LucideIcon;
