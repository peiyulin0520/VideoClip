// 動態字卡「停在最後畫面」：一輪（一個詞）裡，字完整、正常呈現的那一刻（佔那一輪的比例）。
// 先用 e2e/kinetic-hold.spec.ts 量每一式的墨量找出大概的位置，再照每一式的動畫時間手動修正（例如融化要停在還沒開始融的時候）。
import type { KineticDef } from './core';

export const HOLD_F: Record<string, number> = {
  burst: 0.5,
  hit: 0.6,
  stamp: 0.5,
  punch: 0.5,
  stack: 0.65,
  stretch: 0.56,
  through: 0.85,
  squash: 0.53,
  flap: 0.5,
  flip: 0.43,
  type: 0.6,
  slot: 0.7,
  odo: 0.6,
  swapline: 0.5,
  split: 0.8,
  glitch: 0.4,
  marker: 0.53,
  shake: 0.4,
  neon: 0.57,
  bob: 0.5,
  track: 0.51,
  fill: 0.5,
  focus: 0.5,
  cube: 0.48,
  tunnel: 0.64,
  scatter: 0.94,
  extrude: 0.74,
  blinds: 0.49,
  block: 0.82,
  kara: 0.85,
  popsync: 0.71,
  dual: 0.74,
  beat: 0.3,
  soft: 0.55,
  trail: 0.53,
  mix: 0.67,
  vpop: 0.55,
  slam: 0.41,
  lines: 0.5,
  marks: 0.69,
  telop: 0.5,
  emph: 0.64,
  bouncy: 0.58,
  star: 0.5,
  flick: 0.5,
  drip: 0.68,
  creep: 0.85,
  ghost: 0.5,
  corrupt: 0.8,
  mirror: 0.5,
  torch: 0.6,
  melt: 0.1,
};

/**
 * 這一式停在最後畫面的時間（秒，字卡自己的時間 × 速度之後）：最後一個詞那一輪裡「字完整呈現」的那一刻。
 * 一直在跑的那幾式（沒有一輪的長度）回傳 null：沒有「最後」。
 */
export function holdTime(def: KineticDef, words: string[]): number | null {
  const total = def.len(words);
  const last = def.len([words[words.length - 1]!]);
  if (total === null || last === null) return null;
  return Math.max(0, total - last) + (HOLD_F[def.id] ?? 0.5) * last;
}
