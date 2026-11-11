# 進度（給接手的人／AI：先讀這份最上面的「交接快照」）

規則：每完成一個有意義的步驟，就在同一個 commit 裡 **覆寫「交接快照」** 並 **在「日誌」最上面新增一筆**（規則全文見 `AGENTS.md`「紀錄規則」，背景與架構見 `docs/HANDOFF.md`）。

## 交接快照（最新狀態，每次覆寫）
- **日期**：2026-11-11
- **分支**：`claude/zen-tesla-v3brj5`（Phase 1–3B 已在 `main`；這個分支多了「使用者第一次 iPhone 實測回報」的 4 項修正，**還沒合併到 main，所以上線網址還是舊版**）
- **最後一個程式 commit**：見 `git log -1`（修正 C：縮圖）；前面有修正 D（自動比例）、A+B（安全區／主軌選取）
- **測試**：53 個單元測試、33 個 e2e（iPhone 13 尺寸、Chromium）、lint、build 全過
- **階段**：Phase 0 ✅、1 ✅、2 ✅、3B ✅、**實測修正 A/B/C/D ✅（Chromium 驗證，iPhone 待真機）**；Phase 3A（字卡引擎）尚未開始；Phase 4–7 未開始
- **下一步**：使用者決定要不要先把這 4 項修正合併到 main（才會更新上線網址、讓他在 iPhone 重測）→ 再做 Phase 3A 字卡引擎（拆法見 `docs/HANDOFF.md §6`）
- **等使用者的事**
  - 缺檔字體：LINE Seed 繁中（3 檔，下載中斷）、致一宋體（下載中斷，授權還沒讀）、佮逸體（還沒給檔）。放到 `.font-cache/user/<manifest 的 file 路徑>`（見 `docs/FONTS.md §4`）
  - 用 iPhone 實測（清單在 `docs/PLAN.md §7`），特別是這次的 A/B/C/D：粉紅線是否消失、主軌白框是否消失、時間軸縮圖是否出現、直拍影片自動比例是否為 9:16
  - Phase 6 前：建立 Google Cloud OAuth Client ID 與 API key（屆時帶步驟）
- **目前沒有進行到一半的修改**（工作目錄乾淨、已 push）

## 日誌格式（新增一筆時照這個）
```
- YYYY-MM-DD <一句話標題>（分支/commit）
  - 做了什麼：…
  - 動了哪些檔：…（重點檔案/資料夾）
  - 驗證：✅ …（測試/截圖路徑）  🟡 只在 Chromium：…  🔴 沒做/做不到：…
  - 使用者的決定/回饋：…（原話或精準摘要）
  - 踩到的坑：…（同步補到 docs/HANDOFF.md §5）
  - 下一步：…
```

## 使用者已確認的偏好
- 新專案比例預設「自動：跟第一支影片一樣」，但之後可以調整修改（2026-11-11 使用者選 A：「跟第一支影片一樣，但保留之後影片可以調整修改」；先前誤記為 B）
- **每次的進度都要記錄成檔案，之後可以用 ChatGPT 等其他 AI 直接讀檔無縫接手**（2026-11-11 使用者要求）→ 見 AGENTS.md「紀錄規則」
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

## 使用者的修正紀錄（時間順序）
- 2026-11-11 iPhone 實測回報：「預覽畫面中會有粉色斜底區塊，不懂那個意思，是因為我前面選了尺寸 9:16？但不是應該影片要直接 match 整個黑框比較好嗎，多了一個粉底還需要手動縮小調整很麻煩」→ 原因是平台安全區參考線（預設開）＋主軌被選取時的選取框；修改規劃見 docs/plans/2026-11-11-safe-zone-and-selection.md。另從截圖看到：iPhone 上時間軸片段沒有縮圖
- 2026-11-11 要求把每次進度都記錄下來，供其他 AI（如 ChatGPT）銜接 → 新增 AGENTS.md、docs/HANDOFF.md、交接快照與日誌格式
- 2026-11-11 選 B：先做字體下載＋首次使用精靈，再做字卡引擎
- 2026-11-11 找到新字體來源 max32002/pop-gothic（大波浪圓體，含注音）→ 已加入手寫可愛包。問「能不能直接下載到我的 files 下載資料夾」→ 答：網頁在 iPhone 不能自動寫進「檔案」App 資料夾；官方字體存在瀏覽器裡，自己的字體用「匯入字體檔」從檔案 App 選

