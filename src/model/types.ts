// 資料模型（見 docs/PLAN.md §2.5）。Phase 1 只有主軌的影片/照片片段；
// 其他軌道與物件種類（文字、貼圖、繪畫、調整）在之後的 Phase 加進 Track.kind / Item 聯集。

export type Aspect = '9:16' | '16:9' | '1:1';

export type Asset = {
  id: string;
  kind: 'video' | 'image';
  name: string;
  mime: string;
  size: number; // bytes
  duration: number; // 秒；照片為 0
  width: number;
  height: number;
  hasAudio: boolean;
  /** 小縮圖（JPEG dataURL），沿著素材時間平均取樣，用於時間軸與專案封面 */
  thumbs: string[];
};

export type Transform = { x: number; y: number; scale: number; rotation: number; opacity: number };

export type ItemBase = {
  id: string;
  start: number; // 時間軸位置（秒）。主軌由 relayout 自動算出，首尾相接
  duration: number; // 時間軸上的長度（秒）
  transform: Transform;
};

export type VideoItem = ItemBase & {
  type: 'video' | 'image';
  assetId: string;
  trimIn: number; // 素材內的起點（秒）
  speed: number; // 0.25–4；照片固定 1
  volume: number; // 0–1
  fit: 'cover' | 'contain';
};

export type Item = VideoItem;

export type TrackKind = 'main';

export type Track = {
  id: string;
  kind: TrackKind;
  name: string;
  hidden: boolean;
  locked: boolean;
  muted?: boolean;
  items: Item[];
};

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  aspect: Aspect;
  width: number;
  height: number;
  fps: number;
  assets: Asset[];
  tracks: Track[];
  thumbnail?: string;
  version: 1;
};
