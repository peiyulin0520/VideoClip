# AGENTS.md — 給任何 AI／工程師的接手說明（Claude、ChatGPT/Codex、Gemini、人都適用）

這個 repo 是一個**手機瀏覽器用的影片剪輯網頁 App**（公開網址、免登入、資料只存在各自的裝置）。
使用者是繁體中文使用者，用 iPhone，只負責**審核**（看截圖、實測），不寫程式。

> **接手的第一件事（照順序）**
> 1. 讀 `docs/PROGRESS.md` 最上面的「交接快照」：現在做到哪、下一步是什麼、在等使用者什麼。
> 2. 讀 `docs/HANDOFF.md`：架構地圖、決策與原因、踩過的坑、下一步的具體做法。
> 3. 要做哪個功能，再讀 `docs/PLAN.md`（總規劃與驗收）＋對應的規格：字卡 `docs/TEXT_CARDS.md`、動畫/轉場/調色/筆刷/遮罩 `docs/EFFECTS.md`、字體 `docs/FONTS.md`。
> 4. `npm ci && npm run check && npm run e2e -- --trace off` 確認一開始是綠的，再動手。

## 指令
| 指令 | 用途 |
|---|---|
| `npm ci` | 安裝（Node 22） |
| `npm run dev` | 開發伺服器（`--host`） |
| `npm run check` | lint ＋ 單元測試 ＋ build（每次提交前必跑） |
| `npm test` | Vitest 單元測試 |
| `npm run e2e -- --trace off` | Playwright（iPhone 13 尺寸、Chromium；會先 build 再開 preview） |
| `npm run fonts:setup` / `npm run fonts` | 字體管線（一次性建 `.venv`／下載＋裁切＋產生目錄）。一般改程式**不用**重跑，成品已 commit |

## 一定要遵守的規則
1. **進度要記在檔案裡，不能只留在對話裡**（見下一節「紀錄規則」）。這是使用者明確要求的，目的是讓別的 AI 可以無縫接手。
2. **一次只做一個階段（Phase）或一個明確的子任務**；每個階段：實作 → `npm run check` → e2e＋截圖 → 更新紀錄 → commit → push → 用中文簡短回報。
3. **誠實回報**：✅ 已驗證（附截圖/測試）／🟡 寫好但只在 Chromium 驗證／🔴 做不到或沒做。**iPhone Safari 的行為沒有人能在沙盒測**（沒有 WebKit），一律列進 `docs/PLAN.md` §7「待真機驗證」，不要說成已驗證。
4. 回覆使用者用**繁體中文，短、白話、一次一件事**，結尾只留一個問題並給 A/B/C 選項。給**看得到的東西**（截圖、對照圖），不要只用文字描述。不確定就問一句，同一個視覺效果試 2–3 次不對就停下來請使用者給參考圖。
5. **使用者資料永遠只在使用者的裝置或他自己的 Google Drive**；不加任何會上傳影片的後端或分析服務。AI 音樂推薦（Phase 7）要使用者自己填 API key、明確同意才送影格。
6. **字體授權要讀字型檔本身**（name table 的 nameID 0/13/14），不要只信「都是開源」。公開 repo 只放可再散布的字體（OFL 等）＋授權檔；不允許散布的只能讓使用者自己「匯入字體」。細節與目前名單見 `docs/FONTS.md`。
7. 不放第三方創作者的截圖/錄影進 repo；測試素材用 ffmpeg 產生，不用真人臉。
8. **觸控優先**：可點元素 ≥ 44px、用 Pointer Events、每個按鈕都要有 e2e 點擊測試（使用者回報過「icon 沒有反應」）。
9. 尾端圈圈（字卡裝飾）照 `docs/TEXT_CARDS.md §3.1` 的路徑，並跟參考圖疊圖驗證，不要自由發揮。
10. 不要在使用者沒要求時開 PR；在指定的功能分支開發（目前 `claude/zen-tesla-v3brj5`）。`main` 才會觸發 GitHub Pages 部署。

## 紀錄規則（每次都做）
**每完成一個有意義的步驟（不是只有每個 Phase 結束），在同一個 commit 裡更新：**
- `docs/PROGRESS.md`
  - 最上面的「交接快照」（分支、最後 commit、測試數量、現在做到哪、下一步、等使用者的事）→ **覆寫**成最新狀態。
  - 「日誌」→ **在最上面新增**一筆（格式見該檔「日誌格式」）：做了什麼、動了哪些檔、怎麼驗證、哪些沒驗證、下一步、踩到的坑。
  - 使用者說的決定、偏好、更正 → 原話或精準摘要，記進「使用者已確認的偏好」或「使用者的修正紀錄」（附日期）。
- 規格或決策改了 → 同步改 `docs/PLAN.md` / `TEXT_CARDS.md` / `EFFECTS.md` / `FONTS.md`，並在 `docs/HANDOFF.md` 的「決策與原因」補一行。
- 新的坑 → 記進 `docs/HANDOFF.md` 的「踩過的坑」。
- 結束前確認：已 `git push`、工作目錄乾淨、紀錄和程式一致。**交接時別的 AI 只會看到檔案，看不到你的對話。**

## 技術棧（一句話版）
Vite 8 · React 18 · TypeScript 5.9（別升 7：typescript-eslint 不支援）· Zustand + immer · PixiJS 8（WebGL 合成，預覽與匯出共用）· idb（IndexedDB）· OPFS（素材檔）· Cache Storage（字體）· Mediabunny（讀影片資訊；之後做匯出）· vite-plugin-pwa · Vitest 5 · Playwright 1.63（要與沙盒 Chromium 版本一致）。部署：GitHub Pages（`/VideoClip/`，HashRouter）。

## 測試用旗標（localStorage）
- `vc-skip-onboarding=1`：不顯示首次使用精靈（`e2e/helpers.ts` 的 `createProjectWith` 會設）。
- `vc-debug=1`：掛出 `window.__videoclip`（讀專案 JSON、取樣預覽顏色、算畫面雜湊、匯出單格）。一般使用者看不到。
