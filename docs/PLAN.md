# VideoClip 手機剪輯網頁：總體規劃

> 給之後實作的模型（Sonnet）讀的主文件。先讀 `CLAUDE.md`，再讀這份，再依 Phase 順序做。
> 細節規格在：`docs/TEXT_CARDS.md`（字卡、雲朵字、字塊形狀、尾端圈圈）、`docs/EFFECTS.md`（動畫、轉場、筆刷、參考影片拆解）、`docs/FONTS.md`（字體清單與來源）。
> 舊的 ffmpeg 工作流程筆記在 `docs/reference/legacy-notes/`（使用者先前整理，可參考規則，但本專案改為**純網頁、在手機瀏覽器內完成**）。

---

## 0. 一句話目標

一個**公開、免登入**的網頁 App（可加到 iPhone 主畫面），可以：
多專案管理 → 匯入多支影片/照片拼接 → 多圖層疊加（同一秒可疊多支影片、字卡、圖形、手繪）→ 豐富字卡（模板、字體、字塊、裝飾、雲朵字、逐字出現）→ 特效與轉場 → 調色 → 在影片上繪畫 → 匯出 1080×1920 MP4 → 推薦 IG 可用音源。

**每台裝置的專案彼此獨立**：分享網址給別人，別人只會看到自己裝置上的專案。

---

## 1. 使用者需求清單（全部要做，對應到 Phase）

| # | 需求 | Phase |
|---|---|---|
| R1 | 公開網址、免登入；每台裝置資料獨立，互相看不到 | P0 |
| R2 | 首頁區分不同剪輯 project（新增/改名/複製/刪除，縮圖） | P1 |
| R3 | 可匯入多支影片，主軌拼接（不只單一影片） | P1 |
| R4 | **圖層**：同一秒可疊多支影片素材；圖層可上下調整順序 | P2 |
| R5 | 字卡、icon、圖形被選取時，**右上角有一顆鈕**可拖曳縮放（含旋轉），本體可拖移位置；雙指縮放也可 | P2 |
| R6 | 修好「icon 沒有反應」：所有按鈕、貼圖在手機觸控都要有反應 | P1（全程驗收） |
| R7 | 字體選擇：**下拉式選單直接放在字卡頁籤**，選單裡每個字體用自己的字形預覽 | P3 |
| R8 | 字卡可自由調整：底色、字距、行距、寬度、字級；**字塊上下左右內距分開調**，修正「字上方色塊多、下方貼底」問題 | P3 |
| R9 | 字卡裝飾：尾端畫圈圈（照參考圖）、波浪、虛線、雲朵、對話框…；**字卡風格選單直接顯示預覽範例** | P3 |
| R10 | 更多可愛字卡模板（參考截圖：美妝清單、片中序章、運動、收藏、Vlog 標題、書法電影感） | P3 |
| R11 | 雲朵字效果（不必很蓬鬆，有那個感覺即可） | P3 |
| R12 | 字塊形狀/icon 參考 Office PPT 圖案（方塊、圓角、雲朵、對話框、星形、爆炸、緞帶、箭頭…），可當**字卡底塊** | P3 |
| R13 | 字卡出現方式（特效）：逐字出現、打字機、直接顯示、彈跳、淡入、手寫描繪… | P4 |
| R14 | 影片進出場動畫、片段之間轉場特效 | P4 |
| R15 | 在影片上**繪畫**：多種筆刷、橡皮擦、粗細、透明度、顏色；筆畫可做「逐筆描繪」動畫並與特效結合 | P5 |
| R16 | **VLOG 疊層效果**：底層完整影片 → 中層文字「V L G」→ 上層只保留人頭的影片，嵌在 O 的位置。上層用**自己描邊剪裁/橡皮擦擦掉**不要的區域（不是自動去背） | P5 |
| R17 | 調色功能（亮度、對比、飽和、色溫…＋濾鏡預設） | P4 |
| R18 | 字體：下載好看、支援繁體的免費字體（含日文字體中繁體覆蓋率高的）；首次使用自動下載清單；之後從快取讀取 | P3 |
| R19 | 佮逸體放入字庫；Zizi app 字體（饅頭黑體、中規中矩體、星光手體） | P3（見 FONTS.md 限制） |
| R20 | 首次使用就讓使用者選專案備份位置：手機檔案，或 Google 雲端（貼資料夾網址或登入後選資料夾） | P3 精靈＋P6 |
| R21 | 依影片內容推薦 IG 音源 | P7 |
| R22 | 多格影片模板：拍貼機、膠卷等，多支影片放在不同格子，可以特效方式滑過（2026-11-11 新增） | L1–L3（見 `docs/LAYOUTS.md`；動畫需要 Phase 4 物件動畫核心） |

---

## 2. 關鍵技術決策（已定案，照做）

### 2.1 部署：GitHub Pages（公開、免登入）
- 純前端靜態網站，`vite build` 後由 GitHub Actions 部署到 GitHub Pages。
- 網址預計：`https://peiyulin0520.github.io/VideoClip/`（Vite `base: '/VideoClip/'`）。
- ✅ 已定案（2026-11-11）：使用者已把 repo 改為公開，用免費 GitHub Pages。公開的只是程式碼，不是使用者的影片。
- 部署方式：repo Settings → Pages → Source 選「GitHub Actions」（Phase 0 時請使用者做這一步，並附截圖說明位置）。
- 路由用 **HashRouter**（`#/`、`#/p/<projectId>`、`#/settings`），避免 Pages 子路徑 404。

