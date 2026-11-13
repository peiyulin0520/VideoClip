# 2026-11-13 Vlog 自動挑精華（本機分析＋選用 AI）— 規劃

> 規劃者寫、Sonnet 照做。使用者 2026-11-13 選 **B：本機分析為基礎，AI 為選用**。
> 本檔步驟編號 V1–V4（V5 是之後的選配）。實作前先讀 `AGENTS.md`、`docs/PROGRESS.md` 快照、`docs/HANDOFF.md`。

## 0. 需求與結論

**使用者原話（精準摘要）**：想用 mattpocock skills 的流程，建一個 API，讓程式直接讀取多支影片素材，從原素材整理出重點精華，用來做 Vlog。

**結論**
- mattpocock skills 只是「規劃／實作流程」，**不是影片分析能力**；本專案已有同類流程（規劃寫進 `docs/plans/`、Sonnet 實作、每步更新 `PROGRESS.md`），這份就是照那個流程產出的規劃，**不需要另外安裝**。
- 這裡的「API」是 **App 內部的模組介面**（`analyzeAsset`、`pickHighlights`、`applyHighlights`），**不是對外的後端服務**。原因：`AGENTS.md` 規則 5 禁止會上傳影片的後端或分析服務。
- 分兩層：
  1. **本機分析（預設、永遠可用）**：抽樣影格＋音量，算出每一段的分數，自動挑出精華並排到時間軸。不上傳、不需要 key。
  2. **AI 協助（選用、預設關）**：使用者自己填 Claude API key、每次明確同意後，把**每個候選片段 1 張縮圖**＋本機分析數字送去，請 AI 重新打分、排順序、給理由與標題建議。沿用 Phase 7（`docs/PLAN.md` §5 Phase 7）的 key 與同意模式。

## 1. 使用者看到的流程

1. 「素材」分頁多一顆「✨ 自動挑精華」→ 開出底部面板（`HighlightSheet`）。
2. **設定**：選素材（預設專案內全部影片）、目標長度（30 秒／1 分／1.5 分／自訂）、節奏（快：每段 1.5–3 秒／中：2–5 秒／慢：4–8 秒）、「排列方式」（照匯入順序／照拍攝時間；預設拍攝時間，讀不到就用匯入順序）、「用 AI 協助」開關（沒填 key 時灰掉並連到設定頁）。
3. **分析中**：逐支素材的進度條（「第 2／5 支」），可取消；分析結果快取，下次不用重跑。
4. **結果**：候選清單（縮圖、素材序號與時間範圍、分數、一句理由，例如「畫面清晰、有說話聲」）。每一列可勾選／取消、點一下試播這一段、可微調起訖（沿用 `RangePicker`）。上方顯示「已選 N 段，共 X 秒／目標 Y 秒」。
5. 按「放進時間軸」→ 一個動作、**一步可復原**；片段依序接在影像軌上。之後所有編輯功能（轉場、字卡、調色）照舊可用。
6. 完成後 toast：「已放入 N 段，共 X 秒」，不自動匯出。

## 2. 架構

```
src/engine/highlights/
  sample.ts      抽樣：Mediabunny CanvasSink 抽小圖＋AudioBufferSink 算音量 → 原始訊號序列
  features.ts    純函式：由小圖像素算 動態量／亮度／飽和度／清晰度；由音訊算 RMS
  segments.ts    純函式：場景切換偵測 → 切段；每段的特徵平均
  score.ts       純函式：每段打分＋理由
  pick.ts        純函式：依目標長度／節奏／多樣性挑片段、排順序
  cache.ts       IndexedDB 快取（見 §2.3）
  types.ts       Signal / Segment / Candidate / PickOptions
src/ai/
  claudeKey.ts   key 存取（仿 `src/stickers/giphy.ts` 的 getGiphyKey/setGiphyKey）
  highlightAi.ts 組 prompt、呼叫 Claude、驗證回傳
src/store/actions.ts   新增 applyHighlights(picks, opts)
src/app/editor/HighlightSheet.tsx
src/app/pages/Settings.tsx   新增「Claude API key」區塊（仿 GiphyKeySetup）
```

