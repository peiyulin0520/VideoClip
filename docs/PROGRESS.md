# 進度

（換對話時從這裡接。每完成一步或收到使用者的決定，就更新。）

## 目前
- 階段：Phase 0 完成（2026-11-11），下一步 Phase 1：專案管理＋多影片拼接
- 規劃文件：docs/PLAN.md、docs/TEXT_CARDS.md、docs/EFFECTS.md、docs/FONTS.md

## 等使用者的事
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
- 2026-11-11 Phase 0 完成：Vite 8 + React 18 + TS 5.9（typescript-eslint 不支援 TS 6.1 以上，故不用 TS 7）+ Vitest 5 + Playwright 1.63（要與沙盒 Chromium 版本一致）。✅ lint、2 個單元測試、build（含 PWA）、2 個 e2e（iPhone 13 模擬，Chromium）通過；截圖 docs/screenshots/phase0/home.png。🟡 iPhone Safari 與「加入主畫面」沒測（沙盒沒有 WebKit）。deploy.yml 寫好但尚未實際跑過（要 merge 到 main 才會觸發）。
- 2026-11-11 整理使用者的字體下載紀錄成 fonts/manifest.json（78 檔，52 檔放進網站），更新 FONTS.md
- 2026-11-11 加入「首次使用選備份位置」到 PLAN.md（Phase 3 精靈、Phase 6）
- 2026-11-11 完成規劃文件；尾端圈圈路徑已與參考圖疊圖校準（docs/reference/tail-loop-calibration.png）
