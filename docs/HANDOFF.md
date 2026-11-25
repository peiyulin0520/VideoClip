# 交接手冊（HANDOFF）

給接手的 AI／工程師。**目前的總規劃與順序看 `docs/plans/2026-11-23-roadmap-ui.md`（2026-11-23 定案；U1–U6 程式都做完了（U6 見 `docs/plans/2026-11-23-u6-function-bar.md`），**e2e 已改成新行為且全綠，等使用者說再開一個 PR**）。**先讀 `AGENTS.md`（規則）和 `docs/PROGRESS.md`（目前狀態），這份補上「為什麼這樣做」和「程式在哪裡」。
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
- **多格版型**見 `docs/LAYOUTS.md`（外框 PNG＋每格一個普通疊加物件）。**G4 之後**：同一版型的軌道共用 `Track.group`，外框軌 `groupRole:'frame'` 代表整個版型（時間軸上只顯示它、各格 `groupRole:'cell'` 藏起來），縮放／移動／旋轉是整組一起（`engine/groupTransform.ts`，`setTransform` 自動轉換），格子素材放完顯示色塊（`Track.fill`）；動態模板（`VideoItem.template`、`cellAnim`）、轉場（`VideoItem.transitionIn`，`engine/transitions.ts`）都在 `buildScene` 算。詳見 `docs/plans/2026-11-12-feedback-7.md §4`。

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
- **提交前一定跑完整的 `npm run check`**（含 `prettier --check .`）。只跑 `eslint` 會漏掉排版：2026-11-12 PR #8 因此 CI 的 lint 步驟失敗、部署被跳過（19 個新檔案排版不符）。改完檔案先 `npx prettier --write .`。


## feedback-8（2026-11-13）新增的東西（給下一位）
- **轉場 v2**：`engine/transitions.ts`（目錄 `TRANSITIONS`、純函式 `transitionFrame`、`activeTransition` 產生延長／提前的虛擬物件，id 跟原物件相同）；`scene.ts` 的 `sceneItems` 是「這個時間點要畫的物件」，匯出備畫面要用它；合成器圖層外多一層 holder（裁切遮罩）、`SceneLayer.clip/blur`；選單的 A→B 示意動畫 `engine/transitionPreview.ts`＋`TransitionCards.tsx`。舊轉場名稱由 `migrate.repairGroups` 轉換
- **版型修復**：`migrate.repairGroups`（孤兒格子變回普通軌、動態模板欄位清掉）；刪除版型的路徑一律走 `removeGroup`；`scene.guardCell` 保險
- **預覽畫質**：`engine/previewQuality.ts`、`Player.onSlow／onPoolFull`、影片池滿時 `thumbFallback`
- **軌道多選**：`timeline.ts` 的 `moveTracksBy／removeTracksByIds／mergeTracksByIds`＋`Timeline.tsx` 的 `MultiBar`
- **點陣圖遮罩**：`VideoItem.maskBitmap`、`engine/maskBitmap.ts`、`cropStore` 的 `ensureMaskCanvas／paintMask／undoMaskStroke`


