// 資料模型（見 docs/PLAN.md §2.5）。Phase 1 只有主軌的影片/照片片段；
// 其他軌道與物件種類（文字、貼圖、繪畫、調整）在之後的 Phase 加進 Track.kind / Item 聯集。

export type Aspect = '9:16' | '16:9' | '1:1' | '3:4' | '4:3';

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

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'add';
export type Outline = { color: string; width: number }; // width：以 1080 寬畫面為基準的 px
/** 裁切：各邊切掉的比例 0–0.9 */
export type Crop = { l: number; t: number; r: number; b: number };

export type ItemBase = {
  id: string;
  start: number; // 時間軸位置（秒）。主軌由 relayout 自動算出，首尾相接
  duration: number; // 時間軸上的長度（秒）
  /** x、y：中心點，佔畫面寬/高的比例；scale：乘上「填滿/完整」算出的基本大小；rotation：度，順時針 */
  transform: Transform;
  blend?: BlendMode;
  cornerRadius?: number; // 0–0.5，佔短邊的比例（畫中畫圓角）
  outline?: Outline;
  crop?: Crop;
};

export type VideoItem = ItemBase & {
  type: 'video' | 'image';
  assetId: string;
  trimIn: number; // 素材內的起點（秒）
  speed: number; // 0.25–4；照片固定 1
  volume: number; // 0–1
  fit: 'cover' | 'contain';
};

// Phase 2 的最小文字卡：只有一段文字、系統字體。Phase 3 會擴充成完整的 TextCard（見 docs/TEXT_CARDS.md）。
export type TextRun = {
  text: string;
  fontId: string;
  size: number; // px，以 1080 寬畫面為基準
  color: string;
  letterSpacing: number; // em
  lineHeight: number; // 倍數
  weight: 'normal' | 'bold';
};
export type TextCard = { runs: TextRun[]; align: 'left' | 'center' | 'right' };
export type TextItem = ItemBase & { type: 'text'; card: TextCard };

export type Item = VideoItem | TextItem;

/** 軌道由下往上排列 = 圖層順序；index 0 一定是主軌 */
export type TrackKind = 'main' | 'overlay' | 'text';

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
  /** true = 比例跟著第一個素材自動決定（使用者手動改過比例就變 false）；舊專案沒有這個欄位＝false */
  aspectAuto?: boolean;
  width: number;
  height: number;
  fps: number;
  assets: Asset[];
  tracks: Track[];
  thumbnail?: string;
  version: 1;
};
