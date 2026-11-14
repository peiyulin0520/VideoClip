# 轉場播放卡卡的、不夠絲滑（T1–T5）— 2026-11-14

- 使用者原話：「兩影片銜接處的特效播放會卡卡的，不夠絲滑的轉場。」（之前 feedback-9 補充 1 也提過，I2 做過一輪：提早預載、B 停在提前出現的那一格、模糊降品質。）
- 狀態：**規劃完成，尚未實作**（Opus 規劃，Sonnet 實作）。
- 下面的原因是**讀程式碼找到的**（`engine/transitions.ts` 的 `activeTransition`、`engine/player.ts` 的 `syncVideo`／`driftPlan`／預載），還沒在 iPhone 上量過；T5 會加量測，讓使用者截圖回報確認。

## 找到的原因（依可能性排序）

1. **A 的素材用完時會「從頭播又跳回來」（最可能，常見）**：接縫後 A 要延長 `after` 秒（用出點之後的畫面）。如果 A 已經用到素材的最後（最常見：整支影片放進來沒修剪），`sourceTimeClamped` 把目標時間夾在結尾前 0.05 秒，可是影片元素播到結尾會變成 `ended`、`paused`，`syncVideo` 每一格看到 `paused` 就呼叫 `play()`——**ended 的影片 `play()` 會從 0 秒重新播**——下一格對時差太多又 seek 回結尾 → 一直在「從頭播／跳回結尾」之間來回，畫面一閃一閃、卡住。
2. **B 的入點是 0（沒有修剪開頭，最常見）時，前半段 B 完全不出現**：B 要提前 `before` 秒出現，需要入點之前的畫面；入點是 0 就退不了，`activeTransition` 讓 B 在接縫前是 `null` → 疊化這類效果前半段只有 A、到接縫時 B **突然以一半的透明度跳出來**，看起來是「頓一下」而不是慢慢融入。
3. **B 等到轉場開始才 `play()`**：B 預載時停在提前出現的那一格（暫停），轉場開始那一格才呼叫 `play()`；iPhone 的 `play()` 要 0.1～0.3 秒才真的開始動 → B 先凍住、接著差距超過 `HARD_DRIFT` 又被硬 seek（seek 又要等解碼）→ 轉場前段卡兩次。
4. **兩支影片同時解碼**：轉場期間 A、B 同時播；如果還沒有「預覽用輕量影片」（iPhone 的 4K／HEVC 原檔），兩支原檔同時解碼很吃力。
5. （次要）轉場期間每一格重畫裁切遮罩、模糊濾鏡；已經降過品質，先不動，等 T5 量測再說。

## 做法

### T1. 素材用完就停在最後一格（修原因 1）
- 新的純函式 `videoSyncPlan({ target, current, assetDuration, playing, transitioning, speed, ios })` → `{ action: 'play' | 'pause' | 'hold', seekTo?: number, rate }`（放 `engine/player.ts` 或新 `engine/videoSync.ts`，單元測試）：
  - `target ≥ assetDuration − 0.06`（要的畫面在素材最後）→ **hold**：暫停、停在最後一格（必要時 seek 一次到 `assetDuration − 0.05`），**絕對不呼叫 `play()`**。
  - 元素 `ended` 時同樣 hold。
  - 其他情況照現在的 `driftPlan`。
- `syncVideo` 改用它。

### T2. B 的入點不夠時，先停在第一格淡入（修原因 2）
- `activeTransition`：B 退不到 `before` 秒時，**仍然從 `cut − before` 就出現**，`back` 不夠的那段用「B 的第一格」頂著（虛擬物件 `start = cut − before`、`trimIn` 照能退的退、加 `holdUntil = B.start − back/speed`）。
- `Player`：物件有 `holdUntil` 且 `t < holdUntil` → 暫停在 `trimIn` 那一格（不播）；過了才開始播（T3 的暖機一起考慮）。
- 對稱：A 的素材不夠延長時（原因 1）就是 T1 的「停在最後一格」，不用另外做。
- 匯出（`exporter`／`exportFrame`）走同一個 `activeTransition` → `sourceTimeClamped` 已經會夾在第一格／最後一格，畫面跟預覽一致。

