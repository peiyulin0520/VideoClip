// 資料模型（見 docs/PLAN.md §2.5）。Phase 1 只有主軌的影片/照片片段；
// 其他軌道與物件種類（文字、貼圖、繪畫、調整）在之後的 Phase 加進 Track.kind / Item 聯集。

export type Aspect = '9:16' | '16:9' | '1:1' | '3:4' | '4:3';

export type Asset = {
  id: string;
  kind: 'video' | 'image' | 'audio';
  name: string;
  mime: string;
  size: number; // bytes
  duration: number; // 秒；照片為 0
  width: number;
  height: number;
  hasAudio: boolean;
  /** 小縮圖（JPEG dataURL），沿著素材時間平均取樣，用於時間軸與專案封面 */
  thumbs: string[];
  /** 音樂素材：音量波形，每 0.1 秒一個值（0–100），給時間軸畫波形用 */
  wave?: number[];
  /** 會動的圖片（GIF／動態 WebP，例如 GIPHY 貼圖）：格數與一圈的長度（秒）；沒有＝一般照片 */
  anim?: { frames: number; duration: number };
  /** 影片的編碼（'avc'、'hevc'、'vp9'…）與是不是 HDR；匯入時讀容器得到，舊專案沒有 */
  codec?: string;
  hdr?: boolean;
  /**
   * 預覽用的輕量影片（H.264、長邊 960、SDR）：播放用它，匯出用原檔。
   * none＝原檔夠輕不需要；pending＝製作中；ready＝可用；failed＝做不出來（照用原檔）
   */
  proxy?: { status: 'none' | 'pending' | 'ready' | 'failed'; mime?: string; width?: number; height?: number };
  /** 只放在記憶體（手機存不下）：關掉網頁後素材會遺失，要重新匯入 */
  unsaved?: boolean;
};

export type Transform = { x: number; y: number; scale: number; rotation: number; opacity: number };

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'add';
export type Outline = { color: string; width: number }; // width：以 1080 寬畫面為基準的 px
/** 裁切：各邊切掉的比例 0–0.9 */
export type Crop = { l: number; t: number; r: number; b: number };

export type ItemBase = {
  id: string;
  /** 使用者自己取的名字（時間軸片段、圖層清單上顯示）；沒有＝用預設名稱 */
  label?: string;
  start: number; // 時間軸位置（秒）。所有軌道都是自由擺放（2026-11-12 起沒有磁吸的主軌）
  duration: number; // 時間軸上的長度（秒）
  /** x、y：中心點，佔畫面寬/高的比例；scale：乘上「填滿/完整」算出的基本大小；rotation：度，順時針 */
  transform: Transform;
  blend?: BlendMode;
  cornerRadius?: number; // 0–0.5，佔短邊的比例（畫中畫圓角）
  outline?: Outline;
  crop?: Crop;
};

export type VideoItem = ItemBase & {
  /** audio＝背景音樂（只放在 audio 軌，沒有畫面） */
  type: 'video' | 'image' | 'audio';
  assetId: string;
  trimIn: number; // 素材內的起點（秒）
  speed: number; // 0.25–4；照片固定 1
  volume: number; // 0–2（200%）
  /** 聲音淡入／淡出的秒數（影片與音樂都能用）；沒有＝0 */
  fadeIn?: number;
  fadeOut?: number;
  fit: 'cover' | 'contain';
  /** 自由形狀裁切：多邊形的點，座標是「原始素材畫面」的比例 0–1（只留多邊形裡面，外面透明） */
  mask?: [number, number][];
  /**
   * 點陣圖遮罩（裁切模式的筆刷／橡皮擦）：PNG data URL，座標是整張原始素材畫面，不透明＝留下、透明＝去掉。
   * 有它時優先於 mask（多邊形）。
   */
  maskBitmap?: string;
  /** 多格版型：這個物件所在的格子（佔畫面寬、高的比例）。裁切模式完成時，畫面會填滿這個格子 */
  cell?: { x: number; y: number; w: number; h: number };
  /** 同一個版型的物件（外框與各格）共用的 id：一起縮放、移動、同一段時間，也用來「刪除整個版型」 */
  group?: string;
  /** 版型外框專用：看得到的範圍（佔整張外框圖的比例）；選取框、點選範圍用它，不用整張透明的圖 */
  visible?: { x: number; y: number; w: number; h: number };
  /** 版型外框專用：整個版型的動畫（捲動＝由下往上捲過畫面；滑入滑出＝開頭從右邊滑進來、結尾往左滑出去） */
  motion?: 'drift' | 'slide';
  /** 動態模板的格子：格子的範圍從 from（佔畫面寬、高的比例）在 t0–t1 秒（片段開始後）滑到 cell；之前停在 from */
  cellAnim?: { from: { x: number; y: number; w: number; h: number }; t0: number; t1: number };
  /** 動態模板外框：這個版型是哪一種動態模板（有整套的時間表，見 engine/story.ts） */
  template?: 'story3';
  /** 進場轉場：跟前面緊接的片段之間的效果（以兩個片段的接縫為中心，前半在前一個片段、後半在這個片段） */
  transitionIn?: { kind: TransitionKind; duration: number };
};

