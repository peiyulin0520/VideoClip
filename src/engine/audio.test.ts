import { describe, expect, it } from 'vitest';
import { chooseAudioMode, elementAudioState } from './audio';
import { driftPlan } from './player';

describe('chooseAudioMode：靜音模式下影片也要有聲音', () => {
  it('有 Audio Session API → Web Audio（音量可調，先設成「播放」類別）', () => {
    expect(chooseAudioMode({ hasAudioSession: true, isIOS: true })).toBe('webaudio');
  });
  it('不是 iOS（桌機、Android）→ Web Audio', () => {
    expect(chooseAudioMode({ hasAudioSession: false, isIOS: false })).toBe('webaudio');
  });
  it('舊版 iOS（沒有 Audio Session API）→ 直接用 <video> 出聲，不然靜音模式會沒聲音', () => {
    expect(chooseAudioMode({ hasAudioSession: false, isIOS: true })).toBe('element');
  });
});

describe('elementAudioState', () => {
  it('Web Audio：音量走 gain（可到 200%），元素本身不靜音；關聲音時 gain 是 0', () => {
    expect(elementAudioState({ mode: 'webaudio', volume: 0.5, silent: false })).toEqual({
      muted: false,
      elVolume: 1,
      gain: 0.5,
    });
    expect(elementAudioState({ mode: 'webaudio', volume: 2, silent: false }).gain).toBe(2);
    expect(elementAudioState({ mode: 'webaudio', volume: 1, silent: true }).gain).toBe(0);
    expect(elementAudioState({ mode: 'webaudio', volume: 0, silent: false }).gain).toBe(0);
  });
  it('直接用元素：只有開／關，關的時候靜音', () => {
    expect(elementAudioState({ mode: 'element', volume: 0.5, silent: false }).muted).toBe(false);
    expect(elementAudioState({ mode: 'element', volume: 0, silent: false }).muted).toBe(true);
    expect(elementAudioState({ mode: 'element', volume: 1, silent: true }).muted).toBe(true);
    expect(elementAudioState({ mode: 'element', volume: 2, silent: false }).elVolume).toBe(1);
  });
});

describe('driftPlan：播放中對時，小差距慢慢追、大差距才硬跳', () => {
  it('差很少 → 不動', () => {
    expect(driftPlan(0.02, 1)).toEqual({ seek: false, rate: 1 });
  });
  it('影片落後一點 → 加快一點；超前 → 放慢一點，都不跳', () => {
    const behind = driftPlan(0.2, 1);
    expect(behind.seek).toBe(false);
    expect(behind.rate).toBeGreaterThan(1);
    expect(behind.rate).toBeLessThanOrEqual(1.15);
    const ahead = driftPlan(-0.2, 1);
    expect(ahead.seek).toBe(false);
    expect(ahead.rate).toBeLessThan(1);
    expect(ahead.rate).toBeGreaterThanOrEqual(0.85);
  });
  it('差超過半秒 → 硬跳，速度回到原本', () => {
    expect(driftPlan(0.8, 2)).toEqual({ seek: true, rate: 2 });
    expect(driftPlan(-0.8, 0.5)).toEqual({ seek: true, rate: 0.5 });
  });
  it('變速的片段以它的速度為基準', () => {
    expect(driftPlan(0.2, 2).rate).toBeGreaterThan(2);
  });
});