### T3. B 提早暖機、轉場中不硬 seek（修原因 3）
- 預載：B 在「轉場開始前 0.4 秒」就**靜音開始播**，起點設成 `轉場開始時要的素材秒數 − 0.4 × speed`（夠的話；不夠就從 `trimIn` 起播並套 T2 的 hold），到轉場開始時剛好播到對的位置、已經在動。
- 轉場期間（`activeTransition` 有值）`HARD_DRIFT` 放寬到 0.6 秒、不做硬 seek；iPhone 平常不微調播放速度（避免解碼卡），**轉場期間例外允許 ±8% 微調**追上（只到差距小於 `SOFT_DRIFT` 就恢復 1 倍）。
- 轉場結束後恢復原本的對時規則。

### T4. 轉場期間的解碼負擔（修原因 4）
- 轉場的 A、B 有輕量影片就一定用輕量影片（現在播放時已經優先用 proxy；確認預載的 B 也用 proxy 網址，不要預載原檔再換）。
- 兩支都是大檔（長邊 >1920 或 HEVC/HDR）而且 proxy 還沒好：轉場期間自動用流暢預覽（480），並提示一次「預覽檔做好之後轉場會更順」。

### T5. 量測（確認在 iPhone 上真的變順）
- 效能框（設定頁可以打開的那個）加：最近一次轉場的「掉格數（兩格間隔 >50ms 的次數）」「硬 seek 次數」「B 開始動的延遲（ms）」。
- 請使用者在 iPhone 播一次轉場後截圖效能框回報；如果掉格數還是高，再看是不是原因 5（濾鏡）。

## 驗收
- 單元：`videoSyncPlan`（素材最後→hold、不 play；ended→hold；平常照 driftPlan；轉場中放寬硬 seek、iPhone 轉場中允許微調）；`activeTransition` 在 B 入點 0 時前半段仍有 B（holdUntil 正確）、A 延長超過素材時目標時間夾在最後一格。
- e2e：
  1. 兩支 4 秒純色影片（都沒修剪，入點 0、用到結尾）、疊化 1 秒：接縫前 0.3 秒已經是紅綠混色（B 用第一格淡入，不是只有 A）；接縫後 0.3 秒也是混色（A 停在最後一格）；這段時間連取 10 格，顏色單調變化（不會忽紅忽綠＝沒有來回跳）。
  2. A 延長時影片元素不會從頭播：用除錯掛鉤記錄 A 的 `<video>` 在轉場中 `currentTime` 都 ≥ 3.5 秒（不會跳回 0）。
  3. 單格輸出接縫前 0.3 秒，跟預覽同一點顏色一樣。
- 真機：效能框數字＋使用者主觀感受。

## 會動到的檔案
- `src/engine/player.ts`（`syncVideo`、預載暖機、轉場中的對時規則、效能框數字）、可能新 `src/engine/videoSync.ts`（＋test）
- `src/engine/transitions.ts`（`activeTransition` 的 `holdUntil`）、`src/engine/transitions.test.ts`
- `src/app/editor/*` 效能框顯示的地方（找 `videoInfo`／效能框元件）
- `e2e/` 新 `t-smooth.spec.ts`；既有 `g5.spec.ts`、`i2.spec.ts` 的轉場測試要照舊通過（i2 的「接縫前後每個取樣點都有畫面」會更嚴格地通過）
- 文件：`docs/PROGRESS.md`、`docs/PLAN.md §7`、`docs/HANDOFF.md`

## 跟調色（J1–J3）的順序
兩份規劃互不相依。建議**先做這份（T1–T5）**：是現有功能的毛病、改動集中在播放引擎；調色之後再做。
