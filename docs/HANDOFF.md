# 交接手冊（HANDOFF）

給接手的 AI／工程師。先讀 `AGENTS.md`（規則）和 `docs/PROGRESS.md`（目前狀態），這份補上「為什麼這樣做」和「程式在哪裡」。
**接手時可以直接對 ChatGPT 等說：**
> 請先讀 repo 根目錄的 AGENTS.md，再讀 docs/PROGRESS.md 最上面的「交接快照」和 docs/HANDOFF.md，然後從「下一步」繼續。每做完一步都要照 AGENTS.md 的「紀錄規則」更新紀錄、commit 並 push。

## 1. 使用者與合作方式
- 繁體中文（台灣）使用者，用 iPhone Safari／加入主畫面。**不寫程式，只審核**：看截圖、在手機上實測後回報。
- 偏好：回覆短、白話、一次一件事；結尾給 A/B/C 選項讓他一個字決定；要看得到的東西（截圖、對照圖）。
- 非商業使用、不改版字體；資源盡量用免費開源。
- 他要的是「像剪映／CapCut 那種手機剪輯」＋可愛多樣的字卡。參考素材（別人的作品，只參考效果、不放進 repo）在原始對話裡：字卡模板截圖、雲朵字、Vlog 標題、書法電影感標題、4 段示範錄影（轉場、手繪塗鴉、摳像貼紙、逐筆寫字）。拆解結果在 `docs/EFFECTS.md §8`、模板整理在 `docs/TEXT_CARDS.md §6`。
- 他曾回報過「icon 沒有反應」→ 所有按鈕都要有 e2e 點擊測試。

## 2. 使用者原始需求（完整清單在 `docs/PLAN.md §1`，R1–R21）與後續決定（時間順序）
1. 公開網址、免登入、**每台裝置的專案互相看不到**（做法：沒有後端，資料全在裝置）。→ GitHub Pages，repo 已公開（使用者自己改的）。
2. 多專案、多影片拼接、**多圖層（同一秒可疊多支影片）**、字卡/icon 右上角縮放鈕、字體下拉選單放字卡分頁、字塊內距可調、尾端圈圈（照參考圖）、雲朵字（不必蓬鬆）、Office 圖形當字塊、繪畫＋筆刷＋橡皮擦、字卡出現方式（逐字等）、轉場特效、調色（做在 App 裡）、IG 音源推薦。
3. **VLOG 人頭 O 效果**：底層完整影片 → 中層文字 V L G → 上層同一支影片只留人頭（使用者**自己用套索描邊/橡皮擦剪**，不是自動去背）。
4. 字體：下載好看且支援繁體的免費字體；Zizi app 的（饅頭黑體、中規中矩體、星光手體、一致宋體）；佮逸體；日文字體也行。**首次使用自動下載清單，之後從快取讀**。
5. 雲端：使用者給了 Drive 資料夾 `1fLGtxMS4oRFIOqpyn-jnBtifCRCclF2l`。我們說明：公開連結可讀字體（要 API key）、不登入無法寫入、專案備份資料夾要保持私人。→ **決定**：首次使用就讓每個人選備份位置（手機檔案／Google 雲端〔可貼資料夾網址或登入後選〕／先不要）。備份功能本身排在 Phase 6。
6. 使用者上傳字體清單 JSON 與字體檔，並說明它們都是開源、非商業。→ 我們仍讀字型檔授權：3 款不放進網站（見 FONTS.md）。
7. 使用者找到 max32002/pop-gothic（含注音）→ 已加入。問能否下載到手機「檔案」App → 網頁做不到，改用「匯入字體檔」。
8. **使用者要求每次進度都記錄成檔案，方便換 ChatGPT 等接手** → 本文件與 AGENTS.md 的「紀錄規則」。

## 3. 架構地圖