## feedback-9（2026-11-14）新增的東西（給下一位）
- **更新到手機**：`vite.config.ts` 輸出 `version.json`；`src/app/pwa.ts`、`store/updateStore.ts`、`ui/UpdateBanner.tsx`；設定頁「檢查更新」
- **時間軸**：四類各自收合（`vc-tl-cats`）、貼圖軌（`TrackKind 'sticker'`、`Asset.origin`）、0 秒貼左（`GUTTER`）
- **共用片段標記軸**：`RangeMarkerSheet`（修剪、靜音標記都用它）、`TrimSheet`、`MuteSheet`；`VideoItem.audioRanges`（`engine/audioRanges.ts`）；舊的 `TrimPanel／RangePicker` 已刪
- **特效 v3（I5）**：`ItemBase.transitionIn { kind, duration, before?, after? }`（沒寫 before／after＝各一半）、`inEffect／outEffect`（單一素材進場＝B、出場＝A，只在開頭／結尾；`engine/transitions.ts` 的 `itemEffectAt／effectFrame／effectDurations`，A 不會自己離開的轉場出場時把 B 倒著放）；轉場只在同類之間（`sameFamily`：影像＝影片＋照片、貼圖、字卡）；`scene.ts` 的 `applyItemEffect`（以素材自己的方框為準）與 `applyGroupOrItemEffect`（版型整組以外框為準、顏色層只蓋一次）；代表字 `TRANSITIONS[].code`（類型字，可重複）
- **文字特效**：`engine/textFx.ts`（`TextItem.textFx`：閃爍／發光閃亮／方格字／震動，時間量化成「步」＋id 當種子，預覽與匯出一致）；`renderText(card, scale, visible)` 的 `visible` 是打字露出幾個字（進場往後打、出場像 delete 從後往前刪）
- **特效分頁**：`EffectTab`（進場／出場／轉場／文字特效；音訊只有淡入淡出滑桿）、`EffectTimingSheet`（預覽左軸右的細調面板：進場只有「迄」、出場只有「起」、轉場「起／迄」＋欄位連動）、`GroupFxSelect`（版型整體進出場）；時間軸圓圈用 `useUI.fxFocus` 判斷「選取中」顏色（4 個顏色固定，不隨主題換）
- **坑**：e2e 裡面板（Sheet）剛開會滑上來，量 `boundingBox` 前先 `waitForTimeout(500)`；旗標的 `boundingBox` 是 44px 寬的按鈕，拖曳要從中心算（`x + width/2`），不是左邊
- **定位（I7）**：`engine/keyframes.ts`（`timeResolved` 在 `buildScene` 一開頭、`Preview` 的選取框／觸控區也用；有定位的物件 `setTransform` 改的是播放頭那個時間的定位；版型外框有定位時各格由外框算出來）、`KeyframeButton`（播放列 ◇）、`tabs/KeyframePanel`（X／Y 位置、色調）、時間軸 `kf-dot`；合成器 `SceneLayer.adjust`＋`ColorMatrixFilter`（沒有色調就不加濾鏡）
- **轉場播放（T1–T5）**：`engine/videoSync.ts` 的 `videoSyncPlan` 決定每支 `<video>` 怎麼對時（素材最後／開頭之前 hold、不 play；轉場中放寬）；`activeTransition` 的 B 入點可能是負的（`sourceTimeClamped` 下限 0）；`Player.trackTransitions` 算 `transIds`＋轉場統計；預載的 B 在轉場前 `WARM_S` 開始靜音暖機
- **調色（J1–J3）**：`engine/grade.ts`（`gradeRGB` 是參考實作，改算式要連 `gradeFilter.ts` 的 GLSL 一起改；`LOOKS` 色調組合；`effectiveAdjust`＝組合×強度＋手動）、`engine/gradeFilter.ts`（Pixi `Filter`，只有 WebGL 的 glProgram）、`scene.toLayer` 用 `effectiveAdjust`、`app/editor/ColorPanel.tsx`（剪輯分頁與文字分頁都用）、`Player.setGradeBypass`（按住看原圖）、`actions` 的 `setAdjust／setLook／resetGrade／applyGradeToAll`
- **feedback-10**：播放列 `PlaybarButton`＋全站 `:active` 回饋（`styles.css` 最後面）；音訊進階 `MuteSheet`（`RangeMarkerSheet` 的 `mode: 'silence'`、`extra`、`allowEmpty`）；版型：`LayoutDef.texts`（預設版型文字）、`VideoItem.frameStyle`、`addLayout` 建字卡（`TextItem.group`＝版型 group）、`applyFrameStyle`／`frameRestyle.ts`（重畫外框）、`FrameStyleControls`；**版型的整組邏輯（`setTransform`、`timeResolved`、`scene` 的 group、`colorTargetIds`）現在連字卡一起算**；色調分頁 `ColorTab`
- **feedback-11（W1–W5）**：播放列 `Editor.tsx`（左：播放＋時間；右：定位／`GradePeekButton`／縮小／放大）；**看原色**＝`useUI.gradePeek` → `Player.setGradeBypass('all')`（不改專案資料；匯出前關掉）；**定位色調漂移**：`Keyframe.look`（沒寫＝沿用物件的，`null`＝原色）、`keyframes.ts` 的 `usesKeyframeLook`／`adjustAt`（有定位指定色調組合時用「實際調色值」逐項內插，`withTime`／`timeResolved` 把 `look` 清掉避免加兩次）／`manualAdjustAt`（面板滑桿顯示的手動值）／`upsertKeyframe`（插在色調定位中間＝把實際值存進 adjust、look＝null）；色調分頁「套用到：整段素材／這個定位」（`gradeScopeOf`，有定位預設「這個定位」，`useUI.gradeScope` 記使用者手動選的；切回整段會 `clearKeyframeGrade`）；**播放線選定位**：`keyframeNear`＋`useUI.timelinePps`（容許 8px），`actions.keyframeLocal` 決定改哪個定位，`KeyframeDot`（`.here` 白底稍大、`.graded` 小點）；`deleteNearKeyframe`；**定位小特效**：`engine/pulse.ts`（震／彈／晃／跳，`pulsedTransformAt` 疊在 `withTime`；`transformAt` 本身不含，新增定位的底值才不會烤進去）、`setKeyframePulse`、`KeyframePanel`（圖層分頁）；順暢度：`GradeFilter.setAdjust` 沒變不重傳、`usePlayheadTime` 播放中面板最多 2Hz、`Preview` 定位選取框播放中最多 15Hz
- **feedback-12 X1**：字級只有三個變數（`--fs-body`＝分頁列大小、`--fs-note`、`--fs-pb`，`styles.css` 最前面；新增元件不要自己寫 `font-size: 15px`）、圓角用 `--radius-ctl`、按鈕與 chip 內距用 `em`；文字提示字＝`TextItem.placeholder`（`engine/placeholder.ts`：預覽 `showPlaceholders`，匯出直接讀專案所以不畫）；`itemTitle` 是「素材名稱」唯一來源（有命名優先）；播放列／視窗不要用 emoji 當圖示（用 lucide）
- **feedback-12 X3 裁切**：`CropEditor`（全螢幕、`position: fixed`，在 `Editor.tsx` 掛一個）；畫面用素材自己的 `<video>`（`urlFor`）顯示整張原始畫面，不經過 Player；`cropStore` 的 `CropSession` 有 `crop`／`mask`／`strokes`＋`history`／`redo`（`commitCrop(before)` 一步一記）；`engine/cropCompose.ts` 的 `composeKeep`／`drawStroke` 是「留下的範圍」唯一算法；套用時 `maskBitmap`（結果）＋`cropEdit`（向量筆畫）；刷的時候不要動 zustand（每筆放手才 `commitCrop`）；放大縮小是 `.ce-zoom` 的 CSS transform，手指座標用 `frameRef.getBoundingClientRect()` 換算（已含縮放）
- **feedback-12 X7 轉場聲音**：`transitionIn.audio`（沒寫＝cross）＋`audioCut／audioOutA／audioInB`（相對接縫的秒數）；**聲音倍數只有一個算法**：`transitions.ts` 的 `seamGains`→`transitionAudioGain(items, item, t)`，預覽（`Player.syncVideo`，element 模式量化成 0／1）與匯出（`mixAudio` 的 `tg` 倍數節點，用 `seamAudioExtent` 決定提早／多放與逐格範圍）都用它；`activeTransition` 的虛擬物件仍是靜音（只管畫面），聲音從原本的物件算；測試用 `__videoclip.audioGains()`
- **版型內圖層（L8）與框線**：成員軌換順序用 `shiftMemberLayer`（只跟同版型同種類換）；格子間框線粗細存在 `frameStyle.line`（倍數），算法 `cellGap`／`applyLineScale`，`buildIn(..., box, line)`
- **版型形狀（v2，L7）**：外框的 `frameStyle` 存 `layout`（含 'grid'＝自訂格數）、`rows/cols`、`box`（占畫面比例）。要版型定義用 `defOf(style)`、要格子位置用 `buildIn(def, W, H, style.box)`，不要直接 `def.build(W, H)`。改形狀走 `reshapeLayout`（重畫外框）→ `applyLayoutShape`（store，一步復原）
- **版型兩層（v2，L5）**：選到外框＝版型層（整組）；選到版型裡的其他東西＝素材層（只動自己，`setTransform`／`keyframeTarget` 用 `isFrameItem` 分）。素材層的定格要跟整組的定格疊加（`timeResolved`）；單獨動過的格子標 `cellEdit`（`guardCell` 不管它）；超出版型的部分用 `groupClipRect` 遮掉。e2e 要做整組操作先 `selectFrame(page)`
- **版型成員（v2，L3）**：版型裡的文字／貼圖／音效在 `groupRole:'member'` 的軌道（`memberTracksOf`），貼圖、音效物件要標 `member:true`（不然 `isFrameItem` 會把有 group 沒 cell 的影像當外框）。加進版型用 `addGroupMember`（自動夾進版型時間範圍，不要自己 push）；拖移、修剪都要過 `clampToGroup`／`groupSpan`。播放軸展開狀態在 `useGroupOpen`；`Timeline.tsx` 的 `layout` 會在展開的版型那一列後面插入標題列與成員／格子列（`rows[].sub`），這些列不參與換圖層順序的拖移
- **版型分頁（v2，L2）**：只有「挑版型→確定，加在播放線」與選到版型時的示意圖／外框顏色。進出場、動畫、轉場、長度都不在這裡（特效分頁、時間軸尾端）。e2e 加版型用 `helpers.finishLayout`（確定→逐格放素材），拉長縮短版型用 `trimClipEnd`
- **版型的軌道（v2，L0＋L1）**：外框＝一般影像軌上的片段（`isFrameItem`：有 group、沒有 cell；`frameOfGroup(tracks, group)` 找它），格子＝`groupRole:'cell'` 的隱藏軌（`track.cell` 記位置，可以是空的）；格子軌永遠貼在外框那一列正下方——`projectStore.apply` 每次都跑 `normalizeGroupTracks`，不要自己排。版型參加轉場時整組用外框的 look（`scene.ts` 的 `groupTransitions`／`deferred`）。不要再用 `groupRole === 'frame'`（只剩舊資料，載入會轉掉）。e2e 找外框軌用 `isFrameTrack`（helpers）
- **動態字卡（文字特效 64 式，2026-11-16）**：計畫 `docs/plans/2026-11-16-kinetic-text.md`，原版參考 `docs/reference/claude-animated-text/`（MIT，授權檔在 `src/engine/kinetic/LICENSE-claude-animated-text.txt`）。每一式是 `KineticDef`（`draw(stage, t)` 畫到 canvas 2D，單位照原版 cqmin／cqw／cqh 換成像素，亂數用固定種子）；加新一式＝在 `fx/<組>.ts` 加一筆、`KINETIC` 就會出現在介面（64 式已全部完成：in／flow／swap／em／sp／mv／tv／hr 各 8）。`KineticDef.hi`＝這一式自己的預設強調色（用 `schemeOf(def)` 取配色）。副標 `kinetic.sub`（`KineticDef.sub` 有值的式子才有，Stage.sub）、`kinetic.end`＝loop／hold（`hold.ts` 的 `HOLD_F` 是每一式一輪裡「字完整呈現」的比例，`holdTime()` 算出最後一個詞那一輪的停點，一直在跑的式子停在 poster；渲染時 `tt=min(tt,hold)`）。compositor 的 `frameCanvas` 重畫前一定要先清（外框圖有透明區）。效能：`KINETIC_BENCH=1 npx playwright test e2e/kinetic-bench.spec.ts` 量每一式畫一張的時間；跟原版比對：`KINETIC_COMPARE=1 …kinetic-compare.spec.ts`＋`scripts/kinetic-compare.py`。`TextItem.kinetic` 跟 `textFx` 二選一；動態字卡畫在「框」大小的圖上（框外看不到）：框＝`kinetic.size`（沒有＝那一式的預設框 `area`：wide／full／lyrics，`engine/kinetic/hit.ts`），中心＝字卡位置，`measureTextItem` 回傳框的大小；每一式的單位 cqmin／cqw／cqh 以框為準；`fade` 邊緣淡出、`wrapLines` 換行工具在 `core.ts`；顏色（字色＝字卡文字段顏色、`accent`、`bg` 色碼）都用選色器。調整範圍：`uiStore.kineticEdit`＋`KineticAreaEdit`。`SceneLayer.dynamic`＝同一張畫布每格重畫，compositor 不重建貼圖。
- **素材遺失（Y11，2026-11-16）**：`findMissing`（`assetUrls.ts`）回傳找不到檔案的素材並記在 `lost`（`isAssetMissing`）；`Editor.tsx` 載入時把沒人用的從 `project.assets` 拿掉並 `saveProject`，只提醒有在用的；時間軸 clip 對 `isAssetMissing` 的素材蓋 `.clip-lost`。
- **拖格子大小（Y9，2026-11-16）**：`frameStyle.cells`（每格佔畫面的比例，照格號順序）覆蓋 `buildIn` 算出來的格子範圍（格數對才用），外框底板不動。`LayoutCellResize` 用 `uiStore.cellEdit` 存草稿，`dividersOf`／`moveDivider` 是純函式（有單元測試）；套用走 `reshapeLayout(group, { cells })`，其他 `reshapeLayout` 呼叫（改格數、大小、框線）會清掉 `cells`。
- **一格多列（Y8，2026-11-16）**：格子軌有 `cellNo`（第幾格）；同一格的幾條軌＝`cellsOf`／`rowsOfCell`，陣列順序＝上下。所有「第幾格」都要用 `cellNoOf`／`cellsOf`，不要再用 `cellTracksOf().indexOf`。`ensureCellNos` 在每次 `apply` 補舊資料。空檔：停格只有「有素材的最上面那列」、色塊只有最下面那列，而且整格沒有列在播才畫。動作：`addCellRow`、`removeCellRow`、`setCellNo`、`swapCellRows`。
- **圖層分頁（Y7，2026-11-16）**：`LayersTab` 把「連續屬於同一版型」的圖層併成一塊（`runs`，用 `track.group ?? item.group` 判斷，因為外框那一列的軌道沒有 `group`）；版型預設收合（`open` 集合記展開的）；收合時列尾的上下是整塊移動（外框那一軌的 `moveTrackPast`），展開後由外框列自己的按鈕負責，避免重複。格子列的 ▲▼ 先只提示，Y8 實作。
- **格子素材（Y6，2026-11-16）**：格子裡的影像不預先裁切（`cellItem` 沒有 `crop`、整張蓋滿），`groupClipArea` 永遠把格子遮在自己那一格；預覽點選要在那一格範圍內（`Preview.hitsAt`）。版型成員文字靠 `group` 跟版型走：`repairGroups` 只清「外框不在」或舊模板字（`fontCycle`），`repairMemberItems`（`engine/memberRepair.ts`）在載入與每次 `apply` 補回成員的 `group`／搬回成員軌。調色：外框＝整組、格子影像／文字／貼圖＝自己（`setAdjust`、`colorTargetIds`）。這一格視窗的「換素材」對選到的那一段（`applyCell(trackId, draft, itemId)`）。
- **特效（Y5，2026-11-16）**：任何素材都有自己的 `inEffect`／`outEffect`／`transitionIn`／`motion`；版型外框的特效整組一起動，版型裡素材自己的疊在上面（`scene.ts` 的 `own`）。格子軌可以有轉場（`canTransition`、`seamsOf` 允許格子素材）。「整段」＝`item.motion`（`motionOffset` 帶 `size` 才是從畫面外捲進來），特效分頁用 `setItemMotion`。
- **版型一格多素材（X6，2026-11-15）**：格子軌可以有多個素材（影片、照片、色塊）；**不要再用 `cellMain` 當「這一格的素材」**（只剩示意圖縮圖、單素材的舊流程用），要「這一刻畫什麼」用 `cellAt(project, track, t)`（`engine/cellGap.ts`）。空檔的停格是推出來的：回傳虛擬物件（`hold` 標記，不存檔），不要在素材上存 hold。色塊＝`origin:'color'` 的照片素材（`ensureColorAsset`，素材庫不列）；色塊上的文字用 `TextItem.onItem`，時間靠 `syncCaptions`（`projectStore.apply` 每次跑）維持跟那一段一致，不要在各個動作裡自己平移；在文字分頁自己加的字沒有 onItem、不跟。改格子時間一律走 `addToCell`／`trimCellEnd`／`removeCellItem`／`arrangeGroup`／`moveToCell`（依序漣漪在 `cellOps.rippleAfter`）。用詞固定：播放方式［同步］［依序］、空檔［停格］［色塊］［透明］、［移至格子］。
- **按鈕分區（使用者規則 2026-11-15）**：同一排裡不同層級／不相關的按鈕（例：播放列的定格 vs 時間軸縮放、頂列的專案設定 vs 匯出）要用分隔線、底色或分區隔開；共用 `.btn-zone`（一區）／`.zone-sep`（直線）／`.zone-line`（橫線）／`.zone-soft`（淡底區），L6 已套用在頂列、播放列、版型分頁、片段範圍視窗；新增相鄰按鈕要照做。版型 v2 見 `docs/plans/2026-11-15-layout-v2.md`。**圖層順序（X9，2026-11-15）**：影像、貼圖、字卡的軌道上下順序自由（`tracks` 陣列順序＝畫面蓋住順序），音訊永遠最後（`normalizeLayers`）；`ZONE` 只是「新軌道預設位置」與舊專案轉換用。換順序都以「一塊」為單位（`trackUnits`：一般軌＋格子軌在下＋版型成員軌在上）。**播放軸**用同類版本 `moveTrackInKind`／`reorderInKind`／`shiftTrackInKind`／`moveTrackInKindTo`（跨過別類、不打亂夾心）；**圖層分頁**用跨類版本 `moveTrack`／`moveTrackPast`／`moveTrackToEdge`。新軌道一律用 `insertIndexFor`，不要自己 splice 到陣列末端。計畫 `docs/plans/2026-11-15-x9-layer-order.md`
- **版型的格子（X5）**：版型分頁用 `LayoutDiagram` 畫示意圖，點格子開 `CellSheet`（名稱／素材／片段／空白畫面／慢快動作）。格子軌的 `Track.fill` 是色碼（或舊的 black/white）；空白畫面上的字是 `TextItem.cellFor === 格子軌 id`、`group` 同版型。素材怎麼放進 L 秒的算法只在 `planCell`，寫入只在 `applyCell`。`.sheet` 現在最高 94dvh、標題列 sticky
- **預覽座標（X4 之後）**：預覽的底 `.stage-base`＝預覽區整塊（`.stage-wrap` 的寬 × 固定高度；寬高比由 `Preview` 量到後 `setBaseAspect`，預設 9:16，`engine/stage.ts` 的 `stageLayout(w,h,aspect)`）；`[data-testid=stage]` 是**版面框**（輸出範圍，透明、不收事件），選取框／觸控區／參考線座標都以它為準（`k = 框寬 / 專案寬`）；canvas 是底的大小，Compositor 用 `world` 容器位移（`offsetX/Y`），`samplePixel`／`toCanvas` 仍以版面為準；匯出的 Compositor 沒有位移。畫面外的東西會畫、可以拖，只是蓋一層斜線。改比例預設用 `remapKeepOnStage`（保持原樣），`setProjectAspect(choice, 'fill')` 才是舊的「座標照新畫面」。`Project.aspect` 可能是 `'custom'`，顯示用 `aspectLabel`、不要直接 `ASPECTS[project.aspect]`
- **彈出視窗「套用／儲存」規則（使用者規定）**：設定型視窗（畫面比例、字體、專案名稱、更換封面、改名、命名、選色…）一律在視窗裡放一顆寫著「套用」或「儲存」的主題色按鈕；視窗裡先改的是草稿（state），按了才寫進專案，**視窗不會自動關**（跳 toast「已套用／已儲存」）；按 ❌／點背景關閉＝只放棄「最後一次套用之後」的改動，已套用的保留。例外（套用後一定要關）：自訂比例、裁切編輯器、片段範圍、版型挑素材。新增這類視窗要照做（例：`FontSelect` 的 `draft`、Editor 的 `ratioDraft`）。選單、確認刪除、匯出不在此列
- **feedback-12 X2 視窗**：所有彈出視窗都用 `ui/Sheet`（標題列有 ❌ `data-testid=sheet-close`、**不要再加底部「取消」**；❌＝不存）；視窗內的修改要嘛是視窗內暫存、按套用才寫入，要嘛像轉場聲音視窗那樣自己在 ❌／取消時還原


