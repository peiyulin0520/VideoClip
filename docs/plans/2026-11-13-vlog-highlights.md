# 2026-11-13 Vlog 自動挑精華（本機分析＋選用 AI）— 規劃

> 規劃者寫、Sonnet 照做。使用者 2026-11-13 選 **B：本機分析為基礎，AI 為選用**。
> **2026-11-13 更新：AI 改用 Google Gemini 的免費額度**（使用者要求；原本寫的是 Claude）。本檔步驟編號 V1–V4（V5 是之後的選配）。實作前先讀 `AGENTS.md`、`docs/PROGRESS.md` 快照、`docs/HANDOFF.md`。

## 0. 需求與結論

**使用者原話（精準摘要）**：想用 mattpocock skills 的流程，建一個 API，讓程式直接讀取多支影片素材，從原素材整理出重點精華，用來做 Vlog。

**結論**
- mattpocock skills 只是「規劃／實作流程」，**不是影片分析能力**；本專案已有同類流程（規劃寫進 `docs/plans/`、Sonnet 實作、每步更新 `PROGRESS.md`），這份就是照那個流程產出的規劃，**不需要另外安裝**。
- 這裡的「API」是 **App 內部的模組介面**（`analyzeAsset`、`pickHighlights`、`applyHighlights`），**不是對外的後端服務**。原因：`AGENTS.md` 規則 5 禁止會上傳影片的後端或分析服務。
- 分兩層：
  1. **本機分析（預設、永遠可用）**：抽樣影格＋音量，算出每一段的分數，自動挑出精華並排到時間軸。不上傳、不需要 key。
  2. **AI 協助（選用、預設關）**：使用者自己填 **Gemini API key（Google AI Studio 免費申請）**、每次明確同意後，把**每個候選片段 1 張縮圖**＋本機分析數字送去，請 AI 重新打分、排順序、給理由與標題建議。沿用 Phase 7（`docs/PLAN.md` §5 Phase 7）的 key 與同意模式。**免費額度的資料會被 Google 拿來改進產品、人工審核員可能看到內容**（§2.6 有對應做法）；Phase 7 原本寫的 Claude 路線改成之後選配。

## 1. 使用者看到的流程

1. 「素材」分頁多一顆「✨ 自動挑精華」→ 開出底部面板（`HighlightSheet`）。
2. **設定**：選素材（預設專案內全部影片；每支可點 ⭐ 標「一定要放」）、**影片類型**（說話型／旅行風景／美食生活／活動運動／綜合）、目標長度（30 秒／1 分／1.5 分／自訂）、節奏（快：每段 1.5–3 秒／中：2–5 秒／慢：4–8 秒）、「排列方式」（照匯入順序／照拍攝時間；預設拍攝時間，讀不到就用匯入順序）、「用 AI 協助」開關（沒填 key 時灰掉並連到設定頁）。
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
  aiKey.ts       key 存取（仿 `src/stickers/giphy.ts` 的 getGiphyKey/setGiphyKey）
  provider.ts    介面 `HighlightAiProvider`（之後要換 Claude 或別家只要多寫一個實作）
  gemini.ts      Gemini 實作（直接 `fetch` REST，不加 SDK 套件）
  highlightAi.ts 組 prompt、呼叫 provider、驗證回傳、合併分數
