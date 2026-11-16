# 文字特效 64 式（動態字卡）（2026-11-16，Opus 規劃，Sonnet 實作）

## 使用者原話（2026-11-16）
> 然後文字特效幫我加連接中的64種：https://pound0423.github.io/claude-animated-text/

## 來源
- 專案：「字會動 64 式（Animated Text）」，作者 pound（POUND0423），**MIT 授權**（可用、可改，要保留版權與授權文字）。
- 單一 HTML 檔：`index.html`（1563 行、110,365 bytes，2026-11-16 的 `main`），沒有任何套件。
- 沙盒連不到 `github.io`，但連得到 `raw.githubusercontent.com`：
  - `https://raw.githubusercontent.com/pound0423/claude-animated-text/main/index.html`
  - `https://raw.githubusercontent.com/pound0423/claude-animated-text/main/LICENSE`
  - `https://raw.githubusercontent.com/pound0423/claude-animated-text/main/README.md`（64 式一覽：編號、id、中英文名、預設長度）
- 結構：`const FX=[…]` 64 筆，每筆 `{ id, g(組), zh, en, desc, use, scheme(預設底色), words(範例字), poster(代表畫面的秒數), make(root, words) }`。`make` 建 DOM 元素、回傳 `t => { …改 style… }`（時間 → 畫面），長度單位用 container query（`cqmin`／`cqw`），共用工具：`clamp lerp seg E(緩動) keys(關鍵格) mq(跑馬燈) fit(字大小) rnd(固定亂數) pick setChars`。
- 8 組各 8 式：

| 組 | id（依序） |
|---|---|
| 登場 in | burst hit stamp punch stack stretch through squash |
| 流動 flow | crawl drift echo slant path ticker depth tape |
| 切換 swap | flap flip type slot odo swapline led split |
| 強調 em | glitch marker shake neon bob track fill focus |
| 空間 sp | cube crawl3d orbit tunnel scatter extrude blinds block |
| 歌詞 MV mv | kara popsync dual beat soft lyrics trail mix |
| 綜藝字卡 tv | vpop slam lines marks telop emph bouncy star |
| 恐怖片 hr | flick drip creep ghost corrupt mirror torch melt |

- 用到比較難的畫法（照原碼掃出來的，實作時以原碼為準）：3D 透視（flip、cube，CSS 裡另有 crawl3d／orbit／tunnel／depth 的透視）、模糊（focus、soft）、裁切遮罩（split、glitch、fill、blinds、kara、star）、跑馬燈 `mq`（crawl、drift、slant、ticker、depth、tape、led）、漸層遮罩（torch）、陰影（melt、extrude、neon）。

## 為什麼不能照搬
我們的預覽和匯出都是「scene → Pixi 圖層」，文字是先畫成 canvas 再當貼圖；原版是改 DOM／CSS 的整個畫面動畫。把 DOM 動畫轉成影片格（例如 SVG foreignObject 截圖）在 iPhone 上又慢又不穩，匯出也沒辦法逐格對齊。
→ **每一式改寫成「畫到 canvas 2D」的函式**：`draw(g, t, s)`，同一個 t 永遠畫出同一張（預覽、單格輸出、匯出一致）。動作、時間、緩動、配色**照原碼的數字**改寫，不自己發明。

## 定案（使用者沒特別說的，Opus 先定，Sonnet 照做；要改再跟使用者確認）
1. **放在哪**：特效分頁 → 選到字卡時的［文字特效］（現在有 閃爍／發光閃亮／方格字／震動 4 種）。原本 4 種留著放最前面一組「基本」，後面接 8 組。一個字卡**只能有一種文字特效**（選 64 式其中一種會清掉舊的 `textFx`，反過來也一樣）。進場、出場特效照舊可以同時加。
2. **字從哪來**：用字卡自己的文字。用空白、換行、頓號、逗號分成好幾個詞（最多 8 個詞、每詞最多 14 字，跟原版一樣）。字卡還沒輸入（`placeholder`）時用那一式的範例字。
3. **畫面範圍（舞台）**：預設＝整個畫面（原版是整個容器，很多式要整個寬度：跑馬燈、集中線…）。字卡的位置、縮放、旋轉照舊作用在舞台上（拖、縮放＝整個舞台跟著動）。
4. **底色**：預設**透明**（疊在影片上）；可以選原版的底色：墨黑 ink／紙白 paper／鈷藍 cobalt／朱紅 verm／綠幕 key（色碼照原碼）。
5. **顏色**：字的顏色＝字卡第一段的顏色；**強調色**（原版的 accent，放射線、螢光筆、底條…）預設照那一式原版的配色，可以改（選色器）。
6. **字體**：用字卡第一段的字體與粗細（原版用 Noto Sans TC 900／Noto Serif TC，我們用使用者選的）。
7. **時間**：原版每式有自己的一輪長度（README 的「預設長度」），字卡比一輪長就循環，比一輪短就只播前面。套用時**不改字卡長度**。速度可調 0.5×／1×／1.5×／2×。
8. **點選範圍**：舞台是全畫面，但不能讓它擋住底下所有東西 → 預覽點選、選取框只用「字所在的中間區域」（每式可以宣告 `hit`，預設 `[0.08, 0.3, 0.84, 0.4]`，佔舞台的比例）。