```
src/
  model/types.ts, defaults.ts     資料模型（Project / Track / Item …）與建立函式
  engine/
    timeline.ts                   純函式：所有軌道自由放置（不重疊）的 split/trim/speed/move、軌道分區（ZONE、normalizeZones、insertIndexFor、reorderTrack 夾在同區）、rippleDelete、dropTarget／moveItemToTrack（長按拖到別軌）、visibleLayers/layersAt
    geometry.ts                   itemBox（物件在畫面的方框）、hit-test、吸附（中心線/邊緣/平台安全區）
    scene.ts                      buildScene：專案＋時間 t → 要畫的圖層清單（預覽與匯出共用）
    compositor.ts                 PixiJS 合成器（每個影片/照片圖層用 canvas 暫存畫面 → CanvasSource；遮罩圓角、外框、混合模式）
    player.ts / mediaPool.ts      預覽播放：時鐘驅動、<video> 池（6 個）、下一個/1 秒內的素材預載
    exportFrame.ts                單格輸出（輸出解析度 PNG）；之後整支匯出沿用 buildScene+Compositor
    textRender.ts                 字卡畫成 canvas（目前是最小版，Phase 3A 要換成完整排版）
    probe.ts / importMedia.ts / assetUrls.ts   匯入、讀影片資訊（Mediabunny）、縮圖、object URL
    debug.ts                      window.__videoclip（vc-debug=1 才有）
  store/
    projectStore.ts               目前專案＋復原/重做（immer，上限 100，coalesce 合併拖曳）＋ setMainItems/setTrackItems
    actions.ts                    編輯動作（任何軌道的物件：改、刪、分割、複製、加疊加/文字、軌道操作…）
    autosave.ts                   變更後 800ms 存檔；離開/切背景立刻存
    appStore.ts / uiStore.ts      精靈與備份設定／toast、busy、目前 player
  storage/
    db.ts                         IndexedDB 'videoclip' v2：projects, blobs, meta, userFonts
    media.ts                      素材檔：OPFS（projects/<id>/media/<assetId>），不支援就退回 IndexedDB blobs
    projects.ts                   專案 CRUD；**寫入排隊、讀取等寫入完成**（修過首頁讀到舊資料的 bug）
    appState.ts                   appState（onboarded、備份模式、Drive 網址解析）
  fonts/                          catalog（讀 catalog.generated.json）、fontStore（下載/快取/載入/匯入）、sfnt（讀字體名稱）
  app/
    App.tsx（HashRouter）, Welcome.tsx（首次使用精靈）, pages/{Home,Editor,Settings}.tsx
    editor/{Preview,Timeline,Toolbar}.tsx   預覽（canvas＋選取框＋手勢）、多軌時間軸、底部分頁（剪輯/疊加/文字/圖層）
    fonts/{FontSelect,usePackInstall}
scripts/   fetch-fonts.mjs, build-fonts.py, make-icons.py
fonts/     manifest.json（字體主清單）, OFL-1.1.txt
public/fonts/<key>/   成品（woff2、授權檔、preview）— 已 commit
e2e/       helpers.ts（含 debug hook 的包裝）、phase1/phase2/phase3b 規格
tests/fixtures/   ffmpeg 產生的測試素材（WebM；純色影片用來取樣驗證圖層順序）、mini-font.ttf
docs/      PLAN / TEXT_CARDS / EFFECTS / FONTS / PROGRESS / HANDOFF / font-coverage / screenshots/phase* / reference/
```

### 資料流
`Project`（Zustand + immer，可復原）→ `visibleLayers(project, t)`（軌道順序＝圖層由下到上；每一軌只在 [start, end) 顯示，最後一格仍顯示最後結束的物件）→ `buildScene`（算每層的方框、透明度、混合、圓角、外框、裁切；字卡用 `renderText`）→ `Compositor.render`（Pixi）→ canvas。
`Player` 管時鐘與 `<video>`：每格 render 時替「正在顯示」的影片物件找一個 `<video>`（沿用同一個元素，不重設 src）、同步時間/速度/音量，預載即將出現的素材。
單格匯出：`exportFrame.renderFrame` 另開 Compositor（輸出解析度）、用獨立 `<video>` 精準 seek，**與預覽用同一套 buildScene**，e2e 驗證兩者在取樣點顏色一致。

