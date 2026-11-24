# U6 功能列：每一項一顆按鈕（2026-11-23，Opus 規劃，Sonnet 實作）

接在 U1–U5（`docs/plans/2026-11-23-roadmap-ui.md` §1）之後。U2 做出的三層功能列，第三層是「整個分頁塞進一個大視窗」，使用者覺得每個類別能調的東西太多、不知道去哪裡找。這份是跟使用者一題一題討論（grill-me，16 題）後定案的改法。**做完 U6 才一起修 e2e、給一個 PR**（見 §9）。

## 0. 定案總表（使用者原話摘要）

| # | 題目 | 決定 |
|---|---|---|
| 1 | 整體結構 | 每個類別都有第二層工具列，**新增｜調整**用細線分開，**每一項一顆按鈕**，按了只升起那一項的小視窗 |
| 2–4 | 怎麼看出設了什麼 | **項目名固定不變**；按鈕的**圖示那格換成目前的值**（代表字小圓圈、色塊、示意縮圖，色調組合用縮圖）；不好表示的項目，設定過就在**角落加小圓點**，值要打開視窗才看得到 |
| 4 | 沒選到東西時 | 調整區的按鈕**照樣顯示但變淡**，點了提示「先點一個…」 |
| 5 | 選到東西時 | 功能列**跳到那個東西的類別**（不自動升起視窗）：影片／照片→剪輯、整個版型→版型、版型裡的一格→剪輯、文字→文字、音樂→音訊；正在特效／色調時點別的片段**留在原類別**（色調點到音樂才切走） |
| 6–7 | 剪輯工具列 | 只留 9 顆：〔分割〕〔刪除〕〔複製〕〔修剪〕〔變速〕｜〔裁切〕〔外觀〕〔關鍵格〕｜〔命名〕。拿掉〔音量〕（在音訊）、〔填滿/完整〕（用雙指縮放）、〔移至格子〕、〔刪除並補齊〕、〔匯入〕（移到加入） |
| 7–8 | 刪除後的空白 | 〔刪除〕只有一顆、留空白；**時間軸的空白處有 ← 小按鈕**，按了把**同一條軌道**空白後面的片段往前補 |
| 9 | 加入 | 〔接續〕〔疊加〕〔貼圖〕 |
| 10 | 文字 | 〔文字〕〔圖形〕｜〔內容〕〔版面〕〔字塊〕〔描邊陰影〕〔裝飾〕；動態字卡只放特效 |
| 11 | 版型 | 〔版型〕｜〔外框〕〔大小〕〔各格〕〔播放方式〕〔移除〕 |
| 12 | 特效 | 〔進場〕〔出場〕〔轉場〕〔整段〕｜〔文字特效〕〔動態字卡〕；音樂淡入淡出移到音訊 |
| 13 | 色調 | 〔色調組合〕〔調整〕〔套用全部〕〔重設〕｜〔看原色〕 |
| 14 | 音訊 | 〔背景音樂〕〔分離原音〕｜〔音量〕〔淡入淡出〕〔修剪〕〔靜音標記〕｜〔全部靜音〕；音樂的分割／刪除／複製用剪輯工具列那組 |
| 15 | 小視窗 | **即時生效＋✕**（不滿意按播放列〔復原〕）；〔套用〕只留給會大改東西的視窗（換比例、版型格子素材、裁切） |
| 16 | 測試與 PR | 先不修現在 38 個失敗；U6 做完後所有測試一起改成新行為（**改寫，不刪、不跳過**），全綠後給**一個 PR** |

使用者也決定（U2–U5 期間）：升起的視窗蓋住播放列、時間軸**維持現狀**，要播放、復原、選別的片段先按 ✕。

## 1. 資料結構（`src/app/editor/tabs/shared.tsx`）

把「類別 → 工具」寫成一張表，`Toolbar.tsx` 照表畫，不要每個類別手寫一排。