### 2.2 資料隔離與儲存（R1）
- **所有專案資料只存在該裝置的瀏覽器**：沒有後端、沒有帳號。分享網址 = 分享 App，本身不帶任何資料。
- 專案中繼資料（JSON）：IndexedDB（用 `idb` 或 Dexie）。
- 影片/圖片原檔：**OPFS**（Origin Private File System, `navigator.storage.getDirectory()`），每個專案一個資料夾 `projects/<id>/media/<assetId>.<ext>`。不要把大檔塞進 IndexedDB。
- 字體：Cache Storage（`fonts-v1`）＋ IndexedDB 記錄已下載清單；使用者自行匯入的字體存 OPFS `fonts/`。
- 啟動時呼叫 `navigator.storage.persist()`，並在設定頁顯示用量 `navigator.storage.estimate()`。
- **iPhone 重要限制**：Safari 對「沒有加入主畫面」的網站，7 天未使用可能清掉儲存資料。→ 首次使用引導「加入主畫面」（PWA），並提供 Google Drive 備份（P6）與「匯出專案 .zip」。這點要在 UI 上清楚告知。

### 2.3 技術棧
| 用途 | 選擇 | 理由 |
|---|---|---|
| 建置 | Vite + TypeScript | |
| UI | React 18 + Zustand（+ immer） | 狀態集中，方便 undo/redo |
| 合成渲染 | **PixiJS v8**（WebGL2） | 圖層、遮罩、混合模式、濾鏡、iOS Safari 可跑；不要依賴 Canvas2D `ctx.filter`（Safari 支援不穩） |
| 字卡繪製 | Canvas2D 離屏繪製 → 轉成 Pixi Texture（快取） | 字型/描邊/字塊/裝飾用 2D 畫最直接 |
| 手繪筆畫 | `perfect-freehand`（MIT） | 平滑、有粗細變化 |
| 手勢 | Pointer Events ＋ `@use-gesture/react` | 拖移、雙指縮放旋轉 |
| 解碼/編碼/封裝 | **Mediabunny**（WebCodecs；MPL-2.0） | 逐格精準解碼與 MP4 匯出；預覽用 `<video>` |
| 音訊 | Web Audio API（OfflineAudioContext 混音） | |
| PWA | `vite-plugin-pwa` | 加入主畫面、離線、快取字體 |
| UI 圖示 | `lucide-react`（ISC） | 介面按鈕 |
| 貼圖 icon | Fluent Emoji（Microsoft，MIT）、Tabler Icons（MIT）、Fluent UI System Icons（MIT） | Office 風格、可商用 |
| 測試 | Vitest（單元）、Playwright（行動裝置模擬 e2e＋截圖） | |

> 沙盒內已預裝 Chromium＋Playwright，不要再 `playwright install`。WebKit 沒裝，iPhone Safari 的行為一定要請使用者在真機上確認（列在「待真機驗證」）。

### 2.4 渲染架構（預覽與匯出共用同一套）
- `Compositor.renderFrame(project, t)`：依時間 `t` 算出所有可見圖層 → 依 z-order 由下往上畫到 Pixi stage。
- **預覽**：每個影片素材用一個 `<video>`（muted、playsinline）當 texture 來源，播放時以 `requestVideoFrameCallback` 同步；預覽解析度降為 540×960 以保順暢。
- **匯出**：不播放，逐格走時間軸：用 Mediabunny 的 `VideoSampleSink` 取得精準影格 → 畫到 stage → `new VideoFrame(canvas)` → H.264 編碼；音訊用 OfflineAudioContext 混好後 AAC 編碼 → MP4。
- 匯出規格：直式 1080×1920 / 30fps（預設）、橫式 1920×1080、方形 1080×1080；寬高偶數。
- 若裝置不支援 AudioEncoder（AAC），退路：先輸出無聲 MP4（IG 上再加音樂本來就是推薦做法，見 P7），並在 UI 說明。不要偷偷失敗。
- iPhone HDR（HLG/10-bit）素材在 canvas 中可能偏灰：先記錄為已知限制，P4 調色提供「HDR 校正」預設（提高對比/飽和）作為暫解。

### 2.5 資料模型（`src/model/types.ts`）