### 座標與單位
- `transform.x/y`：物件中心，佔畫面寬/高的比例（0–1）；`scale`：乘上「填滿(cover)/完整(contain)」算出的基本大小；`rotation`：度，順時針。
- 專案座標＝專案解析度（9:16 為 1080×1920）；預覽 canvas 長邊 960。字卡字級以 1080 寬為基準，畫的時候乘 `canvasW/1080`。
- 圖層順序＝`project.tracks` 陣列順序，並且**依種類分區**：影像（media）→ 特效（effect）→ 字卡（text）→ 音訊（audio），同一區可以自由換順序、不能跨區（2026-11-12 起沒有「主軌」，主軌與疊加合併成影像軌；`Project.version` 2，舊的 v1 讀進來時 `migrateProject` 轉換）。素材只能放進同種類的軌道（`trackKindOf`）。同一條軌的物件不能重疊（`findFreeStart`）。時間軸上音訊區畫在最下面（只是顯示順序，陣列裡 audio 在最後）。

### 儲存位置
IndexedDB `videoclip`（專案 JSON、`meta.appState`、`meta.installedFonts`、`userFonts`）；OPFS（素材原檔）；Cache Storage `vc-fonts-v1`（官方字體）；localStorage 只放小旗標（安全區開關、iOS 提示已關閉、測試旗標）。

## 4. 決策與原因
| 決策 | 原因 |
|---|---|
| 純前端、無後端，資料在裝置 | 使用者要求「不同裝置互相看不到專案」「免登入」；也避免上傳影片的隱私問題 |
| GitHub Pages ＋ HashRouter | 免費、使用者已公開 repo；子路徑 `/VideoClip/` 用 `#/` 路由才不會 404 |
| PixiJS 合成（不是 Canvas2D filter 或 DOM 疊 video） | 預覽與匯出要同一套；Safari 的 Canvas2D `ctx.filter` 不可靠；之後調色/轉場/遮罩都要 shader |
| 影片/照片圖層先畫進固定大小的暫存 canvas 再當貼圖 | 避開 Pixi VideoSource 會自己 play/load 的副作用；裁切、圓角用同一條路；縮放手勢不會一直重建貼圖 |
| 字體裁切成繁體常用字集 woff2 | 單檔 10–30 MB 太大；Big5 5401＋7652 字夠用；之後可補 `unicode-range` 第二檔放罕用字 |
| 官方字體存 Cache Storage、使用者字體存 IndexedDB | iPhone 網頁不能自動寫「檔案」App；瀏覽器儲存較可靠 |
| 儲存層「寫入排隊、讀取等寫入」 | 離開編輯器的存檔可能比首頁讀取晚，會顯示舊資料 |
| 最小版文字（Phase 2）先做 | 只為了驗收「3 影片＋1 字卡」；完整字卡引擎是 Phase 3A |
| 不放進網站的 3 款字體 | 授權：All rights reserved／禁止散布／無授權說明（見 FONTS.md） |
| TypeScript 5.9 | typescript-eslint 不支援 ≥ 6.1 |
| 新專案比例預設「自動：跟主軌第一個素材」，編輯器頂列可隨時改（可復原）；比例多加 3:4、4:3 | 使用者 2026-11-11 選 A；位置/大小本來就是「佔畫面比例」，改比例不用搬資料 |
| （2026-11-11 使用者更正）整頁往下捲：預覽在最上面、大小永遠不變，往下滑是時間軸／分頁／設定，往上滑回來看預覽；選取框只留框線、雙指縮放旋轉（取代四角點／旋轉點／時間軸精簡） | 使用者：「頁面可以整體往下滑新增功能，但往上滑可以看到不會縮小的預覽畫面」「選取框一率不需要小圓點」 |
| GIPHY key 只存在使用者手機的 localStorage，絕不進 repo；搜尋結果不存 | repo 公開；使用者要求 |
| 我的素材庫（IndexedDB `library`）：自己上傳的貼圖跨專案共用 | 使用者要求；之後畫好的圖也放這裡 |
| 貼圖＝Fluent Emoji（npm iconify 套件，MIT），點了畫成 512px PNG 當照片素材 | GitHub 被擋拿不到原始 repo；當照片素材就能沿用拖移／縮放／圖層／匯出 |
| 選取框用「看得到的內容」（`selectionBox`：字塊∪文字含描邊∪裝飾），渲染仍用整張畫布 | 畫布為了裝飾/陰影對稱多留透明邊，選取框會比看得到的大很多 |
| 預覽選取操作：四角小點縮放＋上方旋轉點，沒有 ✕ 與大圓鈕；文字面板／疊加／圖層展開時時間軸精簡；全螢幕預覽 | 使用者：預覽太小、icon 太大；iPhone 13 實測預覽只佔 40% |
| 匯入：OPFS 分段寫（8MB）→ IndexedDB → 記憶體；錯誤訊息分步驟；縮圖失敗不算匯入失敗；>1920 或 >150MB 不用 WebCodecs 解縮圖 | iPhone 大影片 UnknownError / out of memory |
| 裝飾底線的上緣固定、線變粗往下長；每個裝飾有 gap／scale | 使用者：波浪線太靠近文字 |
| 圖形調整值 `CardBox.adj`＋`fitInset` 執行時重算外框大小（沒調過用 inset 表） | 像 Office 圖形的調整點；舊字卡大小不變 |
| 字卡大小/外框粗細跟畫面短邊走（`uiScale = min(w,h)/1080`） | 改成橫式時字不會被放大 1.78 倍；9:16、3:4、1:1 不受影響 |
| 安全區參考線預設關（localStorage `vc-safe-zone-v2`），只在拖移時自動出現；拖移一律吸附安全區邊界 | 使用者誤以為粉紅斜線是背景 |
| 匯入的影片接在最下面那條影像軌後面、不自動選取 | 滿版影片選取框像「需要手動縮小」。（2026-11-12 更新：預覽上**可以**點影片選取、縮放——見下面「預覽點選」） |
| 縮圖：Mediabunny `CanvasSink` 優先 → `<video>` → 預覽播放器拿到畫面後 `setAssetThumbs`（不進復原歷史，歷史快照一併更新） | iPhone 隱藏 `<video>` 常不觸發 `loadeddata` |