```ts
export type ToolDef = {
  id: string;                 // 例：'edit.split'、'layout.frame'（唯一，e2e 用 data-testid=`tool-${id}`）
  label: string;              // 按鈕上的字（固定不變）
  icon: LucideIcon;           // 沒有值的時候顯示的圖示
  zone: 'add' | 'adjust' | 'extra';   // 新增｜調整｜其他（各區之間細線）
  /** 'popup'＝升起只有這一項的小視窗；'action'＝直接執行（不開視窗）；'toggle'＝切換開關 */
  kind: 'popup' | 'action' | 'toggle';
  /** 這一刻能不能用（不能用＝按鈕變淡，點了 toast(need)） */
  enabled?: (ctx: ToolCtx) => boolean;
  need?: string;              // 例：'先點一個版型'
  /** 目前的值怎麼顯示在圖示那格：沒有＝用 icon；'dot'＝角落小圓點 */
  badge?: (ctx: ToolCtx) => Badge | null;
};
export type Badge =
  | { type: 'char'; text: string; fg: string; bg: string }   // 代表字小圓圈（同時間軸，`engine/labels` 的 fxChar／顏色函式共用）
  | { type: 'swatch'; color: string; opacity?: number }
  | { type: 'thumb'; src: string }                          // 示意縮圖（色調組合、版型示意圖）
  | { type: 'text'; text: string }                         // 很短的值（音量「80%」、變速「2x」）
  | { type: 'dot' };                                       // 有設定，值要打開視窗看
export type ToolCtx = { project: Project; found: Found; time: number };
export const TOOLS: Record<CatId, ToolDef[]> = { ... };   // 內容見 §3
```

- `ToolId`（第三層視窗）改成 `string`（＝`ToolDef.id`）；`TOOL_TITLE` 拿掉，標題用 `label`。
- `SINGLE_TOOL` 拿掉：**七個類別點了都進第二層工具列**（第一層只剩類別）。
- `ToolButton` 加 `badge?: Badge`、`disabled` 改成「變淡但可以點」（`aria-disabled="true"`，點了跑 `need` 的 toast；不要用 HTML `disabled`，那樣點不到）。
- 圖示那格（22px）畫 badge：`char` 用跟時間軸一樣的小圓圈 CSS；`swatch` 圓角方塊；`thumb` 22×22 圓角縮圖；`text` 等寬小字（`--fs-pb`）；`dot` 是原本的 icon＋右上角 6px 強調色圓點。按鈕高度不能變（`--tabbar-h`）。

## 2. 第二層與第三層（`Toolbar.tsx`）

- 第二層：`[←] [新增區] | [調整區] | [其他區]`，可以左右滑（現有 `.fb-row`）。選中的工具（它的視窗開著）按鈕強調色。
- 點 `popup` 工具：升起 `.panel-sheet`，標題＝`label`，內容只有這一項（§4 怎麼拆）；再點一次同一顆＝收起；點同一列別顆＝換內容（視窗不先收起再升起）。
- 點 `action`：直接執行，toast 回報（例「已套用到 3 個片段」），可以復原。
- 點 `toggle`：切換，按鈕強調色表示開著（看原色、全部靜音）。
- 視窗的高度：**內容多高就多高**，上限維持 `min(56svh, …)`；一項一個視窗之後大多很矮，蓋住的範圍變小。
- 換類別、按 ← 返回、選到別的類別的東西（§5）：視窗收起。

## 3. 七個類別的工具列（id、種類、可用條件、badge）

「選到」＝`found?.item`。「影像」＝影片／照片／貼圖（`isVideoItem` 且不是音樂）。

### 剪輯 `edit`
| id | 按鈕 | 種類 | 可用 | badge |
|---|---|---|---|---|
| edit.split | 分割 | action | 永遠（沒選＝切播放頭下最上面的影像，照現在 `split`） | — |
| edit.delete | 刪除 | action | 選到任何東西 | — |
| edit.copy | 複製 | action | 選到 | — |
| edit.trim | 修剪 | popup | 影片／音樂（照片 toast 現有訊息） | dot（有 `audioRanges`／素材不是從頭開始） |
| edit.speed | 變速 | popup | 影片 | text「2x」（不是 1x 才顯示） |
| ─ | | | | |
| edit.crop | 裁切 | action（開 `CropEditor`，它自己有〔套用〕） | 影像 | dot（有裁切） |
| edit.look | 外觀 | popup | 選到任何畫面上的東西 | dot（透明度≠100%、混合、圓角、外框任一有設） |
| edit.key | 關鍵格 | toggle（`KeyframeButton` 的行為：沒有就新增、有就刪除） | 選到 | 菱形實心＝這個時間有關鍵格 |
| ─ | | | | |
| edit.name | 命名 | popup（現有 `PromptSheet`） | 選到 | — |

