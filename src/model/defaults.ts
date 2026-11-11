import type { Aspect, Asset, Project, Track, VideoItem } from './types';

export const ASPECTS: Record<Aspect, { label: string; width: number; height: number }> = {
  '9:16': { label: '直式 9:16', width: 1080, height: 1920 },
  '16:9': { label: '橫式 16:9', width: 1920, height: 1080 },
  '1:1': { label: '方形 1:1', width: 1080, height: 1080 },
};

export const IMAGE_DEFAULT_DURATION = 3;
export const MIN_CLIP_DURATION = 0.2;
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;

export function newId(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return prefix + rnd;
}

export function createMainTrack(): Track {
  return { id: newId('t_'), kind: 'main', name: '主軌', hidden: false, locked: false, items: [] };
}

export function createProject(name: string, aspect: Aspect = '9:16', now = Date.now()): Project {
  const a = ASPECTS[aspect];
  return {
    id: newId('p_'),
    name,
    createdAt: now,
    updatedAt: now,
    aspect,
    width: a.width,
    height: a.height,
    fps: 30,
    assets: [],
    tracks: [createMainTrack()],
    version: 1,
  };
}

export function createClip(asset: Asset): VideoItem {
  return {
    id: newId('i_'),
    type: asset.kind,
    assetId: asset.id,
    start: 0,
    duration: asset.kind === 'image' ? IMAGE_DEFAULT_DURATION : Math.max(asset.duration, MIN_CLIP_DURATION),
    trimIn: 0,
    speed: 1,
    volume: 1,
    fit: 'cover',
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
  };
}

/** 預設專案名稱：新專案 1、新專案 2… */
export function nextProjectName(existing: string[]): string {
  let n = existing.length + 1;
  while (existing.includes(`新專案 ${n}`)) n++;
  return `新專案 ${n}`;
}