## 5. 踩過的坑（避免再踩）

- **介面主題**（`src/ui/theme.ts`、`styles.css`）：顏色全部是 `:root` 的變數（`--bg --fg --muted --accent --on-accent --panel --line --btn --btn2 --field --border --clip --bar --timeline`），`:root[data-theme='mono'|'fresh'|'warm']` 只覆蓋變數；暗黑是預設（沒有 data-theme）。新的 CSS 不要寫死中性色（#222、#444…），用變數；預覽畫面（`.stage`）永遠黑底。`index.html` 有一小段 inline script 先套用，避免打開時閃暗色；`applyTheme` 也會換 `theme-color` meta。
- **多格版型**見 `docs/LAYOUTS.md`（外框 PNG＋每格一個普通疊加物件＋鎖住的外框軌道）。

- **背景音樂（audio 軌）**：`TrackKind` 多了 `'audio'`，音樂是 `VideoItem` 的 `type: 'audio'`（有 `trimIn`、`volume`、`fadeIn`／`fadeOut`，`transform`、`fit` 只是湊欄位）。所以所有「自由軌」的分割、複製、修剪、移動、軌道選單都直接沿用。要記得的幾個地方：`layersAt`／`scene`／`itemBox` 對音樂回傳沒有畫面；`totalDuration` **不算**音樂（音樂比影片長就在影片結束時切掉）；`Asset.kind='audio'`、`Asset.wave`（每 0.1 秒一個 0–100 的值，匯入時 `engine/wave.ts` 算）。預覽：`Player` 多一個 `<audio>` 池（`VideoPool(…, 'audio')`，3 個），`syncMusic` 跟著時間軸對時；聲音走跟影片同一個 `AudioOut`（音量可到 200%、淡入淡出用 `fadeGain` 每格算）。匯出：`mixAudio` 每個物件一個 `GainNode`，音量與淡入淡出用 `setValueAtTime`／`linearRampToValueAtTime`。**沒做循環**（音樂比影片短就用「複製」接起來）。
- 驗證聲音用 `AudioOut.level()` 時，e2e 要先注入 `navigator.audioSession`，否則 iPhone 模擬的 UA 會走「直接用元素出聲」的路徑（量不到）。
- `npx tsc --noEmit -p .` 不會真的檢查（專案是 solution-style tsconfig），要用 `npx tsc -b`（`npm run build` 內也有）。