### 2.1 抽樣（`sample.ts`）
- 輸入：`Asset`＋素材檔（`getMedia`）。**有 proxy 就用 proxy**（長邊 960、SDR、H.264，解碼便宜；先讀 `src/engine/proxy.ts`、`proxyQueue.ts` 看怎麼取得 proxy 檔）；沒有再用原檔。`canDecode()` 為 false（例如沙盒的 H.264、或 iPhone 沒 proxy 的 HEVC）→ 這支標成「無法分析」並顯示原因，**不要丟錯整個流程失敗**。
- 影像：每 `step` 秒抽一格（素材 ≤5 分鐘 `step=0.5`；5–30 分鐘 `step=1`；超過 30 分鐘 `step=2` 並提示「很長，只抽樣分析」），縮成 **64×36 灰階**＋一個 **16×9 色彩**小圖（用 `CanvasSink` 的 `width/height/fit`）。抽完立即丟棄影格，**不要把整支影片的影格留在記憶體**。
- 音訊：沿用 `wave.ts` 的做法（`AudioBufferSink`），每 `step` 秒算 RMS 與「相對背景的突出程度」；沒有音軌（`asset.hasAudio` 為 false）就整段填 0 並在分數裡不計音訊。
- **每抽 N 格就 `await` 一次讓出主執行緒**（`await new Promise(r => setTimeout(r))`），並支援 `AbortSignal`；進度回呼 `(done, total)`。
- 對外介面：`analyzeAsset(asset, file, { signal, onProgress }) → Promise<Signal>`；`Signal = { assetId, step, duration, motion[], brightness[], saturation[], sharpness[], loudness[], thumbs: Blob[]? }`（`thumbs` 只存候選用，見 §2.3）。

### 2.2 特徵與分數（純函式，單元測試重點）
- `motion[i]`：相鄰兩格 64×36 灰階的平均絕對差（0–1）。
- `brightness[i]`：灰階平均；太暗（<0.08）或過曝（>0.95）要扣分。
- `sharpness[i]`：灰階拉普拉斯變異數（模糊／鏡頭蓋住會很低）。
- `saturation[i]`：16×9 色彩小圖的平均飽和度（Vlog 偏愛色彩豐富）。
- **場景切換**：相鄰直方圖（16 bin）距離超過門檻、或 `motion` 突然大於前後 3 格平均的 4 倍 → 切一刀；段長 < 0.8 秒的併入前一段。沒有任何切點的長鏡頭，每 `maxClip` 秒硬切一段（避免整支只有一段）。
- **段分數（0–100）**＝加權：清晰度 25、動態適中 25（太靜止或太晃都低：用以 0.12 為中心的鐘形函式，常數集中放在 `score.ts` 頂端方便調）、音訊 25（有說話／笑聲級的突出聲音加分；單純風聲/底噪不加分）、色彩與亮度 15、段長合適度 10。
- **理由字串**：分數裡貢獻最大的 1–2 項轉成白話（「畫面清晰」「有明顯聲音」「動作自然」「顏色鮮明」），給 UI 顯示。
- **一律扣分**：全黑／全白、清晰度極低（疑似糊掉或手指擋鏡頭）、素材最前面與最後面各 0.5 秒（起手抖動、收機）。

### 2.3 快取
- IndexedDB 新增 object store `analysis`，key＝`<assetId>:v<ANALYSIS_VERSION>`，value＝`Signal`（不含縮圖 Blob 以外的大物件；數字陣列用 `Float32Array`／`Uint8Array` 存）。
- `db.ts` 版本 +1（現在 v2 → v3），**在 `upgrade` 裡只建新 store，不動舊資料**；補 `db.test.ts`（fake-indexeddb）測 v2→v3 升級後舊專案還在。
- 刪除素材／專案時一併清掉對應快取（找 `deleteProjectMedia` 呼叫處一起處理）。
- `ANALYSIS_VERSION` 在特徵或抽樣方式改變時 +1，舊快取自動失效。