## 資料
- `model/types.ts`：`TextItem.kinetic?: { id: KineticId; accent?: string; bg?: 'none' | 'ink' | 'paper' | 'cobalt' | 'verm' | 'key'; speed?: number }`（`KineticId` 是 64 個 id 的字串聯集）。
- 舊專案沒有這個欄位＝沒有，不用 migrate。

## 引擎（新資料夾 `src/engine/kinetic/`）
- `core.ts`：原版工具的 canvas 版本——`clamp lerp seg E keys rnd pick`（照抄數學）、`splitWords(text)`、`fitSize(g, word, maxFrac, widthFrac, stage)`（取代 `fit()` 的 `cqmin/cqw`：用 `measureText` 算出字大小，`1cqmin = min(W,H)/100`、`1cqw = W/100`）、`drawWord(g, word, x, y, size, opts)`（字體、粗細、描邊 `strokeText`、陰影）、`marquee(g, unit, dist, opts)`（`mq` 的 canvas 版：畫兩份接起來平移）、`perspectiveStrips(g, img, rotX|rotY, persp)`（把一張字的圖切成細條、每條不同縮放，模擬 CSS `rotateX/rotateY` 透視；cube／flip／crawl3d／orbit／tunnel／depth 用）、`blurDraw`（模糊：先試 `ctx.filter='blur()'`，不支援就「縮小再放大」畫兩次當退路；**iPhone Safari 的 `ctx.filter` 要實測**）。
- `fx/in.ts`、`fx/flow.ts`、`fx/swap.ts`、`fx/em.ts`、`fx/sp.ts`、`fx/mv.ts`、`fx/tv.ts`、`fx/hr.ts`：每檔 8 式，每式
  `{ id, g, zh, en, cycle(秒，README 的預設長度), scheme(預設底色), accent(預設強調色), words(範例字), poster(秒), hit?, draw(g, t, s) }`，`s = { W, H, words, color, accent, font, weight, seed }`。
- `index.ts`：`KINETIC`（64 筆，照原版順序）、`kineticById`、`KINETIC_GROUPS`（8 組名稱：登場、流動、切換、強調、空間、歌詞、綜藝、恐怖）。
- `render.ts`：`renderKinetic(item, t, W, H)` → `{ canvas, key }`。舞台 canvas 大小＝合成畫布大小（預覽 480/960、匯出 1080/2160 長邊），t 量化到 1/60 秒（key＝`id|step|文字|顏色|大小`），用兩張 canvas 輪流（不要每格 new）。底色不是 none 就先填底色。
- `scene.ts` 的 `toLayer`：`item.type === 'text' && item.kinetic` → 不走 `renderText`，改用 `renderKinetic`；圖層 `box`＝舞台（畫面大小 × 字卡 transform）。`geometry.ts`／`measureTextItem`：kinetic 字卡的大小＝舞台大小，`content`＝`hit` 區域（選取框、點選、吸附用它）。
- 匯出（`exporter.ts`）、單格輸出共用 scene，不用另外處理；只確認每格都有呼叫到（t 用匯出的時間）。