- **匯出整支影片**（`engine/exporter.ts`、`app/editor/ExportSheet.tsx`）：不播放，一格一格依時間走。影片格用 Mediabunny `CanvasSink.getCanvas(t)`（WebCodecs；解不了才退到 `<video>` seek），畫面走跟預覽同一套 `buildScene`＋`Compositor`（輸出解析度），`CanvasSource` 編碼；聲音用 `OfflineAudioContext` 依時間軸（開始時間、修剪、速度、音量、靜音／隱藏軌道）一次混好，`AudioBufferSource` 編碼；`chooseFormat` 決定封裝：H.264＋AAC→MP4；編不出 AAC→**無聲 MP4＋明講**；編不出 H.264→WebM（VP9＋Opus，測試用）。輸出寫到 OPFS 暫存檔（`StreamTarget`，沒有 OPFS 才用記憶體），關閉面板／取消／出錯都會刪，啟動時 `cleanupExportTemp()` 再清一次。沙盒 Chromium 能編 H.264 但**編不出 AAC**，所以測聲音要用 `preferWebm`（只給測試）。除錯掛鉤 `exportAndInspect` 匯出後用 Mediabunny 讀回來檢查。
- 無頭 Chromium 下載中文檔名時 `suggestedFilename()` 會變成 `download`（真的瀏覽器不會），e2e 不要斷言檔名。

- **會動的圖片（GIF／動態 WebP）**：`engine/animImage.ts` 解成 `ImageBitmap[]`＋每格長度（有 `ImageDecoder` 用它；沒有就 GIF 用 `gifuct-js`（MIT，npm 套件）自己處理 disposal；動態 WebP 在沒有 `ImageDecoder` 的瀏覽器解不了，所以 `giphyToFile` 那種情況改抓 GIF 版本）。`Asset.anim = { frames, duration }` 在匯入時決定（超過 150 格或解開後 > 96MB 就當一般照片）。預覽（`Player.render`）與單格輸出（`exportFrame`）都用 `frameIndexAt(delays, t − item.start)` 取格，循環播放。快取只存在記憶體，每個素材解一次。

- **預覽用輕量影片（proxy）**：`engine/proxy.ts`（Mediabunny `Conversion`，先試 H.264/mp4，沒有再用 VP9/webm；HDR 在 `process` 裡畫到 OffscreenCanvas 轉 SDR）、`engine/proxyQueue.ts`（一次一支，狀態寫進 `Asset.proxy`，不進復原紀錄）、`assetUrls.urlFor(…, 'preview'|'export')`（預覽用 proxy、匯出一律原檔）。proxy 存在跟素材同一處，檔名 `<assetId>~p`。池子裡的 `<video>` 只有停著時才換網址。沙盒 Chromium 沒有 H.264，所以測試走 VP9；iPhone 實際走 H.264，沒驗證。
- **空位**（2026-11-12 取代「主軌 gap」）：所有影像軌都是自由擺放，沒有磁吸、沒有 `gap` 欄位（v1 的 gap 效果已經在 `start` 裡，migrate 時刪掉）。`trimStartFree`：尾巴不動、起點往後（前面空出來＝空位）；`layersAt` 在空位時沒有圖層（黑畫面）；刪除只刪這一段，「刪除並補齊」（`rippleDelete`）讓同軌後面的往前移；時間軸對影像軌物件之間的空位（最下面那條連開頭也算）畫虛線框，點一下選取、再點一下補齊（`closeGap`）。修剪面板（`setTrimWindowFree`）不動片段位置，只改長度（不能壓到後面的物件）。
- **CDP 觸控／滑鼠事件有延遲**：讀 React 狀態前要等一下（e2e 裡 `waitForTimeout(250)`）；圓角元素的最邊角點不到。