- 刪除＝`removeAnyItem`（留空白）；**拿掉** `rippleRemoveItem` 的按鈕（函式留著給 ← 用或刪掉都可以，看有沒有別處用）。
- 拿掉：匯入、音量、填滿/完整、移至格子、刪除並補齊（函式 `moveToCell` 等有別處用就留）。
- 「定格」全站改名「關鍵格」（`KeyframeButton`、`KeyframePanel` 的標題「定格細部調整」→「關鍵格細部調整」、toast、時間軸 aria-label、`docs/` 裡的使用者文字）。**`data-testid` 不改**（`kf-btn`、`kf-dot`、`kf-panel`）。
- 外觀視窗＝現在 `LayersTab` 的「選到的那一層」部分：`TransformControls`（大小、旋轉、置中、轉正）、整個圖層透明度、混合模式、圓角、外框；有關鍵格時下面接 `KeyframePanel`。**拿掉**「這一秒的圖層」清單（預覽右上角〔圖層〕已經有）。

### 加入 `add`
| id | 按鈕 | 種類 | 說明 |
|---|---|---|---|
| add.append | 接續 | action | 原剪輯〔匯入〕：`pick('main')` |
| add.overlay | 疊加 | action | 原〔影片照片〕：`pick('overlay')` |
| add.sticker | 貼圖 | popup | `AssetsTab`（內建／我的貼圖／GIPHY 分頁照舊） |

全部是新增區。空專案預覽中央的大〔匯入影片或照片〕照舊（＝接在最後）。

### 文字 `text`
| id | 按鈕 | 種類 | 可用 | badge |
|---|---|---|---|---|
| text.add | 文字 | action＋升起〔內容〕 | 永遠 | — |
| text.shape | 圖形 | action＋升起〔字塊〕 | 永遠 | — |
| ─ | | | | |
| text.content | 內容 | popup | 文字 | swatch（字的顏色） |
| text.layout | 版面 | popup | 文字 | — |
| text.box | 字塊 | popup | 文字 | swatch（字塊填滿色；沒字塊＝原 icon） |
| text.stroke | 描邊陰影 | popup | 文字 | dot（有描邊或陰影） |
| text.deco | 裝飾 | popup | 文字 | dot（有裝飾） |

- `TextPanel` 加 prop `section`：給了就**只畫那一段、不畫 `Segmented`**；沒給維持現狀（別處還有用的話）。〔內容〕＝現在的「文字」段（打字、字體、顏色），〔版面〕＝「版面」段＋文字透明度。
- 新增後直接升起〔內容〕，讓人打字（U2 已有類似行為：`setTool('textedit')`）。
- `AddToGroupToggle`（選到版型時新增的文字加進版型）放在〔內容〕視窗最上面；新增前想切換的話，選到版型時文字工具列新增區後面多一顆 toggle〔加進版型〕（id `text.toGroup`，只有選到版型時出現）。

### 版型 `layout`
| id | 按鈕 | 種類 | 可用 | badge |
|---|---|---|---|---|
| layout.add | 版型 | popup（`LayoutPicker`，挑好按〔加入〕） | 永遠 | — |
| ─ | | | | |
| layout.frame | 外框 | popup（`FrameStyleEditor`＋`LineSlider`） | 選到版型或格子 | swatch（外框顏色＋透明度） |
| layout.size | 大小 | popup（`ShapeControls`：拖邊調整體大小、格數） | 同上 | — |
| layout.cells | 各格 | popup（`LayoutDiagram`，點一格開「這一格」視窗） | 同上 | thumb（版型格子示意圖，小張） |
| layout.play | 播放方式 | popup（`PlayControls`：同步／依序、空檔） | 同上 | text「同步」／「依序」 |
| ─ | | | | |
| layout.remove | 移除 | action（`removeGroup`，紅色字、可以復原） | 同上 | — |

`LayoutTab` 拆成這幾塊各自 export（現在都已經是小元件，主要是把 `GroupPanel` 的組合拆開）。「新增版型」的卡片、`zone-this-layout` 那些包裝拿掉。