## U1–U5 介面重整（2026-11-23）新增的東西（給下一位）
- **版面**：`.editor` 是 `100svh` 直向 flex（頂列／預覽／〔全螢幕時的進度條〕／播放列／時間軸／功能列），整頁不捲；時間軸 `flex:1`、裡面上下滑；預覽高度由 `--proj-aspect` 決定（直式約 54% 高，橫式、方形較矮）。
- **功能列**：`Toolbar.tsx` `BottomBar`。狀態 `cat`（第一層類別或 null）、`tool`（升起的視窗或 null）、`panel`（變速／音量／範圍）。類別與視窗的定義在 `tabs/shared.tsx`（`CATS`、`SINGLE_TOOL`、`TOOL_TITLE`、`targetOfTab`）。只有一個工具的類別（版型、特效、色調、音訊）點了直接升起視窗；剪輯、加入、文字進第二層工具列（`.fb-row`，`fb-back` 返回）。**新增功能時**：加一個工具＝在對應類別的工具列放 `ToolButton`、需要視窗就加一個 `ToolId` 與 `TOOL_TITLE`。
- **自動跳**：`targetForSelection`（選到東西只換類別、不自動升起視窗）；`requestTab`（別處呼叫，如時間軸轉場圓圈→特效）經 `targetOfTab` 對應。刻意晚 250ms 才跳（手指放開後瀏覽器補送的 click 會落在新版面的別的按鈕上）。
- **視窗會蓋住播放列和時間軸**（使用者決定維持，2026-11-23）：e2e 點播放、復原、時間軸片段前先 `closePanel`；`helpers.ts` 有 `undo/redo/pressPlay/zoomTimeline`。
- **鎖定／全螢幕**：`useUI.previewLock`／`previewFull`（`Preview` 卸載時重設）；鎖定在 `Preview.onPointerDown` 最前面擋；全螢幕進度條 `ProgressBar.tsx`。
- **字級**：類別按鈕用 `--fs-note`，其餘仍是 `--fs-body`；不要在新元件寫死 px。
- **沒有說明小字**：使用者偏好（網頁式、簡潔）；空狀態一句提示可以，教學文字不要。

