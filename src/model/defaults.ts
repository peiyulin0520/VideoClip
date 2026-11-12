import type { Aspect, Asset, Project, TextItem, Track, TrackKind, VideoItem } from './types';

export const ASPECTS: Record<Aspect, { label: string; width: number; height: number }> = {
  '9:16': { label: '直式 9:16', width: 1080, height: 1920 },
  '3:4': { label: '直式 3:4', width: 1080, height: 1440 },
  '1:1': { label: '方形 1:1', width: 1080, height: 1080 },
  '4:3': { label: '橫式 4:3', width: 1440, height: 1080 },
  '16:9': { label: '橫式 16:9', width: 1920, height: 1080 },
};

/** 依素材（顯示後）的寬高，挑形狀最接近的專案比例 */
export function pickAspect(width: number, height: number): Aspect {
  if (!(width > 0) || !(height > 0)) return '9:16';
  const r = Math.log(width / height);
  let best: Aspect = '9:16';
  let bestD = Infinity;
  for (const [key, a] of Object.entries(ASPECTS) as [Aspect, (typeof ASPECTS)[Aspect]][]) {
    const d = Math.abs(r - Math.log(a.width / a.height));
    if (d < bestD) {
      bestD = d;
      best = key;
    }
  }
  return best;
}

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

/** 新專案的第一條影像軌 */
export function createMediaTrack(): Track {
  return { id: newId('t_'), kind: 'media', name: '影像 1', hidden: false, locked: false, items: [] };
}

/** 改專案比例（直接改傳進來的物件，immer 草稿也可以）。auto=true 代表之後仍跟著第一個素材。 */
export function assignAspect(
  p: { aspect: Aspect; width: number; height: number; aspectAuto?: boolean },
  aspect: Aspect,
  auto: boolean,
): void {
  p.aspect = aspect;
  p.width = ASPECTS[aspect].width;
  p.height = ASPECTS[aspect].height;
  if (auto) p.aspectAuto = true;
  else delete p.aspectAuto;
}

export function createProject(
  name: string,
  aspect: Aspect = '9:16',
  now = Date.now(),
  aspectAuto = false,
): Project {
  const a = ASPECTS[aspect];
  return {
    id: newId('p_'),
    name,
    createdAt: now,
    updatedAt: now,
    aspect,
    ...(aspectAuto ? { aspectAuto: true } : {}),
    width: a.width,
    height: a.height,
    fps: 30,
    assets: [],
    tracks: [createMediaTrack()],
    version: 2,
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

export const TEXT_DEFAULT_DURATION = 3;

export const TRACK_NAMES: Record<TrackKind, string> = {
  media: '影像',
  effect: '特效',
  text: '文字',
  audio: '音樂',
};

export function createTrack(kind: TrackKind, existing: Track[]): Track {
  const n = existing.filter((t) => t.kind === kind).length + 1;
  return {
    id: newId('t_'),
    kind,
    name: `${TRACK_NAMES[kind]} ${n}`,
    hidden: false,
    locked: false,
    items: [],
  };
}

/** 背景音樂：放在 audio 軌，沒有畫面（transform、fit 只是湊欄位，不會用到） */
export function createAudioClip(asset: Asset, start: number, duration = asset.duration): VideoItem {
  const c = createClip({ ...asset, kind: 'video' });
  return { ...c, type: 'audio', start, duration: Math.max(duration, MIN_CLIP_DURATION), fit: 'contain' };
}

/** 疊加素材：預設縮小 50%、完整顯示，放在畫面中央（畫中畫） */
export function createOverlayClip(asset: Asset, start: number): VideoItem {
  const c = createClip(asset);
  return { ...c, start, fit: 'contain', transform: { ...c.transform, scale: 0.5 } };
}

/** 圖形／字塊預設的框線顏色（棕色）。固定色，不跟介面主題：它會被畫進匯出的影片裡 */
export const SHAPE_LINE = '#8b5a44';

/** 獨立圖形（貼圖用）：沒有文字的字卡，只有字塊；大小用內距調（也可以用右上角縮放） */
export function createShapeItem(start: number): TextItem {
  const t = createTextItem(start, '');
  const run = t.card.runs[0]!;
  run.shadow = undefined;
  delete run.shadow;
  // 預設：透明底＋棕色細框線（要填滿到字塊的「填滿」打開、選顏色）
  t.card.box = {
    shape: 'star5',
    fill: '#ffd23f',
    fillOn: false,
    opacity: 1,
    stroke: { color: SHAPE_LINE, width: 6, opacity: 1 },
    padding: { top: 70, right: 70, bottom: 70, left: 70 },
    nudgeY: 0,
  };
  return t;
}

export function createTextItem(start: number, text = '點兩下編輯文字'): TextItem {
  return {
    id: newId('i_'),
    type: 'text',
    start,
    duration: TEXT_DEFAULT_DURATION,
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
    card: {
      align: 'center',
      runs: [
        {
          text,
          fontId: 'system',
          size: 96,
          color: '#ffffff',
          letterSpacing: 0,
          lineHeight: 1.25,
          weight: 'bold',
          shadow: { color: 'rgba(0,0,0,0.55)', blur: 6, x: 0, y: 2 },
        },
      ],
    },
  };
}
