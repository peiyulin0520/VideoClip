import { newId, TRACK_NAMES } from './defaults';
import type { Project, Track, TrackKind } from './types';
import { normalizeZones } from '../engine/timeline';
import { LEGACY_TRANSITIONS } from '../engine/transitions';

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

/**
 * 舊的版型（G4 之前）：外框軌鎖住、各格是普通軌道，沒有 group 標記。補上標記：外框軌解鎖，
 * 各格軌道藏起來、素材放完顯示黑色色塊。已經標記過的不動。
 */
export function markLegacyGroups(p: Project): { project: Project; changed: boolean } {
  let changed = false;
  const tracks = p.tracks.map((t) => {
    if (t.groupRole || t.items.length === 0) return t;
    const first = t.items[0]!;
    if (first.type === 'text' || first.type === 'audio' || !first.group) return t;
    changed = true;
    return first.cell
      ? { ...t, group: first.group, groupRole: 'cell' as const, fill: 'black' as const }
      : { ...t, group: first.group, groupRole: 'frame' as const, locked: false };
  });
  const marked = changed ? { ...p, tracks } : p;
  const fixed = repairGroups(marked);
  const stk = migrateStickers(fixed.project);
  return { project: stk.project, changed: changed || fixed.changed || stk.changed };
}

/**
 * 貼圖自成一類（2026-11-14）：①舊專案裡的貼圖素材（檔名「貼圖-」「GIPHY-」開頭）補上 origin；
 * ②影像軌裡的貼圖：整條都是貼圖就把那條軌道改成貼圖軌，混著影片、照片的把貼圖搬到貼圖軌（時間不變）。
 * 至少留一條影像軌；版型的軌道不動。已經轉過的不會再動。
 */
export function migrateStickers(p: Project): { project: Project; changed: boolean } {
  let changed = false;
  const assets = (p.assets ?? []).map((a) => {
    if (a.origin || !/^(貼圖-|GIPHY-)/.test(a.name)) return a;
    changed = true;
    return { ...a, origin: 'sticker' as const };
  });
  const isSticker = (it: Track['items'][number]) =>
    it.type !== 'text' &&
    it.type !== 'audio' &&
    assets.find((a) => a.id === it.assetId)?.origin === 'sticker';
  let tracks = p.tracks.map((t) => ({ ...t }));
  const plain = (t: Track) => t.kind === 'media' && !t.groupRole;
  const withStickers = tracks.filter((t) => plain(t) && t.items.some(isSticker));
  if (withStickers.length === 0) return { project: changed ? { ...p, assets } : p, changed };
  const keepMedia = () => tracks.filter((t) => t.kind === 'media').length;
  const moved: Track['items'] = [];
  for (const t of withStickers) {
    const all = t.items.every(isSticker);
    if (all && keepMedia() > 1) {
      t.kind = 'sticker';
      if (/^影像 \d+$/.test(t.name)) t.name = t.name.replace('影像', TRACK_NAMES.sticker);
      changed = true;
    } else if (!all) {
      moved.push(...t.items.filter(isSticker));
      t.items = t.items.filter((x) => !isSticker(x)) as never;
      changed = true;
    }
  }
  // 搬出來的貼圖：放進第一條放得下的貼圖軌，沒有就新增一條
  for (const it of moved) {
    const fits = (t: Track) =>
      t.kind === 'sticker' &&
      !t.items.some((o) => it.start < o.start + o.duration - 1e-6 && o.start < it.start + it.duration - 1e-6);
    let dst = tracks.find(fits);
    if (!dst) {
      dst = {
        id: newId('t_'),
        kind: 'sticker',
        name: `${TRACK_NAMES.sticker} ${tracks.filter((t) => t.kind === 'sticker').length + 1}`,
        hidden: false,
        locked: false,
        items: [],
      } as Track;
      tracks.push(dst);
    }
    dst.items.push(it as never);
  }
  tracks = normalizeZones(tracks as Track[]);
  return { project: { ...p, assets, tracks: tracks as Track[] }, changed };
}

/**
 * 修復版型資料：①只有格子、沒有外框的 group（以前「刪除並補齊」只刪外框造成的孤兒格子，時間軸上看不到、預覽卻還在畫）
 * → 格子變回普通影像軌；②已移除的動態模板（story3）→ 清掉模板欄位，變成靜態版型；字卡的輪播欄位也清掉。
 */
export function repairGroups(p: Project): { project: Project; changed: boolean } {
  let changed = false;
  const hasFrame = new Set<string>();
  for (const t of p.tracks)
    if (t.groupRole === 'frame')
      for (const it of t.items) if (it.type !== 'text' && it.group) hasFrame.add(it.group);
  const tracks = p.tracks.map((t) => {
    let tr = t;
    const orphan = t.groupRole === 'cell' && !!t.group && !hasFrame.has(t.group);
    if (orphan) {
      const { group: _g, groupRole: _r, fill: _f, ...rest } = t;
      void _g;
      void _r;
      void _f;
      tr = rest as Track;
      changed = true;
    }
    const items = tr.items.map((it) => {
      if (it.type === 'text') {
        if (!it.fontCycle && !it.group) return it;
        changed = true;
        const { fontCycle: _c, group: _gg, ...rest } = it;
        void _c;
        void _gg;
        return rest;
      }
      if (it.type === 'audio') return it;
      // 舊版轉場名稱（fade、black…）換成新名稱
      const legacyKind = it.transitionIn && LEGACY_TRANSITIONS[it.transitionIn.kind];
      if (legacyKind) {
        changed = true;
        it = { ...it, transitionIn: { ...it.transitionIn!, kind: legacyKind } };
      }
      if (orphan || it.template || it.cellAnim) {
        const next = { ...it };
        if (orphan) {
          delete next.group;
          delete next.cell;
          delete next.visible;
          delete next.motion;
        }
        delete next.template;
        delete next.cellAnim;
        changed = true;
        return next;
      }
      return it;
    });
    return items.some((x, i) => x !== tr.items[i]) ? ({ ...tr, items } as Track) : tr;
  });
  return { project: changed ? { ...p, tracks } : p, changed };
}

export function migrateProject(input: Project | LooseProject): Migrated {
  const p = input as LooseProject;
  if (p.version === 2) {
    const g = markLegacyGroups(input as Project);
    return { project: g.project, changed: g.changed, reordered: false };
  }

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
    project: markLegacyGroups({ ...p, tracks: sorted, version: 2 } as Project).project,
    changed: true,
    reordered,
  };
}
