# 修改規劃：選取框只留框線＋手指縮放；預覽固定夠大、其他功能往下滑

- 來源：使用者 2026-11-11 看完第 2 次修正（四角小點、時間軸精簡、預覽約 40%）後的回饋。
- 使用者原話：
  1. 「選取框一率不需要小圓點，只需要有框框可以選取字串並用手指控制縮放就行」
  2. 「預覽不要太小，如果需要其他功能，可以往下滑新增相關功能，不要擠到預覽畫面」
- 狀態：**規劃完成，尚未實作**（Opus 寫，交給 Sonnet 實作）。
- 會**取代**前一份規劃 `2026-11-11-iphone-feedback-2.md` §②裡的這幾項：四角小點、旋轉點、時間軸精簡模式、面板 25dvh 上限（那些程式都要拿掉或改掉）。保留：選取框貼著看得到的內容（`selectionBox`）、很小的物件點選範圍至少 40px、空專案匯入鈕在預覽中央、全螢幕預覽鈕。
- 順序：**① 版面（預覽固定、下面整塊可捲動）→ ② 選取框只留框線＋雙指縮放旋轉 → ③ 面板裡補「大小／旋轉」滑桿（不用手勢也能調）→ 測試、截圖、紀錄**。①② 各自 commit。

---

## 1. 現況（已查證程式）

| 項目 | 現在的做法 | 問題 |
|---|---|---|
| 版面 | `.editor` 是 `height:100dvh` 的直向 flex：頂列＋預覽（`flex:1`）＋播放列＋時間軸＋分頁＋面板。面板展開時時間軸縮成一條、面板最高 25dvh，預覽拿剩下的。 | 預覽會被下面的東西「擠小」；iPhone 13 尺寸只剩約 40%，真機（有 Safari 網址列）更小。 |
| 時間軸 | 自己有一個垂直捲動區（`viewH` 最高 140px，多條軌道要在裡面上下捲）。 | 改成整頁可往下捲後，時間軸裡再捲一次會和外層捲動打架。 |
| 選取框 | `Preview.tsx`：框線＋四個角點（`data-testid="scale-handle"`）＋旋轉點（`rotate-handle`）；雙指縮放旋轉已經有（兩個 pointer 時 `gesture.type='pinch'`）。 | 使用者不要任何圓點。 |
| 雙指 | 只有在**已經選取**物件時，第二根手指落下才開始縮放；兩根手指都要落在舞台內。 | 物件很小時兩指很難都放在框裡——現在的程式其實不要求落在框裡（只要在舞台內），這點要保留並測試。 |

## 2. 要改的事

### ① 版面：預覽固定大小，其他功能放在下面「往下滑」

1. **編輯器分成兩區**（`src/app/pages/Editor.tsx`、`src/app/styles.css`）：
   - **上區（固定，不捲動）**：頂列（返回／名稱／比例／復原／重做）＋預覽＋播放列（播放鈕、時間）。
   - **下區（可上下捲動）**：時間軸 → 分頁列（剪輯／疊加／文字／圖層）→ 目前分頁的面板內容（**不設最高高度**，內容多就往下捲）。
   - 實作：`.editor { display:flex; flex-direction:column; height:100svh }`；上區 `flex:none`；下區 `.ed-scroll { flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch }`。
2. **預覽高度固定，不隨面板開合改變**：
   - 預覽區高度 = `clamp(300px, 56svh, 720px)`（用 `svh` 不用 `dvh`：Safari 網址列伸縮時 `dvh` 會變，預覽會跟著抖動）。橫式／方形專案寬度先撐滿，高度依比例算，不超過上述值。
   - 拿掉「面板展開→預覽變小」的所有邏輯：`compactTimeline`（`uiStore`、`Toolbar.tsx` 的 effect、`Timeline.tsx` 的 `compact`）、`.panel.tall { max-height }`、`.panel { max-height: 26dvh }`、`.panel.scroll`。
   - 分頁列點目前的分頁「收合／展開」的行為保留（收合＝下區變短，預覽**不變**）。
3. **時間軸不再自己上下捲**：高度＝全部軌道的內容高度（`contentH`），水平仍可滑動（`touch-action: pan-x`，垂直交給外層捲動）。拿掉「選到的軌道自動捲進可視範圍」那段垂直捲動（改成外層捲動區把那一列捲到看得到，用 `scrollIntoView({block:'nearest'})`）。
4. **分頁列黏在下區頂端**（`position: sticky; top: 0`）：捲到面板深處時，分頁列仍在，切分頁不用捲回去。切換分頁時下區捲回分頁列的位置（`scrollTo`），不要停在一半。
5. **字卡面板內的子分頁列**（文字／版面／字塊／描邊陰影／裝飾／＋新增）：改成黏在主分頁列下面（`top: 分頁列高度`），一起固定。
6. 全螢幕預覽鈕保留：按下時隱藏下區，預覽用掉整個螢幕。
7. 匯入中、toast、底部彈出面板（`Sheet`）不受影響；確認 `Sheet` 蓋在下區上面（z-index）。
8. iPhone 注意：下區內的 `<input type=range>` 水平拖曳和外層垂直捲動要能分開（`touch-action: pan-y` 給捲動區，range 本身 `touch-action: none` 或保持預設；真機驗證列入 PLAN §7）。

### ② 選取框：只有框線，用手指縮放