- **影片直接當 Pixi 貼圖**：用 `ImageSource({ resource: <video> })`，**不要**用 `VideoSource`（它會對元素 `load()`、自己接管播放）。改裁切（`texture.frame`）後要 `texture.update()`，而且貼圖建構時要給 `frame`（否則 `noFrame` 會把 frame 重設）、要 `dynamic: true`（精靈才聽得到 `update`）。
- **iPhone 聲音**：`<video>` 元素直接出聲在靜音模式下也有聲音但設不了音量；Web Audio 在靜音模式下預設沒聲音，要先 `navigator.audioSession.type = 'playback'`。解鎖要在使用者點擊當下**同步**對元素 `play()`（不靜音）再馬上 `pause()`，不能用靜音 play、也不能等 promise（會停掉剛開始播的影片）。見 `src/engine/audio.ts`、`mediaPool.ts`。
- **iPhone Safari 沒辦法在沙盒測**：OPFS 寫入、Cache Storage、同時多個 `<video>` 解碼/自動播放解鎖、混合模式、手勢，全部在 `PLAN.md §7` 待真機驗證。
- 沙盒的 Playwright Chromium **沒有 H.264**：測試素材用 WebM；ffmpeg 的 `color=c=green` 是 (0,128,0)，要純綠用 `0x00ff00`。
- Pixi v8：stroke `alignment: 1` ＝**內側**（0＝外側）；`extract.canvas` 不指定 `frame` 時尺寸會差 1px、內容超出畫面還會位移 → 一律明確給 `Rectangle(0,0,w,h)`。
- 底部面板開關會改變預覽大小 → e2e 點擊預覽時要**每次重新量舞台位置**。
- 很短的片段上，修剪把手的觸控範圍會蓋住片段中間（長按拖曳按不到）→ `.clip.short` 縮小把手範圍。
- 自動儲存 800ms：編輯後 <0.8 秒就重新整理會丟最後一步（測試要等 1.2 秒）。
- React lint（react-hooks v7）禁止在 effect 裡同步 setState、在 render 中重新賦值變數；全形空白 `　` 會被 `no-irregular-whitespace` 擋 → 用一般空白。
- `noUncheckedIndexedAccess` 開著：陣列索引要 `!` 或判斷。
- Prettier 會把長行重排，用字串取代改程式碼前先看現況（用 Edit 工具或先 `prettier --write`）。
- 隱藏軌道的物件要仍能在圖層面板列出（`layersAt(…, includeHidden=true)`），不然沒辦法再打開。
- 字體：`new FontFace(…, ArrayBuffer)` 一次只該載「用到的」；預覽字樣用幾 KB 的 `preview.woff2`；OFL 裁切後內部名稱要加 `VC Subset`。
- `npm audit` 有 1 個 moderate（vite-plugin-pwa → workbox-build → deepmerge），只在建置階段，不進網站，等上游。

> 坑（2026-11-11）：Pixi `Application.destroy` 後不能在**同一個 `<canvas>`** 上重建 WebGL（頁面會卡死）。改比例要重建預覽時，`Preview.tsx` 用 `key={width x height}` 換新的 canvas。
> 坑：e2e 裡 `window.__videoclip` 要等預覽引擎建好才有，進編輯器後先等它再讀 `project()`。