## U6 功能列每一項一顆按鈕（2026-11-24）新增的東西（給下一位）
- **工具表**：`src/app/editor/tools.tsx` 的 `TOOLS`（類別 → 按鈕清單）是功能列的唯一來源：加／改按鈕只動這張表。每顆有 `id`（e2e 用 `data-testid="tool-<id>"`）、`zone`（換區畫細線）、`kind`（popup 升起視窗／action 直接執行／toggle 切換）、`enabled`＋`need`（不能用時變淡、點了 toast）、`guard`（能用但不適合的提示）、`badge`（圖示那格顯示目前的值）、`popup`（視窗內容；`bare` 表示它自己就是 Sheet）、`custom`（自己畫按鈕：關鍵格 `KeyframeButton`、看原色 `GradePeekButton`）。
- **視窗內容**：不要再做分段切換列；每個視窗只放一項（`TextTab section`、`EffectTab part`、`LayoutTab part`、`ColorTab part`、`ClipPanel panel`）。小視窗即時生效、✕ 關閉，不加〔套用〕（會大改東西的 Sheet 例外）。
- **選到東西跳類別**：`Toolbar.tsx` 的 `targetForSelection`；`requestTab`（時間軸特效圓圈等）由 `requestTarget` 對到類別＋視窗（特效看 `fxFocus.role`）。
- **e2e**：`helpers.ts` 的 `openCat`／`openTool`（用工具 id）、`openTab`（舊名稱對照）；視窗開著會蓋住播放列、時間軸，點之前先 `closePanel`；剪輯／加入／文字／版型…的按鈕只在那個類別的工具列顯示。
- **U6 補充（e2e 改寫時確認的行為）**：①變淡的按鈕用 class `dim`＋`data-dim`（不是 `aria-disabled`，Playwright 會一直等）；②預覽上開始拖調整（自訂比例、版型大小、格子大小、動態字卡顯示範圍）時，升起的視窗自動收起；③在版型類別點格子／整個版型，功能列留在版型；④選到東西 250 ms 後才跳類別（避免手指放開補送的 click 落在別的按鈕）；⑤預覽高度跟專案比例（方形、橫式比較矮），編輯畫面一個螢幕高、整頁不捲，時間軸自己上下捲（軌道多時下面幾條要捲才看得到）；⑥e2e 的 `undo`／`redo` 會先收視窗、按完再把原本開著的視窗升回來；⑦預覽右上〔圖層〕清單是平的一條，每列有 ▲▼（`<軌名> 往上一層／往下一層`），沒有收合、隱藏、鎖定、更多排序