### 特效 `effect`
| id | 按鈕 | 種類 | 可用 | badge |
|---|---|---|---|---|
| fx.in | 進場 | popup（`SingleBlock role='in'`） | 影像、文字、版型 | char（時間軸同款代表字） |
| fx.out | 出場 | popup（`role='out'`） | 同上 | char |
| fx.seam | 轉場 | popup（`SeamBlock`） | 前面緊接同類片段的影像 | char |
| fx.whole | 整段 | popup（`WholeBlock`） | 影像、版型 | char |
| ─ | | | | |
| fx.textfx | 文字特效 | popup（`StyleBlock` 的文字特效部分） | 文字 | char 或 dot |
| fx.kinetic | 動態字卡 | popup（`StyleBlock` 的動態字卡部分：`KineticCard` 列表＋`KineticSettings`） | 文字 | thumb（那一式的 poster）或 dot |

- `EffectTab` 現在用 `fx-part-*` 分段切換；改成接 prop `part` 直接畫那一塊，不畫分段列。`fxFocus`（點時間軸圓圈）→ 跳到特效類別並升起對應那一項（`in`→fx.in、`seam`→fx.seam、`whole`→fx.whole、`style`→fx.textfx）。
- 音樂的 `AudioFx`（淡入淡出）搬到音訊〔淡入淡出〕。

### 色調 `color`
| id | 按鈕 | 種類 | 可用 | badge |
|---|---|---|---|---|
| color.look | 色調組合 | popup（色調組合卡片＋強度） | 影像、文字 | thumb（`LookCard` 同一套：目前畫面套這組色調的小縮圖） |
| color.adjust | 調整 | popup（11 個滑桿） | 同上 | dot（有手動調整） |
| color.all | 套用全部 | action（現有「套用到全部同類」） | 同上 | — |
| color.reset | 重設 | action（`grade-reset` 現有的） | 有調色 | — |
| ─ | | | | |
| color.peek | 看原色 | toggle（`useUI.gradePeek`） | 專案有任何調色 | 開著＝強調色 |

- `ColorPanel` 拆成 `LookPicker`、`AdjustSliders`；「整段／這個關鍵格」切換（`scope-hint` 那段）兩個視窗最上面都放。
- 色調視窗標題列的〔看原色〕（U3 的 `.ps-peek`）拿掉，改用工具列這顆。

### 音訊 `audio`
| id | 按鈕 | 種類 | 可用 | badge |
|---|---|---|---|---|
| audio.music | 背景音樂 | action（開檔案選擇，現有 `MusicImport` 的 input） | 永遠 | — |
| audio.split | 分離原音 | action | 選到有聲音的影片 | — |
| ─ | | | | |
| audio.volume | 音量 | popup（音量 0–200%） | 音樂，或影片（＝原音） | text「80%」（不是 100% 才顯示）；靜音＝`VolumeX` 圖示 |
| audio.fade | 淡入淡出 | popup | 同上 | dot |
| audio.trim | 修剪 | popup（同剪輯〔修剪〕的內容） | 同上 | dot |
| audio.mute | 靜音標記 | popup（`MuteSheet`，現在的「進階」） | 同上 | dot |
| ─ | | | | |
| audio.allmute | 全部靜音 | toggle（現有「全部影片靜音」） | 永遠 | 開著＝強調色 |

- 現在音訊分頁的「這個專案的聲音」清單（每支影片的原音＋音樂一列）拿掉：要調哪個就在時間軸點它。
- 選到音樂時，剪輯工具列的〔分割〕〔刪除〕〔複製〕照樣能用（使用者要切過去剪輯類別）。

## 4. 共用面板怎麼拆（原則）

- **不要複製元件**：把現有大面板裡的每一段抽成可以單獨 render 的元件或加 `section`／`part` prop。視窗裡**不要再有分段切換列**（`Segmented`、`fx-part-*` 那種），每個視窗只有一項。
- 說明小字不要加回來（使用者偏好）；空狀態最多一句。
- 即時生效：滑桿、選項點了就寫進專案（現在大多已經是這樣）；不要加〔套用〕。會大改東西的 `Sheet`（比例、格子素材 `CellSheet`、裁切）維持現有的〔套用〕＋✕。

## 5. 選到東西時跳類別（`targetForSelection`）