### 2.4 挑選（`pick.ts`）
輸入：所有素材的 `Segment[]`（含分數）、`PickOptions { targetDuration, pace, order, perAssetMin, perAssetMaxShare }`。
1. 每個片段依節奏決定「取多長」：以段內分數最高的連續視窗，長度＝落在 `[minClip, maxClip]` 內、不超過段長。
2. **貪婪挑選**：依分數由高到低放入，直到總長達標；同一支素材最多佔總長 `perAssetMaxShare`（預設 0.5）；**每支素材至少一段**（`perAssetMin=1`，總長不夠時優先給分數高的素材）；已選片段前後 1 秒內不再選（避免連續重複畫面）。
3. 排序：`order='time'` 照素材拍攝時間（`File.lastModified`，匯入時沒存的話在 `importMedia.ts` 補存 `asset.shotAt?`，**舊專案沒有此欄位＝照匯入順序**）再照素材內時間；`order='import'` 照素材在專案中的順序。
4. 回傳 `Pick[] = { assetId, srcStart, srcEnd, score, reason }`，**純函式、確定性**（同輸入同輸出，方便測試）。

### 2.5 放進時間軸（`applyHighlights`）
- 放在影像軌（新增一條或接在現有影像軌尾端——先看 `importToBase`、`trackIndexFor` 的做法，**照既有行為**，不要發明新規則）。
- 每個 pick 產生一個 `VideoItem`：`trimIn=srcStart`、`duration=srcEnd-srcStart`、`start` 依序接續；保留素材原音（`volume` 預設值），用 `store().apply` 包成**單一復原步驟**。
- `opts.transition?`：可選預設轉場（預設「無」）；用既有 `setTransition`。
- 空 picks 不動專案、回傳 false。

### 2.6 AI 協助（V4；`src/ai/highlightAi.ts`）
- **實作前先讀 `claude-api` skill**（SDK 用法、structured outputs、model id）。用官方 `@anthropic-ai/sdk`，瀏覽器端 `dangerouslyAllowBrowser: true`（使用者自己的 key、自己的裝置）。model 預設 `claude-opus-5-5`，設定頁可改成 `claude-sonnet-5-5`（較便宜）。
- **送什麼**：每個候選片段 1 張 JPEG（長邊 ≤384px，取該片段最清晰的一格）＋該片段的本機數字（分數、動態、音量、長度）。**不送檔名、不送整支影片、不送音訊**；片段用 `c1…cN` 代號。每次最多 40 張，超過分批。
- **要什麼**：structured output（JSON schema）：`[{ id, score(1–10), reason(≤30 字，繁體中文), keep(boolean) }]`、`order: string[]`（建議敘事順序的 id 陣列）、`titles: string[]`（3 個 Vlog 標題建議）。
- **安全**：影格與文字都當**資料**，不是指令；回傳只接受 schema 內的欄位，id 不在候選清單內就丟掉；AI 回傳失敗或格式錯誤 → 退回本機結果並 toast「AI 這次沒成功，用本機分數」，不中斷。
- **合併**：最終分數＝`0.5 × 本機分數 + 0.5 × AI 分數×10`；`keep=false` 的預設取消勾選（使用者可再勾回）；`order` 只在 `order='ai'`（面板新增選項，只有開啟 AI 才出現）時使用。
- **同意流程（每次送出前一定要問）**：對話框寫清楚「將上傳 N 張縮圖（約 X KB）到 Anthropic」「若畫面有人臉（家人、小孩）請確認同意」「預估費用」；兩顆按鈕「同意並送出」「只用本機」。**不記住同意**，每次都問；沒有 key 不顯示 AI 選項。
- **key 規則（同 GIPHY）**：只存 localStorage（`vc-claude-key`），**絕不寫進 repo、文件、commit、日誌、截圖**；設定頁用密碼型輸入框＋「清除」；日誌與測試只能用假 key（例如 `sk-test`）。