1. **拿掉四角小點與旋轉點**（`Preview.tsx` 的 `handles`、`onHandleDown`、`.sel-dot` 樣式、`data-testid="scale-handle"`/`rotate-handle`）。選取框只剩一個細框（1.5px 白＋1px 黑外圈，物件旋轉時框跟著轉）。
2. **手勢**（沿用現有程式，補強）：
   - 單指點物件＝選取；單指拖＝移動（吸附、安全區參考線照舊）。
   - **雙指＝縮放＋旋轉**：只要有物件被選取，兩根手指放在**預覽任何地方**都能縮放旋轉它（不需要兩指都在框內）。沒有選取時，第二根手指落下 → 以兩指中點 `topHit` 選取最上面的物件（主軌除外）再開始縮放。
   - 雙指時也顯示安全區參考線（現在已有 `setDragging(true)`）、旋轉吸附 0/90/180/270（目前雙指沒有吸附 → 改成用 `snapRotation`）。
   - 一次雙指手勢＝一步復原（`setTransform` 加 coalesce key `pinch:<id>`；現在雙指沒有 coalesce，會產生很多步）。
   - iOS Safari：在舞台上 `gesturestart`/`gesturechange` 呼叫 `preventDefault()`，避免雙指變成整頁縮放（`touch-action:none` 之外的保險）。
3. 主軌從時間軸選取時，預覽上也只有細框（滿版），雙指可放大裁切（現在的行為保留）。

### ③ 面板裡的「大小／旋轉」（不用手勢也能精準調，也給測試用）

- 在**圖層**分頁的屬性區（`LayersTab`，對所有選取的物件）最上面加：「大小」滑桿（5%–400%，對應 `transform.scale`）、「旋轉」滑桿（−180°～180°，步進 1°）、「置中」按鈕（x=0.5, y=0.5）、「轉正」按鈕（rotation=0）。文字面板「版面」子分頁也放同樣的「大小」「旋轉」（同一個元件）。
- 拖滑桿 coalesce 成一步復原。

## 3. 會動到的檔案

- `src/app/pages/Editor.tsx`（上下兩區）、`src/app/styles.css`（`.editor`、`.ed-fixed`、`.ed-scroll`、`.stage-wrap` 高度、sticky 分頁列、刪掉 `.panel` 的 max-height、`.sel-dot`、`.timeline` 高度）
- `src/app/editor/Preview.tsx`（拿掉角點／旋轉點；雙指補強：沒選取時選取、吸附、coalesce、gesture 事件）
- `src/app/editor/Timeline.tsx`（拿掉 compact 與內部垂直捲動、高度＝內容）
- `src/app/editor/Toolbar.tsx`（拿掉 compact effect；`LayersTab` 加大小/旋轉/置中/轉正）、`src/app/editor/TextPanel.tsx`（版面加大小/旋轉；子分頁 sticky 位置）
- `src/store/uiStore.ts`（拿掉 `compactTimeline`）
- 測試：
  - 新 `e2e/helpers.ts` 的 `pinch(page, {cx, cy, from, to, angle})`：用 CDP `Input.dispatchTouchEvent` 送兩點觸控（Chromium 會轉成 pointer 事件），供所有需要縮放旋轉的測試用。
  - 要改的既有測試：`phase2.spec.ts`「預覽上的選取框…」（角點/旋轉點 → 雙指）、`fix-safe-zone.spec.ts`（`scale-handle` 數量 → 改驗沒有圓點）、`fix-preview-size.spec.ts`（精簡時間軸、角點、40% → 改成新版面的檢查）、`phase2.spec.ts`「底部分頁：點目前的分頁會收合面板，預覽畫面變大」→ 改成「收合面板，**預覽大小不變**」。**改測試，不要刪測試**。

## 4. 驗收（截圖放 `docs/screenshots/preview-first/`）

- [ ] iPhone 13 尺寸（390×664）：預覽高度 ≥ **55%** 螢幕高（9:16 專案），在剪輯／疊加／文字／圖層每個分頁、面板展開或收合、選取文字前後，**預覽大小都一樣**（e2e 量 `stage` 的 boundingBox，誤差 ≤ 1px）。
- [ ] 下區可以往下捲：文字面板內容超過一屏時 `scrollHeight > clientHeight`，捲到最下面點得到最後一個控制項（例如「刪除」或裝飾的最後一個滑桿）；分頁列在捲動時一直看得到。
- [ ] 多條軌道時，時間軸全部列都顯示（沒有內部垂直捲動），往下捲就看得到。
- [ ] 選取框沒有任何圓點（`.sel-dot` 數量 0），只有框線。
- [ ] 雙指（CDP 兩點觸控）：選取中的文字可放大縮小、旋轉（吸附到 90°），一次手勢＝一步復原；兩指在框外也有效；沒選取時雙指會選到中點下的物件。
- [ ] 圖層分頁／版面子分頁的「大小」「旋轉」「置中」「轉正」可用。
- [ ] 全螢幕預覽仍可用。
- [ ] `npm run check`、`npm run e2e -- --trace off` 全過（整套連跑 2 次）。
- 🔴 真機（列入 `docs/PLAN.md §7`）：雙指縮放不會變成整頁縮放；下區捲動和滑桿、時間軸水平滑動不打架；Safari 網址列伸縮時預覽不抖。

## 5. 回覆使用者時要說的（白話）

- 預覽固定在上面，大約佔螢幕一半多，不管打開什麼設定都不會變小；其他功能都在下面，往下滑就看得到。
- 選取文字只會有一個框，沒有任何圓點；兩根手指放在畫面上就能放大縮小、旋轉。想精準調也可以用「圖層」裡的「大小」「旋轉」滑桿。
