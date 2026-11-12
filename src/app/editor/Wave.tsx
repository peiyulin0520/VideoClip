import { WAVE_STEP } from '../../engine/wave';

/** 音樂的音量波形（SVG，中線上下對稱的細條）。from／to：畫素材的哪一段（秒） */
export function Wave({ wave, from, to }: { wave: number[] | undefined; from: number; to: number }) {
  if (!wave || wave.length === 0 || to <= from) return null;
  const i0 = Math.max(Math.floor(from / WAVE_STEP), 0);
  const i1 = Math.min(Math.ceil(to / WAVE_STEP), wave.length);
  const n = i1 - i0;
  if (n <= 0) return null;
  // 最多畫 600 條（再多也看不出來，而且 SVG 太重）
  const bars = Math.min(n, 600);
  let d = '';
  for (let b = 0; b < bars; b++) {
    const a = i0 + Math.floor((b * n) / bars);
    const z = i0 + Math.max(Math.floor(((b + 1) * n) / bars), Math.floor((b * n) / bars) + 1);
    let peak = 0;
    for (let k = a; k < Math.min(z, i1); k++) peak = Math.max(peak, wave[k]!);
    const h = Math.max(peak / 100, 0.04) * 46;
    d += `M${b + 0.5} ${50 - h}V${50 + h}`;
  }
  return (
    <svg
      className="wave"
      data-testid="wave"
      viewBox={`0 0 ${bars} 100`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
