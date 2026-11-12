import { describe, expect, it } from 'vitest';
import { createAudioClip, createClip, createProject, createTrack } from '../model/defaults';
import type { Asset, VideoItem } from '../model/types';
import { fadeGain, fadeSpans } from './audio';
import { audibleItems } from './exporter';
import { mediaKindOf } from './probe';
import { relayout, totalDuration, trimEndFree, trimStartFree, visibleLayers } from './timeline';
import { quantizeWave } from './wave';

const asset = (id: string, kind: Asset['kind'], duration: number, hasAudio = true): Asset => ({
  id,
  kind,
  name: id,
  mime: kind === 'audio' ? 'audio/wav' : 'video/mp4',
  size: 1,
  duration,
  width: kind === 'audio' ? 0 : 100,
  height: kind === 'audio' ? 0 : 100,
  hasAudio,
  thumbs: [],
});

describe('fadeGain：淡入淡出（線性）', () => {
  it('沒設定＝一直是 1', () => {
    expect(fadeGain(0, 10)).toBe(1);
    expect(fadeGain(5, 10, 0, 0)).toBe(1);
  });
  it('淡入：開頭 0，淡入結束 1；淡出：結尾 0', () => {
    expect(fadeGain(0, 10, 2, 0)).toBe(0);
    expect(fadeGain(1, 10, 2, 0)).toBeCloseTo(0.5);
    expect(fadeGain(2, 10, 2, 0)).toBe(1);
    expect(fadeGain(10, 10, 0, 2)).toBe(0);
    expect(fadeGain(9, 10, 0, 2)).toBeCloseTo(0.5);
    expect(fadeGain(5, 10, 2, 2)).toBe(1);
  });
  it('淡入淡出各自最長是長度的一半，不會重疊', () => {
    expect(fadeSpans(4, 9, 9)).toEqual({ fi: 2, fo: 2 });
    expect(fadeGain(2, 4, 9, 9)).toBe(1); // 剛好在兩段交界
    expect(fadeGain(1, 4, 9, 9)).toBeCloseTo(0.5);
  });
  it('時間超出範圍或負數不會當掉、結果在 0–1', () => {
    expect(fadeGain(-1, 10, 2, 2)).toBe(0);
    expect(fadeGain(11, 10, 2, 2)).toBe(0);
    expect(fadeGain(1, 0, 2, 2)).toBeLessThanOrEqual(1);
  });
});

describe('背景音樂的資料', () => {
  it('createAudioClip：type=audio、從 start 開始、長度夾在素材長度', () => {
    const c = createAudioClip(asset('m', 'audio', 30), 2, 5);
    expect(c).toMatchObject({ type: 'audio', start: 2, duration: 5, trimIn: 0, speed: 1, volume: 1 });
    expect(createAudioClip(asset('m', 'audio', 30), 0).duration).toBe(30);
  });
  it('專案長度不算音樂（音樂比影片長就在影片結束時切掉）', () => {
    const p = createProject('x');
    const v = asset('v', 'video', 4);
    const m = asset('m', 'audio', 30);
    p.assets = [v, m];
    p.tracks[0]!.items = relayout([createClip(v)]);
    const tr = createTrack('audio', p.tracks);
    tr.items = [createAudioClip(m, 0)];
    p.tracks.push(tr);
    expect(totalDuration(p)).toBe(4);
  });
  it('音樂沒有畫面：不在圖層裡', () => {
    const p = createProject('x');
    const v = asset('v', 'video', 4);
    const m = asset('m', 'audio', 4);
    p.assets = [v, m];
    p.tracks[0]!.items = relayout([createClip(v)]);
    const tr = createTrack('audio', p.tracks);
    tr.items = [createAudioClip(m, 0)];
    p.tracks.push(tr);
    expect(visibleLayers(p, 1).map((l) => l.track.kind)).toEqual(['main']);
  });
  it('音樂軌的修剪：頭端不能超過素材起點、尾端不能超過素材長度、不壓到旁邊的音樂', () => {
    const m = asset('m', 'audio', 10);
    const a = { ...createAudioClip(m, 0, 4), id: 'a' };
    const b = { ...createAudioClip(m, 5, 3), id: 'b', trimIn: 2 };
    expect(trimEndFree([a, b], 'a', 99, m)[0]!.duration).toBeCloseTo(5); // 最多到旁邊那段開始
    // 往前拉：素材還能拉 2 秒，但前一段音樂在 4 秒結束 → 只能拉 1 秒
    expect((trimStartFree([a, b], 'b', -99)[1] as VideoItem).trimIn).toBeCloseTo(1);
    // 沒有旁邊的音樂時最多拉回素材起點
    expect((trimStartFree([b], 'b', -99)[0] as VideoItem).trimIn).toBeCloseTo(0);
  });
  it('audibleItems 把有聲音的音樂也算進來；靜音軌道、音量 0 不算', () => {
    const p = createProject('x');
    const v = asset('v', 'video', 4, false);
    const m = asset('m', 'audio', 4);
    p.assets = [v, m];
    p.tracks[0]!.items = relayout([createClip(v)]);
    const tr = createTrack('audio', p.tracks);
    tr.items = [createAudioClip(m, 0)];
    p.tracks.push(tr);
    expect(audibleItems(p).map((x) => x.asset.id)).toEqual(['m']);
    tr.muted = true;
    expect(audibleItems(p)).toHaveLength(0);
    tr.muted = false;
    (tr.items[0] as VideoItem).volume = 0;
    expect(audibleItems(p)).toHaveLength(0);
  });
});

describe('音檔判斷與波形', () => {
  it('mediaKindOf：音檔的 mime 或副檔名', () => {
    expect(mediaKindOf(new File([], 'a.mp3', { type: 'audio/mpeg' }))).toBe('audio');
    expect(mediaKindOf(new File([], 'a.m4a', { type: '' }))).toBe('audio');
    expect(mediaKindOf(new File([], 'a.wav', { type: '' }))).toBe('audio');
    expect(mediaKindOf(new File([], 'a.mp4', { type: 'video/mp4' }))).toBe('video');
    expect(mediaKindOf(new File([], 'a.png', { type: 'image/png' }))).toBe('image');
  });
  it('quantizeWave：正規化成 0–100；全 0 回 undefined', () => {
    expect(quantizeWave([0.5, 0.25, 0])).toEqual([100, 50, 0]);
    expect(quantizeWave([0, 0, 0])).toBeUndefined();
    expect(quantizeWave([])).toBeUndefined();
  });
});