## 日誌（最新在最上面）
- 2026-11-11 實作 4 項實測修正 A/B/C/D（分支 claude/zen-tesla-v3brj5，Sonnet）
  - 做了什麼：
    - D 自動比例：新專案預設「自動（跟第一支影片）」；比例多 3:4、4:3；編輯器頂列「畫面比例」按鈕（可復原、可切回自動）；空白專案第一次匯入主軌時自動決定；字卡大小/外框改跟短邊（`uiScale`）；改比例時預覽重建並回到原播放時間
    - A 安全區：預設關（新 key `vc-safe-zone-v2`）、拖移/縮放時自動出現、虛線＋標籤「IG／抖音按鈕區」、按鈕有「安全區」字、打開時 toast 說明
    - B 主軌：匯入後不自動選、預覽單點不選不拖、從時間軸選才有細框、沒有 ✕、保留縮放鈕；疊加物件照舊
    - C 縮圖：匯入用 Mediabunny `CanvasSink`，失敗退回 `<video>`，再失敗由預覽播放器拿到畫面後補一張（`setAssetThumbs`，不進復原）；沒縮圖時時間軸顯示檔名
  - 動了哪些檔：src/model/{types,defaults}.ts（+defaults.test.ts）、src/store/{actions,projectStore}.ts、src/engine/{probe,player,scene,compositor,textRender,geometry}.ts、src/app/editor/{Preview,Timeline}.tsx、src/app/pages/{Home,Editor}.tsx、styles.css、e2e/{fix-aspect,fix-safe-zone,fix-thumbs}.spec.ts、phase2.spec.ts（點角落改成不選取）
  - 驗證：✅ 53 單元＋33 e2e 全過；截圖在 docs/screenshots/fix-safe-zone/；✅ 模擬「iPhone 行為」（沒有 VideoDecoder、probe 的 `<video>` 聽不到 loadeddata）時，播放器會補上縮圖，重新整理後仍在；✅ Chromium 下 Mediabunny 路徑有效（匯入 0.4 秒完成，沒有等 8 秒）  🟡 Chromium：以上全部  🔴 沒驗證：iPhone Safari 的 WebCodecs/HEVC 解碼、直拍 .mov 的自動比例、觸控手感（列進 PLAN §7）
  - 使用者的決定/回饋：選 A（4 項一起做）；比例「A 跟第一支影片一樣，但保留之後可以調整」
  - 踩到的坑：Pixi destroy 後不能在同一個 canvas 重建 WebGL（頁面卡死）→ 比例改變用 `key` 換新 canvas；e2e 要等 `__videoclip` 出現；模擬 iOS 時要用 `webkit-playsinline` 屬性區分「探測用 video」與「影片池 video」
  - 下一步：使用者決定是否合併到 main 以便 iPhone 重測；之後 Phase 3A
- 2026-11-11 補完自動比例（§2-D）的實作規劃＋存草稿 patch（分支 claude/zen-tesla-v3brj5，只有文件）
  - 做了什麼：中斷前寫好的 D 程式草稿存成 （草稿 patch 已套用並刪除），程式還原（使用者要的是規劃，實作交給 Sonnet）。規劃 §2-D 加「實作細節」：草稿涵蓋範圍、還缺的 3 件事、e2e 清單、已知行為
  - 動了哪些檔：docs/plans/2026-11-11-safe-zone-and-selection.md、docs/plans/2026-11-11-aspect-auto-draft.patch（新）、docs/PLAN.md §7、docs/HANDOFF.md §4
  - 驗證：✅ 草稿 `tsc -b` 通過、`defaults.test.ts` 12 個單元測試通過  🔴 草稿沒跑 lint／e2e
  - 使用者的決定/回饋：「A跟第一支影片一樣，但保留之後影片可以調整修改，根據這個做相關規劃」
  - 踩到的坑：字卡大小現在用「畫面寬 ÷ 1080」，改成 16:9 時字會放大 1.78 倍 → 規劃建議改用短邊
  - 下一步：照規劃實作 D → A → B → C