## feedback-15 第 1 批（2026-11-24）新增的東西（給下一位）
- **動態字卡停點**：`KineticDef.hold?(words)`（`engine/kinetic/core.ts`）；沒給就用 `hold.ts` 的 `HOLD_F` 比例。時間常數跟字數有關的式子一定要自己給 `hold`。新增或改動式子後跑 `e2e/kinetic-hold.spec.ts`（64 式 × 7 組文字，用 `__videoclip.kineticHoldCheck(text)`：停點那格畫兩次、只差一個字，畫面不同＝那個字有畫出來；一直在跑的式子與跳錶不檢查）。
- **版型框線**：`frameStyle.line`（整體：外框邊距＋分隔線）、`frameStyle.gap`（只有分隔線；沒設＝跟 `line` 一樣）；`applyLineScale(b, scale, gapScale?)`、`buildIn/paintFrame/renderFramePng` 最後多一個 `gap` 參數；`reshapeLayout(group, { line, gap })`（調整體粗細要一起傳 `gap: undefined`）。
- **刪軌道**：`removeTrack` 依 `groupRole` 分：member＝只刪那條、cell＝`clearCellTrack`、frame＝整個版型。
- **畫面高度**：`useAppHeight`（只在加到主畫面時把 `window.innerHeight` 寫進 `--app-h`）；`.editor`、`--stage-cap`、`.panel-sheet`、`.crop-editor` 都用 `var(--app-h, 100svh)`。升起的視窗裡 `.panel` 不留 `--safe-bottom`。
- **測試技巧**：沙盒 `--safe-bottom` 是 0；要驗 iPhone 的 Home 橫條空白，在 `addInitScript` 裡塞 `:root{--safe-bottom:34px !important}`（見 `e2e/z4-space.spec.ts`）。

