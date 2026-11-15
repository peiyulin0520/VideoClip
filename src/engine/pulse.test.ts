import { describe, expect, it } from 'vitest';
import type { Item, VideoItem } from '../model/types';
import { withTime } from './keyframes';
import { applyPulse, pulseAt, pulseOffset } from './pulse';

const base = { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 };
const clip = (kfs: VideoItem['keyframes']): VideoItem =>
  ({
    id: 'a',
    type: 'video',
    assetId: 'x',
    start: 10,
    duration: 8,
    trimIn: 0,
    speed: 1,
    volume: 1,
    fit: 'cover',
    transform: base,
    keyframes: kfs,
  }) as VideoItem;

const P = (kind: 'shake' | 'pop' | 'wobble' | 'jump', extra = {}) => ({
  kind,
  duration: 0.6,
  strength: 0.6,
  ...extra,
});

describe('pulseOffset：定格小特效（震／彈／晃／跳）', () => {
  it('開始前、結束後都沒有偏移；力道 0 也沒有', () => {
    for (const kind of ['shake', 'pop', 'wobble', 'jump'] as const) {
      const none = { dx: 0, dy: 0, scale: 1, rotation: 0 };
      expect(pulseOffset(P(kind), -0.1)).toEqual(none);
      expect(pulseOffset(P(kind), 0.6)).toEqual(none);
      expect(pulseOffset(P(kind, { strength: 0 }), 0.2)).toEqual(none);
    }
  });
  it('震：左右換邊、越來越小；彈：最大約 1.15；晃：有轉角；跳：往上（y 變小）再落回', () => {
    const a = pulseOffset(P('shake'), 0.01).dx;
    const b = pulseOffset(P('shake'), 0.05).dx;
    expect(Math.sign(a)).toBe(-Math.sign(b));
    expect(Math.abs(pulseOffset(P('shake'), 0.5).dx)).toBeLessThan(Math.abs(a));
    expect(pulseOffset(P('pop'), 0.18).scale).toBeCloseTo(1.15, 2);
    expect(Math.abs(pulseOffset(P('wobble'), 0.08).rotation)).toBeGreaterThan(1);
    expect(pulseOffset(P('jump'), 0.3).dy).toBeLessThan(-0.04);
  });
  it('力道越大動得越多', () => {
    expect(pulseOffset(P('pop', { strength: 1 }), 0.18).scale).toBeGreaterThan(
      pulseOffset(P('pop', { strength: 0.3 }), 0.18).scale,
    );
  });
});

describe('pulseAt／withTime：小特效疊在內插後的位置上', () => {
  const it2 = clip([
    { t: 0, ...base },
    { t: 2, ...base, x: 0.9, pulse: P('shake') },
  ]);
  it('沒有小特效的物件是 null；播放時間在小特效範圍外也是 null', () => {
    expect(pulseAt(clip([{ t: 0, ...base }]), 1)).toBeNull();
    expect(pulseAt(it2, 1.9)).toBeNull();
    expect(pulseAt(it2, 2.7)).toBeNull();
  });
  it('小特效播放中（不被下一個定格截斷）位置有偏移，結束後回到原位', () => {
    const during = withTime(it2, 10 + 2.01).transform.x;
    const after = withTime(it2, 10 + 2.8).transform.x;
    expect(Math.abs(during - 0.9)).toBeGreaterThan(0.005);
    expect(after).toBeCloseTo(0.9, 6);
  });
  it('applyPulse 不改傳入的 transform', () => {
    const tf = { ...base };
    applyPulse(tf, { dx: 0.1, dy: 0, scale: 1, rotation: 0 });
    expect(tf.x).toBe(0.5);
  });
  it('新增定格用的底值不含小特效（transformAt 不吃偏移）', async () => {
    const { upsertKeyframe } = await import('./keyframes');
    const kfs = upsertKeyframe(it2 as Item, 2.1, {});
    const mid = kfs.find((k) => Math.abs(k.t - 2.1) < 1e-6)!;
    expect(mid.x).toBeCloseTo(0.9, 6);
  });
});