- 2026-11-11 更正：新專案比例使用者選 A（自動跟第一支影片，之後可改）。先前因為使用者誤解選項而記成 B（不做）；已更新規劃 §2-D 與偏好。程式未改。
- 2026-11-11 使用者回覆修改規劃 §2-D：選 B（不做自動比例）。已更新規劃與偏好；程式未改。下一步不變：照規劃實作 A→B→C
- 2026-11-11 寫修改規劃：粉紅安全區、主軌選取框、iPhone 縮圖（分支 claude/zen-tesla-v3brj5，只有文件）
  - 做了什麼：依使用者實測截圖查程式，確認粉紅斜線是預設開啟的「平台安全區參考線」（Preview.tsx 的 readSafe 預設開）、白框與 ✕ 是主軌選取框（匯入後自動選取＋點預覽一定打到主軌）、灰色片段是 iPhone 上 `<video>` 沒觸發 loadeddata 所以 probe 沒產生縮圖。寫成可照做的規劃（原因表、要改的事、檔案、驗收、要調整的既有測試、回覆使用者的話）。
  - 動了哪些檔：新增 docs/plans/2026-11-11-safe-zone-and-selection.md；docs/PROGRESS.md
  - 驗證：只有文件；程式未改
  - 使用者的決定/回饋：要求先寫規劃，之後用 Sonnet 實作
  - 下一步：照規劃實作（A 安全區 → B 主軌選取 → C 縮圖）；D 自動比例要做（使用者選 A，細節在規劃 §2-D）
- 2026-11-11 Phase 1–3B 合併上線（PR #2，分支 claude/zen-tesla-v3brj5 → main）
  - 做了什麼：開 PR #2；GitHub 上的 build 檢查成功；使用者合併；`main` 的 CI & Deploy（run #8）成功，GitHub Pages 已部署；取消 PR 訂閱；分支用 fast-forward 對齊 main。
  - 驗證：✅ 部署流程第一次在 main 跑成功（PLAN.md §7 原本的「部署尚未實際執行」已解除）；🟡 網站在 iPhone 上的實際表現還沒人測
  - 使用者的決定/回饋：選 A（合併上線）、訂閱 PR
  - 踩到的坑：自動模式會擋 `git push --force`；PR 合併後要對齊 main 時，用 `git merge --ff-only origin/main` 再一般 push 就好，不用強制推送
  - 下一步：等使用者手機實測回報；沒有回報前可以先做 Phase 3A（字卡引擎）
- 2026-11-11 建立交接文件，讓其他 AI 只讀檔案就能接手（分支 claude/zen-tesla-v3brj5）
  - 做了什麼：新增 `AGENTS.md`（所有 AI 共用的規則、指令、紀錄規則）、`docs/HANDOFF.md`（使用者與合作方式、需求與決定的時間順序、架構地圖、資料流、決策與原因、踩過的坑、Phase 3A 的具體拆法、驗證方式）；`CLAUDE.md` 改成指向 AGENTS.md ＋ 沙盒補充；`docs/PROGRESS.md` 加「交接快照」（每次覆寫）和「日誌格式」；`package.json` 加 `npm run check`（lint＋測試＋build）。
  - 動了哪些檔：AGENTS.md、CLAUDE.md、README.md、docs/HANDOFF.md、docs/PROGRESS.md、package.json
  - 驗證：✅ `npm run check` 通過（只動文件與一行 script，程式沒變）
  - 使用者的決定/回饋：要求每次進度都記成檔案，供 ChatGPT 等接手
  - 下一步：等使用者選（合併上線／繼續 Phase 3A／補字體檔）