> 坑（2026-11-11 第 2 次實測）：iPhone 匯入大影片出現「The operation failed for an unknown transient reason (e.g. out of memory).」＝WebKit `UnknownError`。`importFiles` 把存檔與讀資訊包在同一個 try，看不出哪一步失敗——錯誤訊息要分步驟。OPFS 不要一次 `write(整個 Blob)`。
> 坑：文字的選取框／點選範圍用的是整張字卡畫布（含為了裝飾、陰影對稱多留的透明邊），裝飾一多就比看得到的大很多。
> 坑：`.empty-import` 用 `top:38%` 相對整個編輯器，預覽變小時會蓋到時間軸。

> 坑（2026-11-11）：很小的物件，四個角點和旋轉點的 40px 觸控區會互相蓋住（最上面那個吞掉事件）→ 依物件大小把點推遠。
> 坑：`fitInset` 的外框長寬比要和最後結果一致（kx、ky 夾到 1 時比例會變）；扇貝邊圓的控制點會超出曲線，量範圍要用 `flattenPath` / `opsExtent`（取樣），不要用控制點。
> 坑：range 輸入的值會被吸到 `step` 的格子上顯示；預設值不在格子上時（例如 0.72）顯示會差一點，資料不受影響。

> 坑（2026-11-11 預覽優先版面）：Pixi 會在 canvas 上寫 inline 的 `touch-action:none`，要在 CSS 用 `touch-action: pan-y !important` 蓋掉，預覽空白處才能上下滑捲頁面。物件可拖靠的是 `.hit` 觸控區（`touch-action:none`）。
> 坑：e2e 的雙指／觸控用 CDP `Input.dispatchTouchEvent`（helpers 的 `pinch`、`touchDrag`）；觸控滑動後有慣性捲動，要等停下再量 `scrollY`。整頁捲動後，用滑鼠座標的測試要先 `previewBox`（捲回頂端）或 `showTimeline`。

> 坑（2026-11-12）：PWA 預快取讓 iPhone 一直開到舊版，使用者回報的錯誤可能是舊版的。現在 `src/app/pwa.ts` 會在開網頁／回前景時檢查新版並自動重新整理；請使用者回報時先看「設定 → 版本」。

> 坑（2026-11-12）：e2e 讀 `window.__videoclip` 的 helper 一定要先 `waitHook`（預覽引擎晚建好時會讀到 undefined，造成偶發失敗）。iPhone 上 Safari 和「加入主畫面」的 App 資料是分開的。

## 6. 現況與下一步
**已完成**（細節與驗證看 PROGRESS.md 日誌）：Phase 0（骨架/PWA/部署）、Phase 1（專案管理＋多影片拼接）、Phase 2（多圖層＋選取框手勢＋圖層屬性）、Phase 3B（字體管線＋首次使用精靈＋設定頁＋字體選單＋匯入字體）。
**已合併並上線**（PR #2，2026-11-11；GitHub Actions 部署成功）。之後的工作在 `claude/zen-tesla-v3brj5`，要上線一樣：開 PR → 使用者 merge → 部署。PR 合併後分支對齊 main 用 `git merge --ff-only origin/main`（不要 force push）。

### 先做：使用者實測回報的修正
照 `docs/plans/2026-11-11-safe-zone-and-selection.md`（安全區參考線、主軌選取框、iPhone 縮圖）。之後的修改規劃也放在 `docs/plans/`，檔名用日期開頭。