## 3. 分步實作（一次只做一步：實作 → `npm run check` → e2e＋截圖 → 更新紀錄 → commit → push）

### V1 本機分析引擎（沒有 UI）
- 檔案：`src/engine/highlights/{types,features,segments,score,sample,cache}.ts`＋`db.ts` v3＋各自的 `*.test.ts`。
- 測試素材：用 ffmpeg 產生 `tests/fixtures/highlight-demo.webm`（20 秒、WebM、不用真人），內容：0–5 秒純黑無聲；5–10 秒 `testsrc2`＋440Hz 音；10–15 秒靜態純色無聲；15–20 秒 `testsrc2`＋660Hz 音。產生指令寫進 `tests/fixtures/README.md`。
- **驗收**
  - Vitest：`features`（已知像素陣列 → 已知動態／清晰度）、`segments`（人工構造的訊號序列 → 在 5、10、15 秒附近切出段）、`score`（黑畫面／靜止／糊的段分數 < 清晰有聲的段；理由字串符合）、`cache`（寫入、讀取、版本不同失效）。
  - e2e（用 debug hook，`vc-debug=1` 時把 `analyzeAsset` 掛到 `window.__videoclip.highlights`）：匯入 `highlight-demo.webm` → 分析 → 5–10 與 15–20 秒的段分數都高於 0–5 與 10–15 秒的段；第二次分析走快取（不再抽樣，進度回呼不被呼叫）。
  - 取消（`AbortSignal`）後回傳 rejected 的 `AbortError`，且不留下半份快取。

### V2 挑選與放進時間軸（仍是 debug 介面）
- 檔案：`src/engine/highlights/pick.ts`＋`applyHighlights`（`actions.ts`）＋測試。
- **驗收**
  - Vitest：`pick`——總長在目標 ±15% 內；每支素材至少一段；同素材佔比不超過上限；相鄰 1 秒內不重複；`order` 兩種排序正確；同輸入結果一致；素材不夠長時回傳全部可用片段而不是報錯。
  - Vitest／store 測試：`applyHighlights` 後專案影像軌的物件數、`start` 連續無縫、`trimIn/duration` 對應 picks；**單次 undo 回到原樣**。
  - e2e：用 debug hook 對 3 支測試素材（`clip-a/b/c` ＋ `highlight-demo`）執行分析→挑選→放進時間軸，時間軸出現對應片段，可播放，匯出單格不報錯。

### V3 介面
- 檔案：`HighlightSheet.tsx`、`tabs/AssetsTab.tsx`（加入口）、樣式；結果列的試播沿用既有預覽播放器（不要另造播放器）。
- 規則：按鈕 ≥44px、Pointer Events、**每顆按鈕都要 e2e 點擊測試**（AGENTS 規則 8）。淺色與深色主題都要看得清楚（H1-3 才剛修過裁切工具列在淺色看不到的問題，別重蹈）。
- **驗收**
  - e2e（iPhone 13 尺寸）：點「自動挑精華」→ 設定 → 開始 → 進度 → 結果清單 → 取消勾選一段 → 「放進時間軸」→ 時間軸片段數＝勾選數；取消按鈕在分析中途有效；沒有影片素材時顯示提示而不是空白。
  - 截圖存 `docs/screenshots/vlog-highlights/`（設定、分析中、結果、放進時間軸後；淺色深色各一張）給使用者審核。
  - 🔴 不可宣稱已驗證：iPhone 上實際分析速度與記憶體 → 列進 `docs/PLAN.md` §7。