```ts
type Project = {
  id: string; name: string; createdAt: number; updatedAt: number;
  aspect: '9:16' | '16:9' | '1:1'; width: number; height: number; fps: number;
  assets: Asset[];          // 匯入的素材（影片/圖片/音訊/使用者字體）
  tracks: Track[];          // 由下往上排列 = 圖層順序（index 越大越上層）
  thumbnail?: string;       // dataURL，首頁顯示
  version: 1;
};

type Track = {
  id: string; kind: 'main' | 'overlay' | 'text' | 'sticker' | 'drawing' | 'adjust' | 'audio';
  name: string; hidden: boolean; locked: boolean; muted?: boolean;
  items: Item[];
};
// main：主軌，片段首尾相接，可設轉場；其他軌道：自由放置、可重疊於任何秒數

type ItemBase = {
  id: string; start: number; duration: number;      // 時間軸位置（秒）
  transform: { x: number; y: number; scale: number; rotation: number; opacity: number }; // x,y 為畫面比例 0–1（中心點）
  keyframes?: Keyframe[];                             // 位置/縮放/旋轉/透明度關鍵影格（P5 可選）
  animIn?: Anim; animOut?: Anim; animLoop?: Anim;     // 進場/出場/循環
  blend?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'add';
  mask?: Mask;                                        // 自由剪裁（R16）
  grade?: Grade;                                      // 調色（R17）
};

type VideoItem = ItemBase & { type: 'video' | 'image'; assetId: string;
  trimIn: number; speed: number; volume: number; crop?: Rect; fit: 'cover' | 'contain';
  transitionOut?: Transition; };                      // 只有主軌片段用 transitionOut
type TextItem = ItemBase & { type: 'text'; card: TextCard };     // 見 TEXT_CARDS.md
type StickerItem = ItemBase & { type: 'sticker'; source: { kind: 'shape' | 'icon' | 'emoji'; id: string }; fill?: string; stroke?: Stroke; };
type DrawingItem = ItemBase & { type: 'drawing'; strokes: BrushStroke[]; reveal: 'instant' | 'stroke-by-stroke'; revealDuration?: number }; // 見 EFFECTS.md
type AdjustItem = ItemBase & { type: 'adjust'; grade: Grade };  // 調整圖層：作用在它下方所有圖層

type Mask = {                                          // R16 自由剪裁
  shapes: Array<
    | { kind: 'lasso'; points: [number, number][] }    // 手指描邊的封閉路徑（素材座標 0–1）
    | { kind: 'ellipse' | 'rect'; x: number; y: number; w: number; h: number; rotation: number }
  >;
  eraseStrokes: BrushStroke[];                         // 橡皮擦：再擦掉的部分
  restoreStrokes: BrushStroke[];                       // 還原筆：補回的部分
  feather: number;                                     // 羽化 px
  invert: boolean;
  outline?: { color: string; width: number };         // 貼紙白邊（參考影片 8a645cc7）
  follow?: Keyframe[];                                 // 遮罩位置隨時間移動（人頭會動時手動對位）
};
```
- 所有編輯動作走 store 的 action，並寫入 undo/redo 歷史（上限 100 步）。
- 自動儲存：變更後 800ms debounce 寫入 IndexedDB。
- 專案檔要有 `version` 欄位，之後改格式要寫 migration。

---

## 3. 介面規劃（手機優先，直式）

```
┌────────────────────────┐
│ ← 專案名稱      ↶ ↷  匯出 │  頂列
├────────────────────────┤
│                        │
│      預覽畫面 9:16      │  可點選物件；選取框＋右上角縮放鈕
│                        │
├────────────────────────┤
│ ▶ 00:03.2 / 00:15.0  ⤢ │  播放列
├────────────────────────┤
│ 圖層軌道（可捲動、雙指縮放時間軸）│  上層在上、主軌在最下
│ [文字] ▭▭      ▭       │  每軌左側：眼睛(隱藏)、鎖、拖曳把手(調圖層順序)
│ [疊加] ▭▭▭▭            │
│ [主軌] ▭▭▭|▭▭▭|▭▭       │  片段間的 | 點擊＝設定轉場
├────────────────────────┤
│ 剪輯 文字 貼圖 繪畫 特效 轉場 調色 圖層 音訊 │  底部工具列（可左右滑）
└────────────────────────┘
```

- 首頁 `#/`：專案卡片網格（縮圖、名稱、長度、最後修改），右下「＋新專案」（選比例 → 選素材）。長按卡片：改名/複製/刪除/匯出 .zip。
- 選取物件時，預覽上顯示選取框：
  - **右上角圓形鈕**：拖曳 = 等比縮放＋旋轉（R5，使用者指定位置）。
  - 左上角 ✕：刪除；拖曳框內 = 移動；雙指 = 縮放旋轉。
  - 文字卡另有左右側邊把手：調整**字卡寬度**（自動換行）。
- 所有可點元素 ≥ 44×44px；預覽層 `touch-action: none`；按鈕用 `onPointerUp`/`onClick`，不要只綁 `touchstart`（R6）。
- 首次啟動流程（R18）：見 §5 Phase 3。

---

## 4. 檔案結構（建議）

```
src/
  app/            路由、Layout、首次使用引導
  model/          types.ts、defaults.ts、migrations.ts
  store/          projectStore.ts（zustand + undo）、uiStore.ts
  storage/        db.ts（IndexedDB）、opfs.ts、fontCache.ts、drive.ts（P6）、zipExport.ts
  engine/
    compositor.ts       renderFrame(project, t)
    timeline.ts         可見圖層計算、時間換算
    videoSource.ts      預覽用 <video> 池
    exporter.ts         Mediabunny 匯出
    audioMix.ts
    transitions/        每種轉場一個檔（GLSL 或 Pixi filter）
    animations/         進出場/逐字動畫
    grade/              調色 shader、濾鏡預設
  text/
    layout.ts           字卡排版（逐字座標、實際墨跡邊界）
    renderCard.ts       畫字塊、文字、描邊、裝飾 → canvas
    cloudText.ts        雲朵字
    decorations/        尾端圈圈、波浪、虛線、雲朵框、對話框…（path 產生器）
    templates/          模板 JSON（每類一檔）
  shapes/          Office 風格圖形 SVG path 產生器
  drawing/         筆刷引擎、橡皮擦、遮罩繪製
  fonts/           字體目錄 catalog.ts（名稱、來源、授權、檔案）
  music/           分析與推薦（P7）
  ui/              元件：Timeline、Preview、SelectionBox、ToolTabs、FontSelect、ColorPicker…
public/
  fonts/           自架 OFL 字體 woff2（含 OFL.txt）
  music/ig-songs.json
scripts/
  fetch-fonts.mjs   下載字體原檔到暫存資料夾（不進 git）
  build-fonts.py    fontTools 轉 woff2＋分塊、計算繁體覆蓋率
docs/
```

---

## 5. 實作階段（每個 Phase 結束都要：測試通過 → commit → push → 回報）

