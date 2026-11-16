// 動態字卡（64 式）的登錄表：照原版順序。已經改寫好的才會出現在介面（KINETIC）；其餘 id 先留在型別裡。
import type { KineticDef, KineticGroup } from './core';
import { FX_FLOW } from './fx/flow';
import { FX_IN } from './fx/in';

export const KINETIC: KineticDef[] = [...FX_IN, ...FX_FLOW];
export const kineticById = (id: string): KineticDef | undefined => KINETIC.find((f) => f.id === id);
export const KINETIC_GROUPS: { id: KineticGroup; name: string }[] = [
  { id: 'in', name: '登場' },
  { id: 'flow', name: '流動' },
  { id: 'swap', name: '切換' },
  { id: 'em', name: '強調' },
  { id: 'sp', name: '空間' },
  { id: 'mv', name: '歌詞' },
  { id: 'tv', name: '綜藝' },
  { id: 'hr', name: '恐怖' },
];

/** 原版五種配色：舞台底色 bg、主文字色 fg、強調色 hi、強調色上的字色 hifg（色碼照原碼） */
export const SCHEMES = {
  ink: { bg: '#14161b', fg: '#f4f5f7', hi: '#ff4d2e', hifg: '#14161b' },
  paper: { bg: '#f4f5f7', fg: '#14161b', hi: '#2340ff', hifg: '#ffffff' },
  cobalt: { bg: '#2340ff', fg: '#ffffff', hi: '#14161b', hifg: '#ffffff' },
  verm: { bg: '#ff4d2e', fg: '#14161b', hi: '#f4f5f7', hifg: '#14161b' },
  key: { bg: '#00b140', fg: '#ffffff', hi: '#14161b', hifg: '#ffffff' },
} as const;

/** 舞台底色：存的是色碼（沒有＝透明）；K0 存過原版配色名稱（'ink' 等）也認得 */
export function resolveBg(bg: string | undefined): string | null {
  if (!bg) return null;
  const named = (SCHEMES as Record<string, { bg: string }>)[bg];
  return named ? named.bg : bg;
}