## feedback-15 第 2 批（2026-11-25）新增的東西（給下一位）
- **播放列垃圾桶**：`pb-delete`（`pages/Editor.tsx`），呼叫 `removeAnyItem`；`removeAnyItem` 刪完空軌道會一起移除（最後一條非版型影像軌、格子軌除外）。注意：e2e 找「刪除」按鈕要限定在 `toolbar` 或用 testid（播放列與剪輯工具列各一顆）。
- **加進／移出版型**：`groupToJoin(project, item)`（時間有重疊的版型外框，取最上層）、`attachToGroup`、`detachFromGroup`；工具 `text.togroup`、`audio.togroup`（`GroupToggleButton`，沒有版型時不顯示）。新增文字時選到版型物件仍會自動加進版型（`addTargetGroup`），想要在外面就選到文字按〔移出版型〕。
- **各格**：`CellCards`（`editor/CellCards.tsx`）每格一張卡，testid `cell-card`／`cc-open`／`cc-add`；舊的示意圖（`LayoutDiagram`、`ld-cell`）已拿掉。e2e 的 `finishLayout` 用 `cc-open`。
- **文字特效**：只剩一個工具 `fx.textfx`（特效類別）與 `text.fx`（文字類別），同一個 `EffectTab part="textfx"` 視窗；`StyleBlock` 上面分組〔基本〕＋動態字卡 8 組（testid `kn-group-basic`／`kn-group-in`…），卡片 `tfx-card`（基本）／`kn-card`（動態）；`文字特效 無` 兩種都清。副標輸入在文字〔內容〕視窗（`kn-sub-input`，`KineticDef.subLabel`）。
- **型別檢查**：用 `npx tsc -b`（`npx tsc --noEmit -p .` 不會檢查 app 的檔案）。