### Phase 0：專案骨架與部署
- Vite + React + TS + ESLint + Prettier + Vitest + Playwright 設定。
- GitHub Actions：push 到 main 時 build 並部署 Pages（`.github/workflows/deploy.yml`）；在功能分支只跑 build＋test。
- PWA manifest（名稱「VideoClip 剪輯」、圖示、`display: standalone`）。
- **驗收**：`npm run build` 成功；Playwright 以 iPhone 13 模擬開首頁截圖無錯誤。

### Phase 1：專案管理＋多影片拼接（R2、R3、R6）
- 首頁專案列表、CRUD、縮圖。
- 匯入：`<input type="file" accept="video/*,image/*" multiple>` → 複製到 OPFS → 讀 metadata（長度、尺寸、是否有音軌）→ 產生縮圖條。
- 主軌：片段依序相接；可拖曳排序、修剪頭尾（拖片段邊緣）、分割（在播放頭處）、刪除、複製、變速（0.25–4x）、音量。
- 照片素材預設 3 秒。
- 預覽播放（跨片段無縫切換：預先載入下一支 `<video>`）。
- Undo/Redo、自動儲存。
- **驗收**：e2e：建 2 個專案 → 各匯入 2 支測試影片（用 ffmpeg 產生的色條/倒數測試片，放 `tests/fixtures/`）→ 重新整理後兩專案資料都在且互不影響；所有工具列按鈕點擊都有反應（寫一支 e2e 逐一點擊並斷言有 UI 變化）。

### Phase 2：圖層系統＋選取變形（R4、R5）
- 軌道種類：疊加影片（overlay）、文字、貼圖、繪畫、調整。可新增多條軌，每條軌可在**任意秒數**放物件，同一秒可疊多支影片。
- 圖層面板（「圖層」頁籤）：列出目前播放頭位置的所有物件，拖曳改上下順序、隱藏、鎖定、混合模式、透明度。
- 疊加影片可「畫中畫」：縮放、移動、裁切、圓角、外框。
- 選取框＋右上角縮放旋轉鈕＋雙指手勢；吸附（中心線、安全區）。
- 平台安全區參考線（底部約 250px、右側約 150px 半透明顯示，可關）。
- **驗收**：同一秒疊 3 支影片＋1 個字卡，改變順序後預覽正確；匯出的單格截圖（用 exporter 的 `renderFrame` 輸出 PNG）與預覽一致。

### Phase 3：字卡系統＋字體＋圖形（R7–R12、R18、R19）—— 最大的一塊
規格全部在 `docs/TEXT_CARDS.md` 與 `docs/FONTS.md`。重點：
1. 字卡排版引擎：**用實際墨跡邊界（`measureText().actualBoundingBoxAscent/Descent`）置中**，修正 CJK 字型上方空太多、下方貼底的問題；字塊內距上/下/左/右分開調，另有「垂直微調」。
2. 字卡頁籤 UI：文字輸入 → **字體下拉選單**（每項用該字體渲染名稱＋「範例字」）→ 字級、顏色、字距、行距、寬度、對齊、粗體（描邊模擬）、斜體、描邊、陰影、發光 → 字塊（形狀、顏色、透明度、內距、圓角）→ 裝飾 → 動畫。
3. 風格/模板選單是**縮圖格**，每格是即時渲染的範例（不是文字名稱）。
4. Office 風格圖形庫（可當貼圖，也可當字卡底塊）。
5. 雲朵字。
6. 字體：首次使用引導下載字體包；字體快取；匯入自己的字體檔（.ttf/.otf/.woff2）。
- **首次使用流程**（引導精靈，3 步）：開 App 時若 IndexedDB 沒有 `appState`：
  1. 「第一次在這台裝置使用嗎？」
     - 「是」→ 進入第 2 步。
     - 「不是，我換了裝置/清過資料」→「從 Google 雲端還原」（登入後選資料夾，見 Phase 6）/「從手機檔案匯入備份 .zip」/「略過」。
  2. **選擇專案備份位置**（使用者的需求：一開始就給選項；之後可在設定頁改）：
     - 「存在手機檔案」：專案平常存在瀏覽器內；備份時匯出 `.zip`，透過分享選單「儲存到檔案」（iPhone 可選「我的 iPhone」或 iCloud Drive）。
     - 「存到 Google 雲端」：可先貼上 Drive 資料夾網址（選填）→「用 Google 登入」→ Google 資料夾選擇器直接開在那個資料夾（沒貼網址就從「我的雲端硬碟」開始）→ 確認 → 之後自動備份。詳見 Phase 6。
     - 「先不要備份」：只存在瀏覽器（提示：iPhone 未加入主畫面可能被清掉）。
     - Phase 6 完成前，「存到 Google 雲端」顯示為「即將推出」，選了先當成「存在手機檔案」。
  3. 下載字體：顯示建議字體清單（勾選、每款大小、總大小，預設勾選「基本包」）→ 下載到 Cache Storage，顯示進度。
  - 之後開啟：直接從快取讀字體，不再詢問；設定頁可「管理字體」（增刪、重新下載）與「備份位置」（切換、重新選資料夾、登出）。
  - 若本機已有資料就**不詢問**（同一台裝置自然就是「不是初次」）。
- **驗收**：每個模板截圖存到 `docs/screenshots/templates/`（給使用者審核）；尾端圈圈截圖與 `docs/reference/tail-loop-underline.jpg` 並排對照；繁體覆蓋率報告 `docs/font-coverage.md`。