/**
 * 轉場種類（見 engine/transitions.ts 的目錄）。2026-11-13 前存的舊名稱（fade、black、white、push、rise、zoom）
 * 讀進來時由 migrate 換成新名稱。
 */
export type TransitionKind =
  | 'dissolve'
  | 'blackflash'
  | 'whiteflash'
  | 'overexpose'
  | 'zoomDissolve'
  | 'moveL'
  | 'moveR'
  | 'moveU'
  | 'moveD'
  | 'rollDown'
  | 'rollUp'
  | 'circleOut'
  | 'topOut'
  | 'bottomOut'
  | 'blur'
  | 'defocus'
  | 'fastL'
  | 'fastR'
  | 'slideL'
  | 'slideR'
  | 'slideU'
  | 'slideD'
  | 'zoomIn'
  | 'zoomOut'
  | 'flash'
  | 'filmUp'
  | 'filmLeft'
  | 'grid4'
  | 'grid9'
  | 'glitch1'
  | 'glitch2'
  | 'glitch3';

// 字卡（規格見 docs/TEXT_CARDS.md）。新欄位都是選填，Phase 2 存的舊字卡不用轉換。
export type Stroke = {
  color: string;
  width: number; // 從字緣往外的厚度，px（1080 基準）
  /** 只有字塊框線用：框線自己的透明度 0–1；沒有＝跟字塊填滿的透明度一樣（舊專案的長相） */
  opacity?: number;
};
export type TextShadow = { color: string; blur: number; x: number; y: number };
export type TextRun = {
  text: string;
  fontId: string;
  size: number; // px，以 1080（畫面短邊）為基準
  color: string;
  letterSpacing: number; // em，-0.2 ~ 1.0
  lineHeight: number; // 倍數，0.8 ~ 2.5
  weight: 'normal' | 'bold';
  /** 文字本身（含描邊、陰影）的透明度 0.1–1，沒有＝1；字塊、裝飾各自有自己的透明度 */
  opacity?: number;
  italic?: boolean; // 字型沒有斜體就斜切 -12°
  /** 多層描邊（由外到內，畫的時候依厚度由大到小）。例：白 12 + 粉 6 */
  strokes?: Stroke[];
  shadow?: TextShadow;
};
/** 文字樣式（一套）：新增文字時沿用上一次的樣式、「套用樣式到所有文字」都用這組欄位 */
export type TextStyle = Pick<
  TextRun,
  | 'fontId'
  | 'size'
  | 'color'
  | 'opacity'
  | 'weight'
  | 'italic'
  | 'letterSpacing'
  | 'lineHeight'
  | 'strokes'
  | 'shadow'
>;
export const TEXT_STYLE_KEYS = [
  'fontId',
  'size',
  'color',
  'opacity',
  'weight',
  'italic',
  'letterSpacing',
  'lineHeight',
  'strokes',
  'shadow',
] as const;

export type DecorationKind =
  | 'tail-loop'
  | 'wave-underline'
  | 'dashed-underline'
  | 'dotted-underline'
  | 'double-line'
  | 'marker'
  | 'scribble-circle'
  | 'arrow-curve'
  | 'sparkles'
  | 'hearts'
  | 'slashes'
  | 'check'
  | 'corner-brackets';