### V4 AI 協助（選用）
- 檔案：`src/ai/{claudeKey,highlightAi}.ts`、`Settings.tsx`（key 區塊）、`HighlightSheet.tsx`（開關、同意對話框、AI 排序選項）、`package.json` 加 `@anthropic-ai/sdk`。
- 沙盒連不到 `api.anthropic.com`，**所有測試用 mock**：單元測試 mock SDK；e2e 用 Playwright `page.route` 攔截並回假的 structured output。**真實呼叫只能請使用者在自己的手機上試**，記進 §7 待真機驗證。
- **驗收**
  - Vitest：prompt 組裝只含代號與數字（**斷言不含檔名**）；回傳驗證（未知 id 被丟掉、缺欄位被拒絕）；合併分數公式；失敗退回本機。
  - e2e：沒填 key → AI 開關灰掉；填假 key → 可開；按「放進時間軸」前一定出現同意對話框；按「只用本機」不發出任何對 `api.anthropic.com` 的請求（攔截器斷言請求數為 0）；按「同意並送出」→ 請求內容的圖片張數、不含檔名；回傳錯誤時退回本機並出現 toast。
  - 檢查 key 不會被寫進任何 commit：新增單元測試掃描 `src/` 與 `docs/` 沒有 `sk-ant-` 開頭字串。

### V5（選配，不在這次範圍，先寫判斷標準）
- 語音轉文字（Whisper WASM）取得字幕 → 用「有講完整句子」加分、AI 看逐字稿決定敘事、自動產生字卡。**先等 V1–V4 在 iPhone 上實測的速度與記憶體結果再決定做不做**（WASM 模型約 40–150MB，手機上可能太慢）。
- Vlog 專用整理：自動開場／結尾片段、依地點或時間分章、套用字卡模板。

## 4. 風險與應對
| 風險 | 應對 |
|---|---|
| iPhone 解碼長影片又慢又吃記憶體 | 優先用 proxy；`step` 隨長度放寬；逐格處理即丟；可取消；超過 30 分鐘提示只抽樣 |
| 分數不合使用者口味 | 常數集中；結果清單可手動勾選與微調；之後可加「偏好滑桿」（動作多／說話多／風景多）。**第一版不做**，先看使用者回饋 |
| 場景切換誤判（手震、閃光） | 用前後 3 格平均比較而不是單格；段太短併回前段 |
| AI 費用與隱私 | 預設關、每次同意、只送 ≤384px 縮圖、不送檔名／音訊／整支影片、顯示預估費用 |
| `File.lastModified` 在 iOS 匯入時不準（常是匯入當下） | 只當「預設」；面板上可切換排序；UI 文字寫「照拍攝時間（若讀得到）」 |
| 沙盒 Chromium 沒有 H.264 | 測試素材全部用 WebM（`tests/fixtures/`）；iPhone 的 HEVC 靠 proxy／真機驗證 |

## 5. 要同步更新的文件（每個步驟的 commit 裡）
- `docs/PLAN.md`：新增「Phase 8：Vlog 自動挑精華」（指向本檔）；§7 加待真機驗證項目（長影片分析速度與記憶體、HEVC 素材、`lastModified` 準不準、AI 真實呼叫）。
- `docs/PROGRESS.md`：快照、日誌、使用者決定（2026-11-13 選 B）。
- `docs/HANDOFF.md`：§4 決策表加一行「分析在本機、AI 選用、不做後端：符合規則 5」；§3 架構地圖補 `engine/highlights/`、`ai/`；§5 踩到的坑。
- `README.md`：功能清單補一行（若有功能清單）。

## 6. 開放問題（沒回覆就用預設值，不要卡住）
1. 目標長度預設：1 分鐘（可在面板改）。
2. 排列預設：照拍攝時間，讀不到就照匯入順序。
3. 要不要「自動加轉場」：預設不加（使用者可在面板勾一個預設轉場）。