### Phase 4：動畫、轉場、調色（R13、R14、R17）
規格在 `docs/EFFECTS.md`。
- 字卡進場/出場/循環動畫（含逐字、打字機、手寫描繪、彈跳…）。
- 片段進出場動畫、主軌轉場（含筆刷擦除、愛心/星形擦除等可愛款）。
- 畫面特效（顆粒、暗角、色差故障、閃白、手震、光暈、VHS…）作為「特效軌」物件，可放在任意時間範圍。
- 調色：每個片段可調，或用「調整圖層」作用於下方所有圖層；濾鏡預設 12 款以上。
- **驗收**：每種動畫/轉場輸出 GIF 或關鍵 3 格對照圖到 `docs/screenshots/effects/`。

### Phase 5：繪畫＋自由剪裁遮罩（R15、R16）
- 繪畫模式：筆刷列（見 EFFECTS.md）、顏色、粗細、透明度、平滑度；橡皮擦（擦筆畫）、復原；筆畫可設「逐筆描繪」動畫。
- 剪裁模式（對影片/圖片物件）：套索描邊、圓形/方形選取、橡皮擦擦掉、還原筆補回、羽化、反轉、白邊描邊；遮罩可設關鍵影格跟著人頭移動。
- **VLOG 模板（一鍵建立）**：
  1. 底層：使用者選的完整影片（主軌）。
  2. 中層：文字物件「V」「L」「G」三個（或一個「V L G」字串留出 O 的空間），大字、可換字體。
  3. 上層：同一支影片（或另一支）複製一份到疊加軌，預設套用圓形遮罩，提示使用者「描出人頭範圍」，並放到 O 的位置。
  4. 上層可單獨縮放、移動，中層字放在不會被遮擋之處，只讓 O 被頭取代。
- **驗收**：用測試影片做出 VLOG 疊層，輸出 3 個時間點截圖；遮罩與白邊正確。

### Phase 6：備份位置（手機檔案 / Google 雲端）（R20）
使用者在首次使用精靈（見 Phase 3）或設定頁選擇備份位置。**每個人選自己的**：別人用同一網址選雲端，是登入他自己的 Google 帳號、存到他自己的資料夾。

**A. 存在手機檔案**
- 「備份」按鈕 → 產生 `.zip`（`project.json`＋縮圖＋可選原始影片）→ `navigator.share({ files })` 開分享選單 →「儲存到檔案」；不支援分享時改成下載。
- iPhone Safari **不能**讓網頁自動寫入「檔案」App 的資料夾（不支援 File System Access API），所以每次備份都要按一下確認；App 在專案有變更且超過 N 天沒備份時提醒。
- 桌機 Chrome/Edge 支援 `showDirectoryPicker()`：可選一個資料夾後自動備份（有支援才顯示）。
- 還原：選 `.zip` 匯入。

**B. 存到 Google 雲端**
- 用 Google Identity Services（OAuth 2.0 token flow，純前端）＋ Drive API v3 ＋ Google Picker，scope 只用 `drive.file`（只能存取 App 自己建立或使用者在選擇器裡選的檔案，不會看到使用者其他檔案）。
- 流程：
  1.（選填）貼上 Drive 資料夾網址 → 解析出資料夾 ID（支援 `drive.google.com/drive/folders/<id>`、`…/u/0/folders/<id>?usp=sharing` 等格式）。
  2. 「用 Google 登入」→ 授權。
  3. 開 Google Picker（資料夾模式）：有貼網址就用 `DocsView.setParent(<id>)` 直接開在那個資料夾，讓使用者確認；沒貼就從「我的雲端硬碟」開始選。
  4. App 在選定資料夾內建立 `VideoClip/`：`projects/<id>/project.json`、`projects/<id>/thumb.jpg`、`projects/<id>/media/*`（原始影片預設**不**上傳，因為很大；設定可開）、`fonts/`（使用者匯入的個人字體）。
  5. 之後自動備份：專案變更後 30 秒 debounce 上傳 `project.json`；影片在 Wi-Fi 下才上傳（可設定）。
  6. 換裝置：首次使用選「不是初次」→ 登入 → 選同一個資料夾 → 列出雲端上的專案 → 選要還原的；個人字體自動下載。
- 只有資料夾網址、不登入**不能寫入**：Google 不允許未登入的程式寫入 Drive，即使資料夾開放「知道連結的人可以編輯」也一樣。UI 要說明這點。
- 備份資料夾**不要**設成公開分享（否則別人能看到影片）；App 偵測到資料夾是公開時顯示警告。
- 登入權杖只放在記憶體／sessionStorage，過期時再請使用者點一次登入（純前端的 token flow 沒有長期 refresh token）。
- 使用者原本指定的資料夾：`https://drive.google.com/drive/folders/1fLGtxMS4oRFIOqpyn-jnBtifCRCclF2l`（只是使用者自己的預設，不要寫死在程式裡給所有人用）。
- 功能：備份目前專案、全部備份、從雲端還原、雲端上的個人字體同步、切換資料夾、登出。
- **需要使用者先做（Sonnet 要用中文一步步帶）**：建立 Google Cloud 專案（免費、不需綁信用卡）→ 啟用 Drive API 與 Picker API → 設定 OAuth 同意畫面（App 名稱、使用者的聯絡信箱、scope 只加 `drive.file`）→ 建立 OAuth Client ID（網頁應用程式，授權來源 `https://peiyulin0520.github.io`）→ 建立 API key（限制在 Drive/Picker API 與該網域）→ 記下專案編號（Picker 的 App ID）。Client ID、API key、App ID 都是公開值，可寫進前端設定檔。
- 同意畫面先用「測試」模式（只有加入的測試使用者能登入，上限 100 人）；要讓任何人都能登入再改「正式版」。`drive.file` 屬於非敏感 scope，通常不需要 Google 的完整審查，但發布時 Google 可能要求品牌資訊（隱私權政策網址等）：Sonnet 要在 repo 準備一頁 `privacy.html`，並以申請當下 Google 的實際要求為準，不要先說成一定不用審查。
- **驗收**：實際授權需要使用者在真機操作；Sonnet 寫好 mock 測試，真機測試列入待驗證。

