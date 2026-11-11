# 進度

（換對話時從這裡接。每完成一步或收到使用者的決定，就更新。）

## 目前
- 階段：Phase 1 完成（2026-11-11，等使用者用手機實測）。下一步 Phase 2：圖層系統＋選取變形
- 規劃文件：docs/PLAN.md、docs/TEXT_CARDS.md、docs/EFFECTS.md、docs/FONTS.md

## 等使用者的事
- Phase 1 要用 iPhone 實測（見 PLAN.md §7 新增的 Phase 1 項目）：匯入手機影片（含 .mov/HEVC）、播放與跨片段聲音、長按拖曳排序、雙指縮放時間軸、重新整理後專案還在
- Phase 0 部署：功能分支只跑檢查與建置，**要 merge 到 main 才會部署到 GitHub Pages**。請使用者決定何時要開 PR / merge（我不會自己開）
- Phase 0：請使用者到 repo Settings → Pages → Source 選「GitHub Actions」
- Phase 3 開始時：請使用者上傳 6 款沒有下載網址的字體檔（佮逸體、LINE Seed TW、中規中矩體、星光小熊貓幼兒體、字言字型手繪體、致一宋體），見 docs/FONTS.md §4
- Phase 6 前：建立 Google Cloud OAuth Client ID 與 API key（屆時帶步驟）

## 使用者已確認的偏好
- 字體選擇用下拉式選單，放在字卡頁籤
- 字卡/icon 選取時右上角有縮放（調大小）鈕，可拖移位置
- 字塊內距上下左右可分開調（修正字上方色塊多、下方貼底）
- 尾端圈圈照參考圖 docs/reference/tail-loop-underline.jpg
- 雲朵字不必很蓬鬆，有那個效果即可
- VLOG 效果：底層完整影片 → 中層文字 V L G → 上層只保留人頭的影片（使用者自己描邊剪裁/擦除），不是自動去背
- Office 圖案指方塊、雲朵、對話框等素材，可當字卡底塊
- 調色功能做在 App 裡
- 佮逸體可放字庫（非商業使用）
- 要更多可愛字卡設計
- 網站放免費 GitHub Pages，repo 已改為公開（2026-11-11）
- 字體用使用者提供的清單（fonts/manifest.json）；使用者表示都是開源資源，非商業使用、不改版
- 「星光手體」＝星光小熊貓幼兒體；「中規中矩體」＝Proper Script；Zizi「一致宋體」＝致一宋體
- 首次使用就讓每個人選專案備份位置：「存在手機檔案」或「存到 Google 雲端」（可貼 Drive 資料夾網址，或登入後在選擇器裡找資料夾）；之後可在設定頁改（2026-11-11 使用者確認：照 PLAN.md 的流程做）
- 備份資料夾保持私人；只貼網址不登入無法寫入（Google 限制），已向使用者說明

## 使用者的修正紀錄
- （尚無）

## 日誌
- 2026-11-11 Phase 1 完成（分支 claude/zen-tesla-v3brj5）：
  - ✅ 專案管理（新增選比例、改名、複製、刪除）、多影片/照片匯入（OPFS，無法寫入時退回 IndexedDB）、主軌拼接、點選/修剪頭尾/分割/複製/刪除/前後移/長按拖曳排序/變速 0.25–4x/音量/填滿↔完整、復原重做（上限 100，拖滑桿合併成一步）、自動儲存（800ms；離開編輯器立即存）、預覽雙 <video> 預載跨片段播放。
  - ✅ lint、14 個單元測試（時間軸函式、復原堆疊）、10 個 e2e（iPhone 13 模擬，Chromium，WebM 測試素材）通過。截圖在 docs/screenshots/phase1/。e2e 抓到並修掉一個真 bug：離開編輯器時的存檔可能比首頁讀取晚，首頁會顯示舊資料 → 儲存層改成「寫入排隊、讀取等寫入」。
  - 🟡 只在 Chromium 驗證：雙指縮放時間軸（程式寫好，e2e 沒測）、iOS 播放解鎖第二個 <video>、HEVC/H.264（沙盒 Chromium 沒有 H.264，測試用 WebM）。
  - 🔴/未做（刻意留到之後）：拖曳排序時靠近邊緣不會自動捲動（片段很多時請先縮小時間軸）；修剪時預覽畫格用 peek（沒移動播放頭）；匯出（Phase 2 後）；點預覽畫面不會暫停/播放；專案 .zip 匯出（Phase 6）。
  - 套件：npm audit 有 1 個 moderate（vite-plugin-pwa → workbox-build → deepmerge），只在建置階段，不會進到網站；等上游更新。
- 2026-11-11 Phase 0 完成：Vite 8 + React 18 + TS 5.9（typescript-eslint 不支援 TS 6.1 以上，故不用 TS 7）+ Vitest 5 + Playwright 1.63（要與沙盒 Chromium 版本一致）。✅ lint、2 個單元測試、build（含 PWA）、2 個 e2e（iPhone 13 模擬，Chromium）通過；截圖 docs/screenshots/phase0/home.png。🟡 iPhone Safari 與「加入主畫面」沒測（沙盒沒有 WebKit）。deploy.yml 寫好但尚未實際跑過（要 merge 到 main 才會觸發）。
- 2026-11-11 整理使用者的字體下載紀錄成 fonts/manifest.json（78 檔，52 檔放進網站），更新 FONTS.md
- 2026-11-11 加入「首次使用選備份位置」到 PLAN.md（Phase 3 精靈、Phase 6）
- 2026-11-11 完成規劃文件；尾端圈圈路徑已與參考圖疊圖校準（docs/reference/tail-loop-calibration.png）