- 2026-11-11 Phase 3B（字體）完成：
  - ✅ 字體管線：fetch（下載/核對 sha256/使用者提供的檔案）→ build（裁切成繁體常用字集 woff2、授權檔、預覽字樣、覆蓋率）；39 個字體約 130 MB 進 public/fonts。
  - ✅ 授權把關：讀字型檔 name table。Proper Script（All rights reserved）、星光小熊貓（禁止上傳散布）、851 手書き雜（無授權說明）→ 不放網站，只能自己匯入；字言手繪體（不可改作）→ 原檔照放；其他 OFL → 裁切並改內部名稱。
  - ✅ 首次使用精靈 3 步（第一次嗎／備份位置／下載字體包）；設定頁（字體包下載移除、我的字體、授權與來源、備份位置、儲存空間）；字卡分頁字體選單（用各自字形顯示、標示大小/缺字）；匯入自己的字體；首頁「還沒下載字體」提醒。
  - ✅ 測試：catalog 檢查（檔案存在/大小/授權）、sfnt 名稱讀取、Drive 網址解析；5 個 e2e（精靈全流程＋重新整理不再問、設定頁、換字體畫面真的變、匯入字體、首頁提醒）。截圖 docs/screenshots/phase3b/。
  - 🟡 只在 Chromium 驗證：Cache Storage 在 iPhone Safari 的行為與配額；`new FontFace(ArrayBuffer)` 載入 3–6 MB 的 CJK 字體在手機的速度與記憶體（用到才載、預覽字樣只有幾 KB）。
  - 🔴 未做：備份/還原本身（精靈只記下選擇，Phase 6 做）；罕用字（閩南語/客語）未收進網站；匯入字體沒算繁體覆蓋率；單線手寫（Hershey）動畫。
  - 測試時抓到：編輯後立刻重新整理（<0.8 秒）會丟掉最後一步（自動儲存 800ms）→ 測試改成等 1.2 秒；真實使用中離開頁面有 pagehide/visibilitychange 立刻存，但瀏覽器在重新整理時不保證 IndexedDB 寫入完成。
- 2026-11-11 Phase 2 完成（分支 claude/zen-tesla-v3brj5）：
  - ✅ 渲染改用 PixiJS 合成器（預覽與單格匯出共用 buildScene + Compositor）；每個影片物件各用一個 <video>（池 6 個，下一個片段/1 秒內要出現的疊加影片會預載）。
  - ✅ 多軌：主軌＋疊加軌＋文字軌；同一秒可疊多支影片（各佔一條軌道）；軌道順序＝圖層順序；軌道選單（隱藏、鎖定、靜音、上下移、刪除）。
  - ✅ 預覽選取框：點選最上層物件、拖移（吸附中心線/畫面邊緣/平台安全區）、右上角圓鈕縮放＋旋轉（轉到 45° 倍數會吸附）、左上角刪除鈕；雙指縮放旋轉（程式寫好）；安全區參考線可開關。
  - ✅ 圖層分頁：列出這一秒的圖層（含隱藏的）、顯示/隱藏/鎖定/上下移；選取圖層的透明度、混合模式（正常、色彩加深、濾色、覆蓋、加亮）、圓角、外框、裁切；位置大小歸位。
  - ✅ 疊加素材：長按左右拖曳移動時間（吸附播放頭與其他物件邊緣、不會和同軌重疊）、修剪頭尾。
  - ✅ 最小版文字（只有一段文字、顏色、大小、系統字體）：為了驗收「3 支影片＋1 個字卡」。完整字卡在 Phase 3。
  - ✅ 驗收：3 支純色影片＋1 個文字疊在同一秒，換順序後預覽顏色正確；匯出單格（1080×1920 PNG）與預覽在 5 個取樣點顏色一致；17 個 e2e、32 個單元測試、lint、build 都過。截圖在 docs/screenshots/phase2/。
  - 測試用除錯掛鉤：localStorage 的 vc-debug 設成 1 才會有 window.__videoclip（取樣預覽顏色、讀專案 JSON、匯出單格）。正常使用者看不到。
  - 修掉的真 bug：圖層分頁一開始不列出隱藏軌道的物件，隱藏後就沒辦法再打開 → 改成列出全部；Pixi 單格輸出尺寸會差 1px 且內容超出畫面時會位移 → 明確指定輸出範圍；外框 alignment 方向（1＝內側）。
  - 🟡 只在 Chromium 驗證：雙指縮放/旋轉預覽物件；時間軸雙指縮放；多個 <video> 同時播放（iOS 對同時解碼的影片數量與播放解鎖有限制，池子大小 6 可能要降）；混合模式在 Safari 的效果；Pixi 在 iPhone 的效能與記憶體。
  - 🔴/未做（刻意留到之後）：文字完整功能（字體、字塊、裝飾、動畫）→ Phase 3；疊加素材在不同軌道間垂直拖曳（現在只能在同一軌左右移動，換軌用圖層面板的上下移動作用在整條軌道）；拖曳排序/移動到畫面邊緣時不會自動捲動；點兩下文字直接編輯；關鍵影格；匯出整支影片。
  - 版面：iPhone 13 尺寸（高 664px）下，展開底部面板時預覽畫面偏小 → 點目前的分頁可收合面板；真機高度較高會好一些，請使用者回報是否還太擠。
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