### Phase 7：IG 音源推薦（R21）
- **事實先講清楚**：Instagram 沒有公開的音樂庫 API，也無法從網頁直接把音樂加入 IG。可做的是「推薦歌名＋搜尋關鍵字」，使用者發 Reels 時在 IG 內搜尋加入（這樣也才有授權）。商業帳號只能用 Meta 授權音效庫，曲庫依地區不同。
- 分析（全部在裝置上做）：總長度、剪接頻率（每秒幾刀）、畫面亮度/飽和/冷暖、動態量（相鄰影格差異）、字卡文字內容、使用者選的主題標籤（vlog/美食/旅行/運動/美妝/日常/可愛…）→ 得出情緒標籤與建議 BPM 範圍。
- 推薦來源 A（預設，離線）：`public/music/ig-songs.json` 精選曲目表（歌名、歌手、語言、情緒標籤、BPM、適合主題、備註）。Sonnet 先建 60 首左右常見於 Reels 的歌曲作為初版，並標註「需定期更新」；推薦依標籤與 BPM 打分。
- 推薦來源 B（選用，AI）：使用者在設定頁填入**自己的** Claude API key（只存在該裝置），同意後把 6 張縮小的關鍵影格（≤512px JPEG）＋分析 JSON 送到 Claude API，回傳 10 首推薦與 IG 搜尋關鍵字。
  - 用官方 `@anthropic-ai/sdk`，瀏覽器端需設 `dangerouslyAllowBrowser: true`；圖片用 base64 `image` content block；用 structured outputs（`output_config.format`）拿 JSON；model 預設 `claude-opus-5-5`（設定頁可改）。實作前先讀 claude-api skill。
  - 送出前清楚提示「影格會上傳到 Anthropic」，預設關閉；影片有家人小孩臉時要使用者明確同意。
- UI：匯出頁下方「推薦音樂」卡片：歌名、歌手、為什麼適合、「複製歌名」按鈕、建議從第幾秒切入（若有）。
- **驗收**：給 3 種不同測試專案（快節奏/慢節奏/暖色），推薦結果不同且合理。

---

## 6. 測試策略
- Vitest：排版引擎（墨跡邊界置中）、時間軸計算、遮罩幾何、轉場插值、推薦打分。
- Playwright（Chromium＋iPhone 13 裝置描述）：主要流程 e2e；**每個字卡模板、每種轉場的截圖**存檔給使用者審核（使用者只負責審核，見 legacy-notes 的溝通規則）。
- 測試素材：用 ffmpeg 產生（`testsrc2`、色塊、倒數數字），**不要用真人素材**。
- 每次回報時誠實區分：✅ 已驗證（附截圖）／🟡 寫好但只在 Chromium 驗證／🔴 做不到。