src/store/actions.ts   新增 applyHighlights(picks, opts)
src/app/editor/HighlightSheet.tsx
src/app/pages/Settings.tsx   新增「Gemini API key」區塊（含申請說明）（仿 GiphyKeySetup）
```

### 2.1 抽樣（`sample.ts`）
- 輸入：`Asset`＋素材檔（`getMedia`）。**有 proxy 就用 proxy**（長邊 960、SDR、H.264，解碼便宜；先讀 `src/engine/proxy.ts`、`proxyQueue.ts` 看怎麼取得 proxy 檔）；沒有再用原檔。`canDecode()` 為 false（例如沙盒的 H.264、或 iPhone 沒 proxy 的 HEVC）→ 這支標成「無法分析」並顯示原因，**不要丟錯整個流程失敗**。
- 影像：每 `step` 秒抽一格（素材 ≤5 分鐘 `step=0.5`；5–30 分鐘 `step=1`；超過 30 分鐘 `step=2` 並提示「很長，只抽樣分析」），縮成 **64×36 灰階**＋一個 **16×9 色彩**小圖（用 `CanvasSink` 的 `width/height/fit`）。抽完立即丟棄影格，**不要把整支影片的影格留在記憶體**。
- 音訊：沿用 `wave.ts` 的做法（`AudioBufferSink`），每 `step` 秒算 RMS 與「相對背景的突出程度」；沒有音軌（`asset.hasAudio` 為 false）就整段填 0 並在分數裡不計音訊。
- **每抽 N 格就 `await` 一次讓出主執行緒**（`await new Promise(r => setTimeout(r))`），並支援 `AbortSignal`；進度回呼 `(done, total)`。
- 對外介面：`analyzeAsset(asset, file, { signal, onProgress }) → Promise<Signal>`；`Signal = { assetId, step, duration, motion[], brightness[], saturation[], sharpness[], loudness[], thumbs: Blob[]? }`（`thumbs` 只存候選用，見 §2.3）。

### 2.2 規則：怎麼判斷哪些畫面重要（純函式，單元測試重點）

> **先講實話**：規則判斷得準的是「**畫面好不好用**」（清晰、穩、有聲音、不重複）；判斷不了的是「**內容有沒有意義**」（那是蛋糕、那是誰的生日、這句話好笑）。所以規則分三層：**A 把壞的擋掉 → B 替好的加分 → C 結構與使用者偏好**。內容有沒有意義，靠使用者 ⭐ 標記，或選用的 AI。

**每個時間點算的原始特徵**（`features.ts`）

| 特徵 | 算法（64×36 灰階＋16×9 色彩小圖＋音訊） |
|---|---|
| `sharpness` | 灰階拉普拉斯變異數（糊、對焦中、手指擋鏡頭都很低） |
| `exposure` | 灰階平均與直方圖兩端比例（全黑、過曝、逆光剪影） |
| `globalMotion` | 整個畫面一起平移的量（區塊比對相鄰兩格，取眾數位移）＝鏡頭在動 |
| `localMotion` | 扣掉整體位移後剩下的差異＝**畫面裡有東西在動**（人走過、動物、水、車） |
| `shake` | `globalMotion` 在短時間內方向來回正負交替的程度（手震）；一路往同一方向＝平穩橫移（pan），不算手震 |
| `saliency` | 中心與邊緣的亮度／顏色對比（中心比邊緣明顯＝有主體；整片均勻＝牆壁、天空、地板） |
| `colorfulness` | 飽和度與色相分布（Hasler–Süsstrunk 色彩度） |
| `speech` | 音訊在 300–3400Hz 人聲頻帶的能量比例，加上能量起伏（有音節節奏），長度 ≥0.6 秒才算一段「有人說話」 |
| `peak` | 短時間音量突然升高並高於前後 2 秒平均 2 倍以上（笑聲、歡呼、驚呼、撞擊） |
| `silenceGap` | 音量低於本支素材底噪＋6dB 的小段（≥0.25 秒）＝句子與句子之間，**用來決定從哪裡切** |

**A. 擋掉壞畫面（任何一條成立 → 該段分數直接乘 0.2，理由顯示「已排除：…」，使用者仍可手動勾回）**
- A1 全黑／全白／過曝（`exposure` 兩端）。
- A2 糊掉：`sharpness` 低於本支素材中位數的 35%（用相對值，夜景整體偏糊不會全軍覆沒）。
- A3 手震：`shake` 高且持續 >0.8 秒。
- A4 鏡頭被擋：畫面幾乎單色且 `sharpness` 近 0（手指、口袋）。
- A5 素材最前 0.5 秒、最後 0.5 秒（起手抖動、按停止的動作）。
- A6 太短：段長 < 1 秒。

**B. 加分（每項 0–1，乘上權重；權重由「影片類型」預設決定，見 C1）**
- B1 **清晰穩定**：`sharpness` 高且 `shake` 低。
- B2 **有主體在動**：`localMotion` 適中（鐘形函式：太靜 <0.03 沒故事、太亂 >0.35 看不懂；中心 0.12）。
- B3 **平穩運鏡**：`globalMotion` 方向一致且平順（推、拉、橫移）＝刻意拍的鏡頭，加分。
- B4 **有人說話**：`speech` 段 ≥1.5 秒加分；連續講完一整句（前後都有 `silenceGap`）再加。
- B5 **情緒高點**：`peak`（笑聲、歡呼）附近 ±1.5 秒。
- B6 **有主體**：`saliency` 高。
- B7 **顏色好看**：`colorfulness` 高、曝光在中間。
- B8 **拍很久的鏡頭可能重要**：素材比同專案其他素材長很多（>中位數 2 倍），整支素材分數 +5%；很短的（<3 秒）−5%。**這是弱訊號，權重刻意小。**

**C. 結構與使用者偏好**
- C1 **影片類型預設**（面板上的下拉，改變 B 的權重，常數表放在 `score.ts` 頂端）：
  - 「說話型」（B4 ×2、B5 ×1.5、B6 ×1.5、B3 ×0.5）：講話、訪談、日常碎念。
  - 「旅行／風景」（B3 ×2、B7 ×2、B1 ×1.5、B4 ×0.3）。
  - 「美食／生活」（B7 ×1.5、B6 ×2、B2 ×1.5）。
  - 「活動／運動」（B2 ×2、B5 ×2、B3 ×0.5）。
  - 「綜合」（預設，全部 ×1）。
- C2 **使用者 ⭐**：在素材清單與結果清單都可以標「一定要放」。⭐ 素材：該素材分數最高的一段一定入選；⭐ 片段：一定入選。這是**唯一能表達「內容重要」的規則**。
- C3 **切點規則**：每段的起訖點優先吸附到最近的 `silenceGap` 中點（不切在句子中間），其次吸附到場景切換點；沒有就維持原本的點。起點往前留 0.2 秒、終點往後留 0.3 秒（呼吸感）。
- C4 **去重**：兩段的 16×9 色彩直方圖相似度 > 0.9 且來自同一支素材（連續拍同一景），只留分數最高的一段；不同素材相似也只降權 30%（可能是不同角度）。
- C5 **敘事結構**（只影響排序與入選，不改分數）：
  - **開場**：優先選全體中「有人說話」或「顏色／主體分數最高」的一段，放最前面（可在面板關掉）。
  - **中段**：依拍攝時間；`colorfulness` 或亮度分布和前一段差異很大（換地點）時，讓換景處優先入選，避免同一地點佔掉全部。
  - **高潮**：`peak` 最高的一段放在 60–75% 的位置。
  - **結尾**：最後一支素材的最後一個好段落，優先選較慢（`localMotion` 低）、較暖（色相偏橙）的一段。
- **理由字串**：貢獻最大的 1–2 項轉成白話（「畫面清楚又穩」「有人在說話」「有笑聲」「運鏡平順」「顏色鮮明」「⭐ 你標記的」），給 UI 顯示。
- **場景切換**：相鄰直方圖（16 bin）距離超過門檻、或 `localMotion` 突然大於前後 3 格平均的 4 倍 → 切一刀；段長 < 0.8 秒的併入前一段。沒有任何切點的長鏡頭，每 `maxClip` 秒硬切一段。
- **段分數（0–100）**＝ A 的乘數 × （B 各項加權平均 × 100 ＋ 段長合適度 5 分）。常數集中放 `score.ts`，**不要散在別的檔**，之後調口味只改一處。

**這些規則做不到的（寫進 UI 說明，別讓使用者誤會）**
- 認不出人臉、人物是誰、食物是什麼、地標。
- 聽不懂說了什麼（只知道「有人在說話」）。
- 不知道哪一刻對使用者有紀念意義 → 用 ⭐，或選用 AI。
- （V5 選配）人臉偵測：瀏覽器內建的 `FaceDetector` 只有部分 Chrome 有、Safari 沒有，**不能依賴**；要做就得內建小型模型（例如 BlazeFace，約 0.2–1MB，仍在本機跑、不上傳），等 V1–V4 在 iPhone 實測後再決定。

### 2.3 快取
- IndexedDB 新增 object store `analysis`，key＝`<assetId>:v<ANALYSIS_VERSION>`，value＝`Signal`（不含縮圖 Blob 以外的大物件；數字陣列用 `Float32Array`／`Uint8Array` 存）。
- `db.ts` 版本 +1（現在 v2 → v3），**在 `upgrade` 裡只建新 store，不動舊資料**；補 `db.test.ts`（fake-indexeddb）測 v2→v3 升級後舊專案還在。
- 刪除素材／專案時一併清掉對應快取（找 `deleteProjectMedia` 呼叫處一起處理）。
- `ANALYSIS_VERSION` 在特徵或抽樣方式改變時 +1，舊快取自動失效。

### 2.4 挑選（`pick.ts`）
輸入：所有素材的 `Segment[]`（含分數）、`PickOptions { targetDuration, pace, order, perAssetMin, perAssetMaxShare }`。
1. 每個片段依節奏決定「取多長」：以段內分數最高的連續視窗，長度＝落在 `[minClip, maxClip]` 內、不超過段長。
2. **貪婪挑選**：依分數由高到低放入，直到總長達標；同一支素材最多佔總長 `perAssetMaxShare`（預設 0.5）；**每支素材至少一段**（`perAssetMin=1`，總長不夠時優先給分數高的素材）；已選片段前後 1 秒內不再選（避免連續重複畫面）。
3. **套用 §2.2 C 的規則**：⭐ 先入選、切點吸附、去重、開場／高潮／結尾位置；`PickOptions` 多兩個欄位 `preset`（影片類型）與 `starred: { assets: string[], segments: string[] }`。
4. 排序：`order='time'` 照素材拍攝時間（`File.lastModified`，匯入時沒存的話在 `importMedia.ts` 補存 `asset.shotAt?`，**舊專案沒有此欄位＝照匯入順序**）再照素材內時間；`order='import'` 照素材在專案中的順序。
5. 回傳 `Pick[] = { assetId, srcStart, srcEnd, score, reason }`，**純函式、確定性**（同輸入同輸出，方便測試）。

### 2.5 放進時間軸（`applyHighlights`）
- 放在影像軌（新增一條或接在現有影像軌尾端——先看 `importToBase`、`trackIndexFor` 的做法，**照既有行為**，不要發明新規則）。
- 每個 pick 產生一個 `VideoItem`：`trimIn=srcStart`、`duration=srcEnd-srcStart`、`start` 依序接續；保留素材原音（`volume` 預設值），用 `store().apply` 包成**單一復原步驟**。
- `opts.transition?`：可選預設轉場（預設「無」）；用既有 `setTransition`。
- 空 picks 不動專案、回傳 false。

### 2.6 AI 協助（V4；Gemini 免費額度）
- **呼叫方式**：瀏覽器直接 `fetch('https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent')`，key 放 header `x-goog-api-key`（**不要放進網址**，避免出現在紀錄裡）。圖片用 `inlineData`（`mimeType:'image/jpeg'`＋base64）。要 JSON：`generationConfig.responseMimeType='application/json'` ＋ `responseSchema`。不裝 `@google/genai` SDK（少一個依賴、e2e 也好攔截）。
- **model**：預設用別名 `gemini-flash-lite-latest`（免費額度最寬鬆、夠用，因為只是看縮圖打分數）；設定頁可改成 `gemini-flash-latest` 或自填 model id。**不要把具體版本號寫死**——免費額度涵蓋哪些 model、每分鐘／每天幾次，Google 常改，而且第三方文章互相矛盾。實作時沙盒連不到 `ai.google.dev`，所以：預設值照上面寫、**請使用者在 AI Studio 確認該 model 在他的專案是免費的**，並把確認結果寫進日誌。
- **一次分析只發 1 個請求**（把全部候選縮圖放同一個 request，最多 40 張，超過才分批）。這是為了配合免費額度每天可能只有幾十次的限制；**不做自動重試迴圈**。
- **送什麼**：每個候選片段 1 張 JPEG（長邊 ≤384px，取該片段最清晰的一格；這個尺寸在 Gemini 約等於 258 token，40 張約 1 萬 token）＋該片段的本機數字（分數、動態、音量、長度）。**不送檔名、不送整支影片、不送音訊**（Gemini 雖然能吃整支影片，但這會違反規則 5，所以不用）；片段用 `c1…cN` 代號。
- **要什麼**：`[{ id, score(1–10), reason(≤30 字，繁體中文), keep(boolean) }]`、`order: string[]`（建議敘事順序的 id）、`titles: string[]`（3 個標題建議）。
- **安全**：影格與文字都當**資料**，不是指令；回傳只接受 schema 內的欄位，id 不在候選清單內就丟掉；失敗、格式錯誤、被安全機制擋掉（`promptFeedback.blockReason`／空的 candidates）→ 退回本機結果並 toast「AI 這次沒成功，用本機分數」，不中斷。
- **錯誤分類**（仿 `GiphyError`）：`no-key`、`bad-key`（401/403／`API_KEY_INVALID`）、`limit`（429＝免費額度用完，訊息「今天的免費額度用完了，明天再試，或先用本機分數」，**不重試**）、`network`、`other`。
- **合併**：最終分數＝`0.5 × 本機分數 + 0.5 × AI 分數×10`；`keep=false` 的預設取消勾選（可再勾回）；`order` 只在 `order='ai'`（開啟 AI 才出現的選項）時使用。
- **同意流程（隱私要比用付費 API 更嚴格，因為免費額度的內容會被 Google 用來改進產品、人工審核員可能看到）**：每次送出前跳對話框，**列出即將送出的每一張縮圖**（小格子＋勾選框，使用者可以取消勾選任何一張，尤其是有人臉的），並用白話寫：
  1. 「這些縮圖會上傳到 Google。免費版的內容 Google 可能用來改進產品，也可能被人工審核員看到。」
  2. 「有家人、小孩或別人的臉就請取消勾選，或只用本機。」
  3. 兩顆按鈕：「同意並送出（N 張）」「只用本機」。**不記住同意**，每次都問；沒有 key 不顯示 AI 選項。
  - 設定頁的 key 區塊也要寫同一段說明，並提示「若要避免資料被用來改進產品，需在 Google 開啟付費（結帳）專案」。
  - 備註：Google 條款對歐盟／英國／瑞士使用者的 API 客戶端要求用付費服務；本 App 是每個人用**自己的** key，但設定頁仍加一行提醒，住在這些地區的人請自行確認。
- **key 規則（同 GIPHY）**：只存 localStorage（`vc-gemini-key`），**絕不寫進 repo、文件、commit、日誌、截圖**；設定頁用密碼型輸入框＋「清除」；申請說明照 GIPHY 那種步驟（開 aistudio.google.com/apikey → 登入 → 建立 API key → 複製貼上）；日誌與測試只能用假 key（例如 `test-key`）。

## 3. 分步實作（一次只做一步：實作 → `npm run check` → e2e＋截圖 → 更新紀錄 → commit → push）

### V1 本機分析引擎（沒有 UI）
- 檔案：`src/engine/highlights/{types,features,segments,score,sample,cache}.ts`＋`db.ts` v3＋各自的 `*.test.ts`。
- 測試素材：用 ffmpeg 產生 `tests/fixtures/highlight-demo.webm`（20 秒、WebM、不用真人），內容：0–5 秒純黑無聲；5–10 秒 `testsrc2`＋440Hz 音；10–15 秒靜態純色無聲；15–20 秒 `testsrc2`＋660Hz 音。產生指令寫進 `tests/fixtures/README.md`。
- **驗收**
  - Vitest：**規則逐條測**——A1–A6 各有一個「壞」的合成訊號，斷言該段分數 <20% 且理由含「已排除」；B1–B8 各有一個合成訊號，斷言該項分數單調（越符合越高）；`shake` 區分「來回抖」與「一路橫移」；`speech` 區分人聲頻帶音與白噪音；`silenceGap` 找得到句間空隙；C3 切點確實吸附到靜音中點；C4 相似段被去重。
  - Vitest：`features`（已知像素陣列 → 已知動態／清晰度）、`segments`（人工構造的訊號序列 → 在 5、10、15 秒附近切出段）、`score`（黑畫面／靜止／糊的段分數 < 清晰有聲的段；理由字串符合）、`cache`（寫入、讀取、版本不同失效）。
  - e2e（用 debug hook，`vc-debug=1` 時把 `analyzeAsset` 掛到 `window.__videoclip.highlights`）：匯入 `highlight-demo.webm` → 分析 → 5–10 與 15–20 秒的段分數都高於 0–5 與 10–15 秒的段；第二次分析走快取（不再抽樣，進度回呼不被呼叫）。
  - 取消（`AbortSignal`）後回傳 rejected 的 `AbortError`，且不留下半份快取。

### V2 挑選與放進時間軸（仍是 debug 介面）
- 檔案：`src/engine/highlights/pick.ts`＋`applyHighlights`（`actions.ts`）＋測試。
- **驗收**
  - Vitest：`preset` 不同（說話型 vs 旅行風景）對同一組段落挑出不同結果；⭐ 素材與 ⭐ 片段一定入選；開場／高潮／結尾位置符合 C5；`pick`——總長在目標 ±15% 內；每支素材至少一段；同素材佔比不超過上限；相鄰 1 秒內不重複；`order` 兩種排序正確；同輸入結果一致；素材不夠長時回傳全部可用片段而不是報錯。
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
- 檔案：`src/ai/{aiKey,provider,gemini,highlightAi}.ts`、`Settings.tsx`（key 區塊）、`HighlightSheet.tsx`（開關、同意對話框含縮圖勾選、AI 排序選項）。**不新增套件**。
- 沙盒連不到 `generativelanguage.googleapis.com`，**所有測試用 mock**：單元測試 mock `fetch`；e2e 用 Playwright `page.route` 攔截並回假的 Gemini 回應格式（含 `candidates[0].content.parts[0].text` 是 JSON 字串）。**真實呼叫只能請使用者在自己的手機上試**，記進 §7 待真機驗證。
- **驗收**
  - Vitest：請求組裝只含代號與數字（**斷言不含檔名**）；`responseSchema` 欄位正確；錯誤分類（401/403/429/網路/被擋）；回傳驗證（未知 id 被丟掉、缺欄位被拒絕）；合併分數公式；失敗退回本機。
  - e2e：沒填 key → AI 開關灰掉；填假 key → 可開；送出前一定出現同意對話框並列出縮圖；取消勾選 2 張 → 請求裡的圖片少 2 張；按「只用本機」不發出任何對 `generativelanguage.googleapis.com` 的請求（攔截器斷言請求數為 0）；按「同意並送出」→ 只發 **1 個**請求、header 有 key、網址**沒有** key、內容不含檔名；回 429 → 顯示「免費額度用完」且**沒有第二個請求**；回其他錯誤時退回本機並出現 toast。
  - 檢查 key 不會被寫進任何 commit：新增單元測試掃描 `src/`、`docs/`、`e2e/` 沒有 Google API key 格式的字串（`AIza` 開頭加 35 個字元）。

### V5（選配，不在這次範圍，先寫判斷標準）
- 語音轉文字（Whisper WASM）取得字幕 → 用「有講完整句子」加分、AI 看逐字稿決定敘事、自動產生字卡。**先等 V1–V4 在 iPhone 上實測的速度與記憶體結果再決定做不做**（WASM 模型約 40–150MB，手機上可能太慢）。
- Vlog 專用整理：自動開場／結尾片段、依地點或時間分章、套用字卡模板。

## 4. 風險與應對
| 風險 | 應對 |
|---|---|
| iPhone 解碼長影片又慢又吃記憶體 | 優先用 proxy；`step` 隨長度放寬；逐格處理即丟；可取消；超過 30 分鐘提示只抽樣 |
| 分數不合使用者口味 | 常數集中在 `score.ts`；影片類型預設（C1）；⭐ 標記（C2）；結果清單可手動勾選與微調；每段顯示理由方便使用者回報「為什麼選這段／漏掉那段」，之後只調常數 |
| 規則看不懂內容意義 | UI 明說做不到什麼；⭐ 補不足；選用 AI 補內容判斷 |
| 場景切換誤判（手震、閃光） | 用前後 3 格平均比較而不是單格；段太短併回前段 |
| AI 隱私（免費額度的內容會被 Google 用來改進產品、可能被人工審核） | 預設關、每次同意、同意視窗列出每張縮圖並可取消勾選、只送 ≤384px 縮圖、不送檔名／音訊／整支影片、提醒有人臉就別送 |
| 免費額度很小且常變、model 名稱會變 | 一次分析只發 1 個請求、不重試、429 就退回本機；model 用 `-latest` 別名且設定頁可改；不寫死額度數字 |
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
