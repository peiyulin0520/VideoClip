import { TRACK_NAMES } from './defaults';
import type { Project, Track, TrackKind } from './types';
import { normalizeZones } from '../engine/timeline';

// 專案資料格式轉換。
// v1 → v2（2026-11-12）：主軌（main）與疊加軌（overlay）合併成影像軌（media）；沒有磁吸的主軌，
// 每個片段的 start 本來就存著（relayout 算好的），直接保留，gap 欄位的效果已經在 start 裡，刪掉。
// 軌道依種類分區：影像 → 特效 → 字卡 → 音訊，字卡永遠在影像上面。

type LooseTrack = Omit<Track, 'kind'> & { kind: TrackKind | 'main' | 'overlay' };
type LooseProject = Omit<Project, 'tracks' | 'version'> & { tracks: LooseTrack[]; version?: number };

const DEFAULT_OLD_NAME = /^(主軌|疊加(?: \d+)?)$/;

export type Migrated = {
  project: Project;
  /** 有沒有做過轉換（要不要存回去） */
  changed: boolean;
  /** 為了讓字卡永遠在影像上面，調整了圖層順序（要提醒使用者） */
  reordered: boolean;
};

export function migrateProject(input: Project | LooseProject): Migrated {
  const p = input as LooseProject;
  if (p.version === 2) return { project: input as Project, changed: false, reordered: false };

  let mediaCount = 0;
  const tracks: Track[] = p.tracks.map((t) => {
    const isMedia = t.kind === 'main' || t.kind === 'overlay' || t.kind === 'media';
    const kind: TrackKind = isMedia ? 'media' : (t.kind as TrackKind);
    if (isMedia) mediaCount++;
    // 預設名稱（主軌、疊加 N）改成「影像 N」；使用者自己改過的名字保留
    const name = isMedia && DEFAULT_OLD_NAME.test(t.name) ? `${TRACK_NAMES.media} ${mediaCount}` : t.name;
    const items = t.items.map((it) => {
      if (!('gap' in it)) return it;
      const { gap: _gap, ...rest } = it as typeof it & { gap?: number };
      void _gap;
      return rest;
    });
    return { ...t, kind, name, items } as Track;
  });

  const sorted = normalizeZones(tracks);
  const reordered = sorted.some((t, i) => t !== tracks[i]);
  return {
    project: { ...p, tracks: sorted, version: 2 } as Project,
    changed: true,
    reordered,
  };
}