## 7. 待真機驗證清單（Sonnet 無法在沙盒驗證，要請使用者在 iPhone 上試）
- [ ] iOS Safari：OPFS 寫入大檔、`storage.persist()`、加入主畫面後資料保留
- [ ] WebCodecs H.264 編碼與 AAC 音訊編碼（feedback-4 B 已實作，Chromium 驗證；iPhone 待真機：H.264／AAC 能不能編、1 分鐘影片匯出要多久會不會被系統中斷、相簿存得進去）
- [ ] HDR 素材顏色
- [ ] 觸控手勢（右上角縮放鈕、雙指、時間軸捲動與拖曳不衝突）
- [ ] 大型 CJK 字體在手機上的載入速度與記憶體
- [ ] Google Drive 授權與上傳
- [ ] （Phase 1）iPhone 匯入照片圖庫的 .mov（HEVC）與 .heic：能不能讀長度、縮圖、播放
- [ ] （Phase 1）OPFS 寫入大檔（>500MB）；沒有 createWritable 時退回 IndexedDB 是否可用
- [ ] （Phase 1）預覽跨片段播放時聲音不中斷（第二個 <video> 的解鎖）
- [ ] （feedback-4 A）**手機開著靜音模式**，播放有聲音的影片也要有聲音（像 YouTube／IG）；音量滑桿在 iPhone 有作用（新版 iOS 走 Web Audio＋`audioSession.type='playback'`；舊版 iOS 只能開／關）；第一次按播放有聲音、跨片段／疊加影片聲音不中斷；若出現「iPhone 擋住了聲音，請再按一次播放」，回報是哪一種情況
- [ ] （feedback-4 A）播放比以前順暢（影片直接當 GPU 貼圖、編輯器不再每格重畫）：1080p／4K HEVC 影片、主軌＋疊加同時播放時有沒有卡、時間軸跟著捲動順不順
- [ ] （feedback-5 ①）**設定頁打開「顯示播放效能」**，錄一段播放：每秒幾格、影片上傳花幾毫秒、影片資訊（尺寸／編碼／HDR／預覽檔狀態）；大的 iPhone 影片匯入後時間軸片段顯示「預覽檔製作中 xx%」，做好後播放是否明顯變順（目標 ≥ 24 fps）；8 秒影片多久做好；做不出來（failed）時是否仍能播放
- [ ] （feedback-5 ②，2026-11-12 改）影像軌左把手往右拉：尾巴不動、前面留空位；往左拉回來還原；右把手拉得回原長；剪輯分頁「修剪」面板：把手好不好抓、預覽有跟著顯示、「前面多／少 1 秒」；空位的虛線框點兩下補齊；「刪除」只刪一段、「刪除並補齊」
- [ ] （feedback-5 ③）按住時間軸左邊的軌道圖示上下拖換圖層順序：好不好拖、會不會誤觸開選單、頁面有沒有跟著捲
- [ ] （feedback-5 ④）字塊「填滿」「框線」分開：關填滿只留框線、各自透明度、框線粗細
- [ ] （feedback-5 ⑤）剪輯分頁「裁切」：預覽上拖四邊細條／四角／框內平移好不好抓（手指會不會擋住）；切完留下的畫面位置不跳；比例 1:1／9:16／4:5／16:9；「自由形狀」手指畫一圈；預覽上的「重設／取消／完成」；iPhone 上整頁會不會被拖動誤捲
- [ ] （feedback-5 ⑥）GIPHY 貼圖加進專案後會動（動態 WebP；iOS 沒有 `ImageDecoder` 時改走 GIF＋備用解碼器）：iPhone 上有沒有動、多個貼圖同時動順不順、拖時間軸暫停時有沒有定在對的格；我的貼圖上傳 GIF 會動
- [ ] （feedback-4 B）頂列「匯出影片」：1080p／720p、30／60 fps、標準／高；進度與剩餘時間；取消；完成後「儲存到相簿／分享」會跳出 iPhone 分享面板並能「儲存影片」；匯出的 MP4 在相簿與 Instagram 能播放、有聲音、畫面和預覽一樣（字卡、貼圖、疊加、裁切）；匯出中切到別的 App 或鎖螢幕會怎樣；iPhone 編不出 AAC 時有沒有明講「沒有聲音」
- [ ] （feedback-4 C）疊加分頁「加入背景音樂」：從 iPhone「檔案」App 選 mp3／m4a／wav 能不能選到、匯入、顯示波形；預覽播放時音樂有沒有聲音（手機靜音模式下也要有）、跟影片同步；音量 0–200%、淡入淡出聽得出來；「全部影片靜音」；匯出的影片裡音樂位置、音量、淡入淡出對不對
- [ ] （主題）設定頁「介面主題」暗黑／黑白／清新／溫暖：在 iPhone 上每個頁面（首頁、編輯器、設定、各種面板、彈窗）文字看得清楚、按鈕看得出來、打開 App 不會先閃一下暗色；手機狀態列顏色跟著；加到主畫面後的狀態列
- [ ] （版型）疊加分頁「版型」8 種：從相簿選照片／影片放進格子；外框顏色；預覽與匯出的樣子；點時間軸的格子個別調整、「裁切」換露出的範圍；「移除版型」；同時 5 支以上影片會不會卡；長相需要使用者看過、提出要改的地方
- [ ] （Phase 1）時間軸：捲動＝移動播放頭、雙指縮放、長按拖曳排序、修剪把手是否好點、不會誤觸頁面捲動
- [ ] （Phase 3B）字體包下載（基本包約 22 MB）在 iPhone 的速度；Cache Storage 的配額與是否被清掉；載入 3–6 MB 的字體後預覽會不會卡
- [ ] （Phase 3B）首次使用精靈在 iPhone Safari 與「加入主畫面」後的流程；字體選單捲動是否順
- [ ] （Phase 3B）從「檔案」App（含 iCloud、Google Drive）選字體檔匯入
- [ ] （Phase 2）多個影片同時播放（主軌＋2–3 個疊加）：畫面與聲音是否順、會不會有影片黑掉（iOS 同時解碼數量限制）
- [ ] （Phase 2）預覽上雙指縮放/旋轉選取的物件、右上角縮放鈕好不好按、拖移時吸附會不會太黏
- [ ] （Phase 2）混合模式（色彩加深、濾色、覆蓋、加亮）與圓角、外框在 iPhone 上的顯示
- [ ] （Phase 2）預覽畫面大小是否夠用（底部面板展開時）
- [ ] （Phase 1）重新整理／關掉 Safari 再開，專案與素材還在（含加入主畫面後）
- [ ] 匯出 1 分鐘影片的時間與是否當掉
- [ ] （修正 A）安全區參考線預設看不到；拖移文字/貼圖時才出現，看得懂「IG／抖音按鈕區」；「安全區」按鈕好按
- [ ] （修正 B）匯入影片後預覽沒有白框和 ✕；點預覽空白處不會選到主軌；從時間軸點主軌片段才出現細框
- [ ] （修正 C）iPhone 匯入影片後時間軸有縮圖（Mediabunny/WebCodecs）；沒有的話是否先顯示檔名、播放後自動補上縮圖
- [ ] （GIPHY）在設定頁貼上真的 key 後，熱門／搜尋貼圖出現、點了加到畫面（圖片下載是否被 CORS 擋）
- [ ] （我的貼圖）從相簿上傳 HEIC／PNG 存成我的貼圖，換專案還在
- [ ] （回報 3）網站更新後，iPhone 打開或切回分頁時自動換成新版（設定頁版本號會變）
- [ ] （預覽優先版面）預覽空白處上下滑能捲頁面、按在文字上拖是移動文字；雙指在預覽上縮放旋轉不會變成整頁縮放；滑桿水平拖和時間軸水平滑不會變成捲頁面；Safari 網址列伸縮時預覽不抖
- [ ] （回報 2-①）iPhone 匯入大的 4K HEVC 影片（例如 1 分鐘以上、>150MB）成功，重新整理後還在；失敗時錯誤訊息有寫是哪一步
- [ ] （回報 2-②）文字分頁打開時預覽夠大、四角小點縮放與旋轉點好不好按
- [ ] （feedback-4 E）「自訂顏色」跳出彈窗：手指在大方塊上拖拉選色順不順（頁面不會跟著捲）、色相條、R/G/B 滑桿與 −／＋ 好不好按、原本／新的預覽、取消／確定；彈窗在 iPhone 上沒有被瀏覽器工具列切到
- [ ] （feedback-4 E）裝飾的長度、透明度、靠左／置中／靠右、放大後的範圍（粗細 60%、距離 −100%～300%、大小 400%）在 iPhone 上好調
- [x] （回報 2-③，已被 feedback-4 E 取代）iPhone 系統取色盤——改成自己的彈窗，不再使用系統取色盤
- [ ] （修正 D）iPhone 直拍影片（.mov）匯入後，「自動比例」選到 9:16 而不是 16:9（旋轉資訊是否被讀到）