## 介面（`app/editor/tabs/EffectTab.tsx` 的 `StyleBlock`）
- 上面一排分段切換（`.seg`，跟 Y5 一樣）：［基本｜登場｜流動｜切換｜強調｜空間｜歌詞｜綜藝｜恐怖］。
- 下面是那一組的卡片格子（每組 8 張＋「無」）：卡片畫**那一式在 `poster` 秒的樣子**（用這個字卡的字、小 canvas，畫一次就好），名稱在下面。**選中的那張卡片會動**（只有那一張跑 rAF，其他靜止，省電）。
- 選了之後下面出現〔設定〕（`.zone-soft`）：強調色（`ColorPicker`）、底色［透明｜墨黑｜紙白｜鈷藍｜朱紅｜綠幕］、速度［0.5×｜1×｜1.5×｜2×］、一行資料「一輪 6.6 秒」。**不加說明小字**（使用者偏好）；原本 StyleBlock 下面那段長說明也拿掉。
- 立刻生效、可以復原（跟其他特效一樣不用「套用」鈕；它不是彈出視窗）。
- 時間軸字卡片段上的代表字：用 `zh` 的第一個字（像現在 `textFxCode`）。
- 動作：`store/actions.ts` 新增 `setKinetic(id, kineticId | null)`、`patchKinetic(id, patch)`；`setTextFx` 設定時刪掉 `kinetic`，`setKinetic` 設定時刪掉 `textFx`。

## 授權
- `src/engine/kinetic/LICENSE-claude-animated-text.txt`：原版 LICENSE 全文。
- 每個 `fx/*.ts` 檔頭一行：改寫自 claude-animated-text（MIT，© 2026 pound / POUND0423）。
- `docs/reference/claude-animated-text/`：放原版 `index.html`、`LICENSE`、`README.md`（實作時照它改寫；之後要比對也有依據）。

## 步驟（Sonnet，每步都 commit／push、更新 PROGRESS／PLAN §7／HANDOFF）
- **K0 骨架＋2 式**：下載原版到 `docs/reference/`；資料欄位、`core.ts`、`render.ts`、scene／geometry 接上、`setKinetic`；先做 `burst`（登場）與 `crawl`（流動，跑馬燈）兩式＋介面（分段切換、卡片、設定）。驗收：選了 burst 預覽會動、單格輸出跟預覽一樣、匯出（沙盒 WebM）有畫面、復原一步。
- **K1 登場＋流動**（共 16 式）。
- **K2 切換＋強調**（16 式；`type` 打字機、`slot` 拉霸、`odo` 跳錶、`led` 點陣、`glitch` 色偏、`neon` 發光、`focus` 模糊）。
- **K3 空間＋歌詞 MV**（16 式；3D 透視用 `perspectiveStrips`；`kara` 跟唱填色用裁切）。
- **K4 綜藝＋恐怖**（16 式；`lines` 集中線、`star` 爆炸框、`torch` 手電筒遮罩、`melt`／`drip` 往下拉）。
- **K5 收尾**：效能（見下）、iPhone 驗收清單、文件。

## 驗收（每一步）
- **跟原版並排比對**（最重要）：在 Playwright 裡用 `file://` 打開 `docs/reference/claude-animated-text/index.html`（沙盒沒有 Google Fonts，雙方都用本機字體），把原版那一格與我們畫的同一式、同樣的字、同樣的 t（poster 與一輪的 25%／50%／75%）各截一張，拼成 `docs/screenshots/kinetic/<組>-compare.png`（左原版、右我們）。目測動作與構圖一致才算過；**截圖不能有真人**（用純字）。
- 單元：`splitWords`、`fitSize`、每式 `draw` 在 t＝0／poster／cycle 畫出來不是全空、同一個 t 畫兩次 pixel 一樣（固定亂數）、不同 t 畫面不同（真的在動；靜止型的式子除外）。
- e2e：特效分頁選一式 → `kinetic` 寫進字卡、預覽取樣有字的顏色、跳到另一秒畫面改變、選「無」清掉、選舊的 4 種之一會清掉 kinetic；時間軸片段有代表字；單格輸出與預覽一致。
- **效能**：每式在 1080×1920 畫一格的時間（桌面 Chromium）記在 PROGRESS；超過 8 ms 的要優化（快取不變的部分、降低細條數）。預覽 960 時不能讓效能框掉到 50 fps 以下。

## 風險／要在 iPhone 實測
- `ctx.filter`（模糊）iPhone Safari 支援度：有退路但效果會差一點。
- 3D 透視是近似（細條模擬），不會跟 CSS 完全一樣；比對截圖看得出差異時記在 PROGRESS。
- 字體：原版用 Noto 900，我們用字卡的字體；字比較細的字體某些式子（重擊、蓋章）會沒那麼有力，這是預期的。
- 匯出 4K 時舞台 canvas 是 2160×3840，每格重畫比較慢；4K 匯出時間要在 iPhone 量。
