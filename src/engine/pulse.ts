import type { Item, Keyframe, Transform } from '../model/types';

// 定格小特效：在某個定格的時間「原地動一下」，不會讓素材出現／消失，也不加濾鏡，只動位置、大小、旋轉。
// 進場、離場、轉場（溶接、閃、滑…）不在這裡。純數學，預覽、單格輸出、整支匯出都走同一個 withTime。

export type Pulse = NonNullable<Keyframe['pulse']>;
export type PulseKind = Pulse['kind'];

export const PULSES: { id: PulseKind; name: string; code: string }[] = [
  { id: 'shake', name: '震一下', code: '震' },
  { id: 'pop', name: '彈一下', code: '彈' },
  { id: 'wobble', name: '晃一下', code: '晃' },
  { id: 'jump', name: '跳一下', code: '跳' },
];

export const DEFAULT_PULSE: Pulse = { kind: 'shake', duration: 0.5, strength: 0.6 };
export const PULSE_MIN = 0.2;
export const PULSE_MAX = 2;

export const pulseCode = (k: PulseKind): string => PULSES.find((p) => p.id === k)?.code ?? '';
export const pulseName = (k: PulseKind): string => PULSES.find((p) => p.id === k)?.name ?? '';

export type PulseOffset = { dx: number; dy: number; scale: number; rotation: number };
const NONE: PulseOffset = { dx: 0, dy: 0, scale: 1, rotation: 0 };

const smooth = (a: number) => a * a * (3 - 2 * a);

/** 小特效播到第 elapsed 秒的偏移；開始前、結束後都是「沒有偏移」 */
export function pulseOffset(p: Pulse, elapsed: number): PulseOffset {
  const dur = Math.max(p.duration, 0.01);
  if (elapsed < 0 || elapsed >= dur || p.strength <= 0) return NONE;
  const s = Math.min(Math.max(p.strength, 0), 1);
  const u = elapsed / dur; // 0～1
  switch (p.kind) {
    case 'shake': {
      // 左右快速晃（每 1/30 秒換一次方向），越來越小；最大約 7% 畫面寬
      const dir = Math.floor(elapsed * 30) % 2 === 0 ? 1 : -1;
      return { ...NONE, dx: 0.07 * s * dir * (1 - u) };
    }
    case 'pop': {
      // 很快放大到 1+25%×力道，再順順地縮回來
      const k = u < 0.3 ? smooth(u / 0.3) : 1 - smooth((u - 0.3) / 0.7);
      return { ...NONE, scale: 1 + 0.25 * s * k };
    }
    case 'wobble': {
      // 左右轉兩次再回正，最大約 10°
      return { ...NONE, rotation: 10 * s * Math.sin(u * Math.PI * 4) * (1 - u) };
    }
    case 'jump': {
      // 往上跳（最高約 10% 畫面高）再落下，落地時稍微壓扁
      const dy = -0.1 * s * 4 * u * (1 - u);
      const sq = u > 0.85 ? 1 - 0.08 * s * Math.sin(((u - 0.85) / 0.15) * Math.PI) : 1;
      return { ...NONE, dy, scale: sq };
    }
  }
}

/** 物件開始後 local 秒，所有定格的小特效疊起來的偏移（通常只有 0 或 1 個在播） */
export function pulseAt(item: Item, local: number): PulseOffset | null {
  const kfs = item.keyframes;
  if (!kfs) return null;
  let out: PulseOffset | null = null;
  for (const k of kfs) {
    if (!k.pulse) continue;
    const e = local - k.t;
    if (e < 0 || e >= k.pulse.duration) continue;
    const o = pulseOffset(k.pulse, e);
    out = out
      ? {
          dx: out.dx + o.dx,
          dy: out.dy + o.dy,
          scale: out.scale * o.scale,
          rotation: out.rotation + o.rotation,
        }
      : o;
  }
  return out;
}

export const applyPulse = (tf: Transform, o: PulseOffset | null): Transform =>
  o
    ? { ...tf, x: tf.x + o.dx, y: tf.y + o.dy, scale: tf.scale * o.scale, rotation: tf.rotation + o.rotation }
    : tf;

export const hasPulse = (k: Keyframe): boolean => !!k.pulse;