### 再做：Phase 3A 字卡引擎（規格 `docs/TEXT_CARDS.md`，驗收見 `docs/PLAN.md` Phase 3）
建議拆成可各自驗證的小步（每步都更新 PROGRESS.md、commit）：
1. **型別與排版引擎**：把 `TextCard/TextRun/CardBox/Decoration` 擴充到 TEXT_CARDS.md §1 的完整版（`src/model/types.ts`），`engine/textRender.ts` 改成「逐字排版 → 墨跡邊界（`measureText().actualBoundingBox*`）→ 字塊尺寸＝墨跡＋四邊內距」（修正「字上方色塊多、下方貼底」）。單元測試：3 款字體的上下內距對稱。
2. **字塊與內距 UI**：字卡分頁加字塊（形狀、顏色、透明度、四邊內距＋連動鎖、垂直微調）、字距、行距、寬度、對齊、粗體（描邊模擬）、斜體、描邊、陰影。
3. **尾端圈圈與裝飾**：`tail-loop` 照 §3.1 路徑；其他裝飾（波浪、虛線、螢光筆、手繪圈住、箭頭、星星、愛心…）。風格選單用「即時渲染縮圖」。**驗收：與 `docs/reference/tail-loop-underline.jpg` 疊圖對照截圖**。
4. **圖形庫**（Office 風格：方塊、雲朵、對話框、星形、緞帶、箭頭…）當字塊/貼圖；貼圖 icon（Fluent Emoji 子集，MIT）。
5. **雲朵字**（TEXT_CARDS.md §5）。
6. **模板**（約 50 個，TEXT_CARDS.md §6）＋模板縮圖總覽頁 `docs/screenshots/templates/index.html`。
7. 動畫（逐字出現等）屬 Phase 4。

### 待使用者提供/決定
見 `docs/PROGRESS.md`「等使用者的事」（缺檔字體：LINE Seed 繁中、致一宋體、佮逸體；iPhone 實測回報；是否把 Phase 1–3B 合併上線）。

## 7. 怎麼驗證現在是好的
```
npm ci
npm run check                      # lint + 41 個單元測試 + build
npm run e2e -- --trace off         # 22 個 e2e（iPhone 13 尺寸、Chromium）
```
e2e 會產生 `docs/screenshots/phase*/` 截圖（給使用者審核用，也會被 commit）。

## 2026-11-12 第 6 次回報的架構變動（feedback-6，詳見 `docs/plans/2026-11-12-feedback-6.md`）
- **預覽點選**：點預覽（按下到放開 < 350ms、移動 < 8px、沒被瀏覽器接手去捲頁面）才算點；點空白**不取消選取**（取消選取＝點時間軸空白）；沒選取的大物件（≥ 舞台一半）觸控區是 `touch-action: pan-y`（上下滑＝捲頁面），小物件與已選取的物件按下去就能拖（`touch-action:none`，已選取的外擴 40px）；已選的再點一次＝換下面那層（`nextHit`）；預覽右上「圖層」＝`LayerPeek` 清單。**取捨**：整個預覽都 `touch-action:none` 就不能在預覽上捲頁面，所以「雙指放哪裡都行」做不到，只有物件旁 40px 內。
- **分頁**：`Toolbar.tsx` 只留分頁列＋自動切換（`tabForSelection`），每一頁一個檔在 `src/app/editor/tabs/`；`ClipPanel`（變速、音量、修剪）剪輯與音訊分頁共用。
- **長按拖移素材**：`Timeline.tsx` 長按 400ms 後可以左右（改時間、吸附）、上下（換軌道）移動；同一區上下各出現「＋ 新增一軌」放置區（拖的時候版面會多出 26px 的列）；種類不符的軌道變灰、放開彈回並提示；放進去的位置有東西＝移到最近的空位；原軌道空了不自動刪。純函式在 `timeline.ts` 的 `dropTarget`／`moveItemToTrack`，動作 `actions.moveItemTo`。**沒做**：拖到時間軸邊緣自動捲動（時間軸的水平捲動＝播放頭，要另外設計）。
- **坑**：①`deselect()`（e2e）點時間軸會把整頁捲下去，之後要先 `scrollTo(0,0)` 才能用舊座標點預覽 ②`openTab` 要限定在 `.tabs`（文字面板裡也有叫「文字」的小分頁）③新增軌道一律用 `insertIndexFor`＋`splice`，不要 `push`，否則會破壞分區順序（字卡跑到音訊後面）④「刪除」按鈕多了「刪除並補齊」，e2e 找「刪除」要 `exact: true`。