/** 字卡裝飾。width：線寬，佔文字墨跡高度的比例（星星、愛心、螢光筆不用） */
export type Decoration = {
  kind: DecorationKind;
  color: string;
  width: number;
  /** 與文字的距離，佔字高的比例（−1 ~ 3，預設 0）；螢光筆是上下位置 */
  gap?: number;
  /** 大小倍數（0.2 ~ 4，預設 1）：星星、愛心、打勾、彎箭頭 */
  scale?: number;
  /** 長度，佔預設長度（文字墨跡寬）的比例（0.2 ~ 1.5，預設 1）：底線類、螢光筆、尾端圈圈的直線段 */
  length?: number;
  /** 長度不是 1 時，線靠哪一邊（預設置中）；尾端圈圈固定從圈圈往左延伸，不用這個 */
  align?: 'start' | 'center' | 'end';
  /** 透明度 0.1 ~ 1（預設 1） */
  opacity?: number;
};
export type BoxShape =
  | 'rect'
  | 'roundRect'
  | 'pill'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'parallelogram'
  | 'trapezoid'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'cross'
  | 'snip'
  | 'heart'
  | 'cloud'
  | 'cylinder'
  | 'speech-rect'
  | 'speech-round'
  | 'speech-oval'
  | 'thought'
  | 'burst-bubble'
  | 'star4'
  | 'star5'
  | 'star6'
  | 'star8'
  | 'burst'
  | 'badge'
  | 'banner'
  | 'tag'
  | 'arrow-right'
  | 'chevron'
  | 'step'
  | 'doc';
/** 字塊（字卡的底色塊）。尺寸＝文字墨跡 + 四邊內距，所以上下左右分開調才會準 */
export type CardBox = {
  shape: BoxShape;
  fill: string;
  /** false＝不要底色，只畫框線（沒有＝要填滿） */
  fillOn?: boolean;
  opacity: number; // 填滿的透明度 0–1
  padding: { top: number; right: number; bottom: number; left: number }; // px（1080 基準）
  nudgeY: number; // 文字在字塊內的垂直微調 px
  radius?: number; // roundRect / speech-round 的圓角 px；pill 固定半圓
  stroke?: Stroke; // 字塊外框（畫在圖形邊緣）
  tailDir?: 'bottom-left' | 'bottom-right'; // 對話框尾巴方向（預設左下）
  /** 圖形調整值（凹槽深度、角的圓滑、尾巴位置…），key 見 engine/shapes.ts 的 ADJUST；沒有＝預設長相 */
  adj?: Record<string, number>;
};
export type TextCard = {
  runs: TextRun[];
  align: 'left' | 'center' | 'right';
  /** 文字區寬度 px（1080 基準），超過自動換行；沒有＝依文字長度 */
  width?: number;
  box?: CardBox;
  decorations?: Decoration[];
};
export type TextItem = ItemBase & {
  type: 'text';
  card: TextCard;
  /** 屬於哪個動態模板（標題、副標）：模板整個移動、拿掉、改長度時它們跟著 */
  group?: string;
  /** 字體輪播：開始後 until 秒內每 interval 秒換下一個字體（依序輪流），之後固定用 fonts[0] */
  fontCycle?: { fonts: string[]; interval: number; until: number };
};

export type Item = VideoItem | TextItem;

/**
 * 軌道種類：素材只能放進同種類的軌道。
 * media＝影片／照片／貼圖（原本的主軌與疊加合併）、effect＝特效（之後）、text＝字卡、audio＝音樂／音效。
 * tracks 陣列由下往上＝圖層順序，並且依種類分區排好：影像 → 特效 → 字卡 → 音訊（音訊沒有畫面，時間軸畫在最下面）。
 * 同一區裡的軌道可以自由換順序，不能跨區。
 */
export type TrackKind = 'media' | 'effect' | 'text' | 'audio';

export type Track = {
  id: string;
  kind: TrackKind;
  name: string;
  hidden: boolean;
  locked: boolean;
  muted?: boolean;
  /**
   * 版型：外框軌（frame）與各格的軌道（cell）共用同一個 group。時間軸上只畫外框那一條（代表整個版型），
   * 各格的軌道藏起來；在預覽上點格子可以個別選片段。
   */
  group?: string;
  groupRole?: 'frame' | 'cell';
  /** 格子軌道：素材放完（或這段時間沒有素材）時，格子顯示的色塊顏色 */
  fill?: 'black' | 'white';
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
  /** 自訂封面（JPEG data URL，長邊 480）；沒有＝用第一個素材的縮圖 */
  cover?: string;
  /** 最後一次新增或編輯的文字樣式；新增文字沿用它，才不會跟之前的不一樣 */
  lastTextStyle?: TextStyle;
  /** 2＝2026-11-12 起：影像軌統一、沒有主軌；舊的 1 讀進來時由 migrateProject 轉換 */
  version: 2;
};