```
文字            → text
音樂            → audio（目前在 color 也切走）
整個版型（frame）→ layout
版型裡的一格、一般影片／照片／貼圖 → edit
例外：目前類別是 effect 或 color（且選到的不是音樂）→ 不動
其他情況 cat 已經相同 → 不動
```
- 都**不自動升起視窗**；但如果目前開著的視窗那一項對新選到的東西也適用（例：特效〔進場〕開著，點另一個影片），**視窗留著、內容換成新的**；不適用就收起。
- 晚 250ms 才跳的做法保留（避開補送的 click）。

## 6. 時間軸空白的 ←（`Timeline.tsx`）

- 現在只有影像軌有 `gap-block`（點兩下才「補齊」）。改成：**每一種軌道**（影像、貼圖、文字、音樂；版型成員軌除外）的空白處都畫，空白裡置中一顆 `ArrowLeft` 小按鈕（`aria-label="往前補齊 1.2 秒"`、`data-testid="gap-close"`），**點一下**就 `closeGap(trackId, start, end)`（只移同一條軌道空白後面的片段），可以復原。
- 空白太窄（`len*pps < 24`）就不畫按鈕（避免誤觸），使用者可以雙指放大再按。
- 主軌開頭的空白（`includeLeading`）照現在的規則。

## 7. 其他

- 剪輯〔外觀〕取代 U2 的「位置大小」；`LayersTab` 的圖層清單拿掉後，預覽右上角〔圖層〕（`LayerPeek`）是唯一的圖層清單。圖層上下移的功能要確認 `LayerPeek` 或時間軸軌道圖示拖拉還做得到（時間軸拖軌道圖示可以，OK）。
- `requestTab`／`targetOfTab` 改成回傳 `{ cat, tool: ToolDef['id'] | null }`；`KeyframePanel` 裡要求切到色調的按鈕 → `color.look`。
- 字級：工具列按鈕字用 `--fs-note`（7 個字以內放得下：「描邊陰影」「淡入淡出」要確認 320 寬不換行、不被切）。

## 8. 分批（每批 commit＋push，照 AGENTS.md 更新 PROGRESS）

- **U6-1** `shared.tsx` 的 `TOOLS` 表、`ToolButton` badge／變淡、`Toolbar.tsx` 照表畫（七個類別都進第二層）；先讓每個 popup 暫時 render 原本整個分頁，確認骨架。
- **U6-2** 拆面板：剪輯（外觀、修剪、變速、命名）、文字（`TextPanel section`）、版型、特效（`part`）、色調（`LookPicker`／`AdjustSliders`）、音訊。
- **U6-3** badge：代表字、色塊、縮圖、%／x、圓點；變淡＋toast。
- **U6-4** 時間軸 ←；剪輯拿掉的按鈕；改名（關鍵格、修剪、外觀）；加入類別；選到東西跳類別的新規則；`fxFocus` 對應。
- **U6-5** 截圖自查（寬 320／360／390／430 × 直式、1:1、16:9，每個類別第二層＋每個視窗一張），字不換行、不被切；然後 §9。

## 9. 測試（U6 做完才做）

- 先改 `e2e/helpers.ts`：`openTab(page, name)` 改成 `openTool(page, cat, toolLabel?)`（進類別、需要時點那顆工具讓視窗升起）；保留 `openTab` 當相容包裝（舊名稱→新類別＋工具的對照表），能少改很多 spec。
- 舊行為的測試**改寫成新行為**，不刪、不 `skip`：例如「預覽上滑捲頁面」改成「整頁不捲、時間軸裡面上下滑」，「分頁列 9 個」改成「7 個類別＋每個類別的工具列」，「說明小字」的斷言拿掉或改成斷言按鈕／badge。
- 新增 e2e：每個類別的工具列按鈕齊全且順序對；沒選到時調整按鈕變淡、點了有 toast；設定後 badge 出現（進場代表字、外框色塊、色調縮圖、音量 %、圓點）；時間軸 ← 只移同一軌；選到各種東西跳到對的類別、特效／色調時不跳。
- 每輪用 `--timeout=45000` 先找出失敗，全部綠了再跑一次正常逾時的完整 e2e；`npm run check` 綠。
- 全綠後給使用者**一個 PR**（包含 U1–U6、hold-for-all-effects、AudioContext 修正），PR 說明列 iPhone 要驗的項目（`docs/PLAN.md §7`）。