## 8. 使用者要先決定/準備的事
1. ✅ 已決定：repo 已公開，用 GitHub Pages。
2. Google Cloud OAuth Client ID / API key（P6 再做，Sonnet 會帶步驟；只有「存到 Google 雲端」需要，「存在手機檔案」不需要）。
3. 字體清單已整理在 `fonts/manifest.json`。沒有下載網址的 6 款（佮逸體、LINE Seed TW、中規中矩體、星光小熊貓幼兒體、字言字型手繪體、致一宋體）請在 Phase 3 開始時上傳到 Sonnet 的對話（詳見 FONTS.md §4）。
4. Sonnet 工作環境的網路需允許：`raw.githubusercontent.com`、`registry.npmjs.org`（已可用）；若要從 GitHub Release 下載字體還需 `github.com`、`objects.githubusercontent.com`；從 Drive 下載需 `drive.google.com`、`drive.usercontent.google.com`。
- [ ] （feedback-6 F1）溫暖主題：米色底、磚紅重點、襯線標題像不像參考圖；清新、溫暖、黑白下時間軸字卡／音樂片段的字都看得清楚
- [ ] （feedback-6 F2）預覽上往上滑捲頁面時會不會誤選；點一下影片就選到、選好之後雙指縮放（手指放影片旁邊 40px 內）；疊兩層時再點一次換下面那層；「圖層」清單；大影片被選取後整個預覽不能捲（要從預覽以外的地方捲）是否可接受
- [ ] （feedback-6 F3）7 個分頁在 iPhone 上的寬度、分頁列可左右滑；選了字卡／音樂自動切分頁
- [ ] （feedback-6 F4）打開以前做的專案（有主軌、疊加、字卡、音樂、版型）：軌道名稱變「影像 N」、片段位置與畫面跟以前一樣、字卡順序提醒；影像軌上下換、刪除並補齊、空位虛線框
- [ ] （feedback-6 F5）時間軸長按 400ms 的手感、會不會跟 iOS 的長按選字／放大鏡衝突；拖到別條影像軌、「＋ 新增一軌」放置區、拖到字卡軌會彈回；拖很遠的時間要先縮小時間軸（沒有邊緣自動捲動）
- [ ] （feedback-7 G1）文字透明度滑桿；「套用這個樣式到所有文字」；字塊／圖形預設透明＋棕色框線；專案封面（首頁「更換封面」、編輯器「用目前預覽畫面當封面」）
- [ ] （feedback-7 G2）時間軸預設收合、「圖層」鈕展開；連點兩下片段命名（iPhone 的連點判斷 400ms）；軌道改名
- [ ] （feedback-7 G3）音訊分頁列出所有聲音、「分離原音」；修剪面板上方旗標（拖旗標的手感、多段、旁邊小畫面有沒有畫面）
- [ ] （feedback-7 G4）版型整組縮放移動（雙指）、第一下選整個版型再點一下選格子、每格選片段、素材放完顯示反黑／反白、捲動／滑入滑出動畫的順暢度；舊專案的版型打開後外框是否變成可整體移動
- [ ] （feedback-7 G5）特效分頁、時間軸轉場小圓圈（點得到嗎）、七種轉場的觀感（尤其推／升中間一瞬間是黑的是否可接受）
- [ ] （feedback-7 G6）動態模板「三格故事」：同時 4 支影片解碼的順暢度、字體輪播（要先下載那幾套字體：noto-serif-tc、noto-sans-tc、jason-handwriting-1、jf-openhuninn、chocolate-classical）、結尾閃光
- [ ] （feedback-8 H1）舊專案打開後，以前刪外框留下的孤兒格子是否變回普通影像軌；版型「位置、大小、旋轉歸位」；GIPHY 往下滑載入更多
- [ ] （feedback-8 H3）設定頁「預覽畫質」：流暢模式在 iPhone 實際順多少；自動切換的門檻（同時 3 支影片／連續 3 秒 <20 格）；影片池滿了改畫縮圖的觀感；修剪面板拖旗標的縮圖流暢度
- [ ] （feedback-8 H4）音訊修剪：旗標手感、波形、多段、試聽
- [ ] （feedback-8 H5）長按軌道圖示 500ms 進多選的手感（會不會跟 iOS 長按衝突）、上移／下移／整併／刪除
- [ ] （feedback-8 H6）轉場：A、B 重疊時兩支影片同時解碼的順暢度；32 種轉場觀感；選單卡片的小動畫（同時 8 張在動會不會卡）；模糊／故障的效能

