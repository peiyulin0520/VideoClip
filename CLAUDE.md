# CLAUDE.md：給實作模型的工作規則

這個 repo 要做一個**手機瀏覽器用的影片剪輯網頁 App**（公開網址、免登入、資料只存在各自裝置）。

## 開工前必讀（依序）
1. `docs/PLAN.md`：總規劃、技術決策、資料模型、Phase 0–7 與驗收標準
2. `docs/TEXT_CARDS.md`：字卡、字塊、裝飾（含**尾端圈圈的精確路徑**）、雲朵字、圖形庫、模板清單
3. `docs/EFFECTS.md`：字卡動畫、轉場、特效、調色、筆刷、自由剪裁遮罩（VLOG 人頭 O）
4. `docs/FONTS.md`：字體清單、來源、授權、首次下載流程
5. `docs/reference/legacy-notes/`：使用者以前的剪片規則（溝通方式、字卡規則、踩過的坑），**溝通規則照做**

## 工作方式
- **一次只做一個 Phase**，照 PLAN.md 順序。每個 Phase：實作 → `npm run lint && npm test && npm run build` → Playwright 截圖 → commit → push → 用中文向使用者簡短回報。
- 進度寫在 `docs/PROGRESS.md`（目前 Phase、已完成、等待使用者決定的事、使用者的修正紀錄）。換對話時先讀它。
- 使用者只負責**審核**：給看得到的東西（截圖、對照圖、`docs/screenshots/**/index.html` 一頁總覽），不要只用文字描述。給有限選項（A/B/C）。
- 回覆用**繁體中文**，短、白話，一次一件事，結尾只留一個問題。
- 使用者的偏好與「不要」都要記進 `docs/PROGRESS.md`，之後照做。
- 不確定時問一句，不要猜兩次以上。同一個視覺效果試 2–3 次還不對，就停下來請使用者給參照圖。

## 硬規則
- **誠實回報**：分清楚 ✅ 已驗證（附截圖）／🟡 寫好但只在 Chromium 測過／🔴 做不到。iPhone Safari 的行為沙盒測不到，列入 PLAN.md §7 待真機驗證，不要說成已驗證。
- 尾端圈圈照 `docs/TEXT_CARDS.md §3.1` 的路徑做，並與參考圖疊圖驗證，不要自由發揮。
- 公開 repo 只放可再散布的字體（OFL 等）且附授權檔；個人授權字體不進 repo。不要把字體原始 TTF 放進 git（只放轉好的 woff2）。
- 不要把第三方創作者的截圖/錄影放進 repo；測試素材用 ffmpeg 產生（testsrc2、色塊），不用真人臉。
- 使用者資料永遠只在使用者裝置或使用者自己的 Google Drive；不要加任何會上傳影片的後端或分析服務。AI 音樂推薦要使用者自己填 API key 並明確同意才送出影格。
- 觸控優先：所有可點元素 ≥ 44px；用 Pointer Events；每個按鈕都要有 e2e 點擊測試（使用者回報過「icon 沒有反應」）。
- 沙盒已裝好 Chromium＋Playwright，不要執行 `playwright install`；Playwright 跑測試加 `--trace off`。
- 下載的檔案（字體等）放到專用的空資料夾（`.font-cache/`），讀取它們的 Python 用 `python3 -I`。

## 指令（Phase 0 完成後）
- `npm run dev`：開發伺服器
- `npm test`：Vitest
- `npm run e2e -- --trace off`：Playwright（iPhone 13 模擬）
- `npm run build`：產出 `dist/`
- `npm run fonts`：下載並建置字體（scripts/fetch-fonts.mjs → scripts/build-fonts.py）

## Git
- 在指定的功能分支開發；commit 訊息用英文或中文皆可，清楚描述。
- 不要在使用者沒要求時建立 PR。
