# 字卡系統規格（Phase 3）

> 對應需求 R7–R12。先讀 `docs/PLAN.md`。

---

## 1. TextCard 資料結構

```ts
type TextCard = {
  runs: TextRun[];                 // 一張字卡可有多段文字（主標＋副標＋小字），各自字體/大小/位置
  box?: CardBox;                   // 字塊（底塊），可沒有
  decorations: Decoration[];       // 裝飾，可多個
  width: number | 'auto';          // 字卡寬度（畫面寬比例），auto = 依文字
  align: 'left' | 'center' | 'right';
  vertical?: boolean;              // 直排（書法電影感模板「窗紙」用）
  anim: { in?: TextAnim; loop?: TextAnim; out?: TextAnim };  // 見 EFFECTS.md
  templateId?: string;
};

type TextRun = {
  text: string;
  fontId: string;                  // 對應 fonts/catalog.ts
  size: number;                    // px（以 1080 寬畫面為基準）
  color: Fill;                     // 純色或漸層
  letterSpacing: number;           // em，-0.2 ~ 1.0
  lineHeight: number;              // 倍數，0.8 ~ 2.5
  weight: 'normal' | 'bold';       // 字型沒有粗體時用同色描邊模擬（最多 3 級）
  italic: boolean;                 // 字型沒有斜體時用 skewX(-12°)
  strokes: Stroke[];               // 多層描邊（由外到內），例：白 12px + 粉 6px
  shadow?: { color: string; blur: number; x: number; y: number };
  glow?: { color: string; blur: number; strength: number };
  effect?: 'none' | 'cloud' | 'neon' | 'outline-only' | '3d-extrude' | 'gradient-sweep';
  offset: { x: number; y: number }; // 相對字卡中心
  rotation?: number;               // 整段歪斜（說話字幕 5–12°）
  highlight?: { ranges: [number, number][]; color: string; style: 'marker' | 'underline' | 'box' }; // 關鍵詞色塊
};

type CardBox = {
  shape: ShapeId;                  // 見 §4 圖形庫（rect、roundRect、pill、cloud、speech-oval…）
  fill: Fill; opacity: number;
  stroke?: Stroke;
  padding: { top: number; right: number; bottom: number; left: number }; // 分開調！
  nudgeY: number;                  // 文字在字塊內的垂直微調（px）
  radius?: number;
  tailDir?: 'none' | 'bottom-left' | 'bottom-right' | 'left' | 'right'; // 對話框尾巴方向
  skew?: number;                   // 斜切色塊（運動風）
  shadow?: {...};
};
```

## 2. 排版引擎重點（解決「字上方色塊多、下方貼底」）

**原因**：CJK 字型的 `ascent/descent`（字型度量）跟字實際墨跡範圍差很多，各字型也不一樣；如果用 `textBaseline='top'` 或 font-size 當高度去排，字會偏下，上方空一大塊。

**做法（一定要這樣做）**：
1. 每一行用 `ctx.measureText(line)` 取 `actualBoundingBoxAscent`、`actualBoundingBoxDescent`、`actualBoundingBoxLeft/Right`，得到**墨跡邊界**。
2. 字塊尺寸 = 墨跡邊界 + padding（上下左右各自）。
3. 文字垂直位置以墨跡邊界置中，再加 `nudgeY`。
4. 單元測試：用 3 款不同字型（粉圓、饅頭黑體、霞鶩文楷）各排「字卡測試」，斷言墨跡上緣到字塊上緣的距離 = padding.top ± 1px，下方同理。
5. 中英混排時，同一行的墨跡邊界取聯集。
6. 字距 `letterSpacing`：Canvas2D 的 `ctx.letterSpacing` Safari 舊版不支援 → **自己逐字排**（反正逐字動畫也需要每個字的座標）。輸出 `GlyphBox[]`（字、x、y、寬、行號）。
7. 寬度固定時自動換行：中文逐字斷行；英文在空白處斷；避頭尾（，。、！？」不放行首）。

字卡渲染順序：字塊陰影 → 字塊 → 底層裝飾（色塊、螢光筆）→ 文字描邊（外到內）→ 文字填色 → 上層裝飾（圈圈、星星、箭頭）。

字卡編輯面板的控制項（全部即時預覽）：
- 文字輸入、**字體下拉選單**（`<FontSelect>`：每一項用該字體渲染「字體名稱＋永遠的家」這種範例，未下載的字體顯示雲朵下載圖示，點了才下載）
- 字級、顏色、字距、行距、寬度（拖曳或滑桿）、對齊、粗體、斜體、直排
- 描邊（可加多層）、陰影、發光
- 字塊：形狀（縮圖格選）、顏色、透明度、**內距上/下/左/右四個滑桿**（加一個連動鎖）、圓角、垂直微調
- 裝飾（縮圖格選，可疊多個）、裝飾顏色/粗細
- 動畫（進場/循環/出場）

## 3. 裝飾（Decoration）——風格選單要顯示「範例縮圖」

```ts
type Decoration = {
  kind: DecorationKind; color: string; width: number;    // 線寬（相對字高）
  anchor: 'under' | 'around' | 'over' | 'left' | 'right' | 'tail';
  scale?: number; offset?: { x: number; y: number };
  drawOn?: boolean;              // 用 lineDashOffset 做「被畫出來」的動畫
};
```

每種裝飾是一個函式：`(inkBox: Rect, opts) => Path2D[]`，以**字的墨跡邊界**為基準計算。風格選單裡每格都用「範例字」實際渲染縮圖（用 OffscreenCanvas 產生並快取），**不要只列名稱**。

| kind | 長相 |
|---|---|
| `tail-loop` | **尾端圈圈底線**（見下節，使用者指定照參考圖） |
| `tail-loop-double` | 尾端兩個連續圈圈 |
| `wave-underline` | 波浪底線 |
| `dashed-underline` / `dotted-underline` | 虛線/點點底線 |
| `marker` | 螢光筆色塊（斜、不規則邊，半透明，畫在字後面） |
| `scribble-circle` | 手繪圈住整個字（橢圓、頭尾不閉合、稍微超出，參考影片 d218cc71 的 VLOG 外圈） |
| `double-line` | 雙底線 |
| `arrow-curve` | 彎箭頭指向字（「看這個重點」） |
| `sparkles` | 字周圍小星星 ✦ |
| `hearts` | 字兩側小愛心（「好評」模板） |
| `slashes` | 左右各一道斜線 `\ 文字 /`（說話字幕） |
| `check` | 字前打勾 ✔（美妝清單） |
| `corner-brackets` | 「」角括號 / 取景框四角 |
| `dot-line` | 細線＋中間圓點（「HUANG — Cozy time」那種） |
| `number-badge` | 字前數字圓章「01」 |
| `cloud-frame` | 雲朵外框（線條） |
| `speech-frame` | 對話框外框（線條） |

### 3.1 尾端圈圈 `tail-loop`（使用者參考圖是**示意圖**：抓住形狀神韻即可，不必逐像素重合）

參考圖：`docs/reference/tail-loop-underline.jpg`；校準對照：`docs/reference/tail-loop-calibration.png`（藍線＝下面的路徑，粉紅＝參考圖，已幾乎重合）。

形狀描述：從字的左緣略前方開始，一條**平直的粗線**往右走；過了一半後**微微上揚**；到了字的右緣之後**往右下彎**，然後**往左下兜回來**形成一個**扁長的橢圓圈**（圈的左端大約在字寬 82% 的位置、在線的下方）；從圈的左端**往右上回來**，穿過剛剛下彎的那段，最後**往右下拉出一小段尾巴**。整條線**等粗、圓頭**。

座標系：`u` = 以字的墨跡寬為 1（0 = 字左緣，1 = 字右緣）；`v` = 以字的墨跡高為 1，**0 = 字的墨跡底部**，往下為正。

```
M -0.02 0.42
C 0.15 0.42, 0.35 0.42, 0.47 0.42
C 0.60 0.42, 0.75 0.30, 0.92 0.30
C 1.05 0.30, 1.17 0.40, 1.175 0.63
C 1.18 0.85, 1.02 1.13, 0.90 1.13
C 0.80 1.13, 0.77 0.95, 0.84 0.86
C 0.90 0.72, 0.98 0.62, 1.06 0.62
C 1.14 0.62, 1.22 0.78, 1.285 0.89
```
- 線寬：字高 × 0.15（可調 0.06–0.25）；`lineCap = lineJoin = 'round'`。
- 預設色：`#E2006E`（參考圖的桃紅）。
- 實作：把 (u,v) 換算成像素 `x = left + u*w`、`y = bottom + v*h`。**不要用等比縮放**，寬高分別縮放，這樣字很長時圈圈仍在尾端。若字很長（w/h > 8），圈圈部分（u > 0.75 的那幾段）改用以 h 為基準的固定大小，避免圈圈被拉得太扁：圈圈段的 x 改為 `right + (u-1)*h*5.3`。
- 字卡外框要把超出字寬的 28% 與下方 1.2 倍字高算進去，避免被裁掉。
- `drawOn` 動畫：用 `getTotalLength` 等價方法（自己取樣曲線長度）＋ `setLineDash([len,len])`、`lineDashOffset` 從 len → 0。
- 驗收：截圖給使用者看形狀像不像（使用者 2026-11-11 說明參考圖只是示意圖，**不需要**疊圖到逐像素重合；`tail-loop-calibrate.py` 留作需要時的工具）。
- 實作備註：字很長（w/h > 5.3）時，圈圈（u > 0.75）改成以字高為基準的固定大小、貼字右緣，前面直線段拉長補寬度；w/h = 5.3 時與等比縮放完全相同，所以是連續的。

## 4. 圖形庫（Office PPT 風格，當貼圖或字卡底塊，R12）

自己用 SVG path 實作（幾何可參考 ECMA-376 公開標準 OOXML 的 preset shape 定義，**不要複製 Office 的圖片或圖示檔**）。每個圖形是參數化函式 `(w, h, adj) => string(path)`，可調參數（圓角、尾巴位置、星形角數、內徑比）。

| 類別 | 圖形 |
|---|---|
| 基本 | 矩形、圓角矩形、膠囊、橢圓、三角形、菱形、平行四邊形（斜切色塊）、梯形、五邊形、六邊形、八邊形、十字、框、半框、L 形、斜角矩形、剪角矩形（單角/對角）、圓形缺角、淚滴、月亮、愛心、閃電、太陽、笑臉、雲朵 |
| 對話框 | 矩形對話框、圓角對話框、橢圓對話框、**雲朵對話框（思考泡泡）**、線條對話框、尖刺爆炸對話框 |
| 星形/爆炸 | 4/5/6/7/8/10/12/16/24/32 角星、爆炸 1、爆炸 2、波浪印章（貼紙常用的鋸齒圓） |
| 緞帶/橫幅 | 緞帶（上/下彎）、捲軸（橫/直）、波浪旗、雙波浪、標籤（tag） |
| 箭頭 | 粗箭頭四方向、雙向、彎箭頭、迴轉箭頭、V 形（chevron，「NEXT ▶」用）、五邊形箭頭（步驟條） |
| 流程圖 | 圓角流程、決策菱形、文件波浪底、資料庫圓柱 |
| 線條 | 直線、箭頭線、手繪感曲線 |

- 所有圖形支援：填色（純色/漸層）、外框（顏色/粗細/虛線）、陰影、透明度、**手繪感**開關（用 roughjs 風格的抖動：對 path 取樣後加小雜訊，可愛風模板用）。
- 字卡字塊選單同樣顯示縮圖（形狀內放「範例」兩字）。

> 實作狀態（2026-11-11）：`src/engine/shapes.ts` 已做 **33 種**（基本 16、對話框 5、星形 6、標籤箭頭 6；沒做：框/半框、L 形、月亮、太陽、笑臉、閃電、雙向/彎/迴轉箭頭、流程圖多數、線條、緞帶/捲軸/波浪旗、手繪感開關、漸層填色、虛線外框）。外框大小 = 文字區 × `inset`（每個圖形一組，單元測試保證文字區放得進去）。

> 圖形調整（2026-11-11）：`CardBox.adj` ＋ `ShapeDef.adjust`，25 個圖形有調整項目（凹槽深度／圓滑、凸起數量、星形內徑、角的圓滑、尾巴位置長度寬度…）。沒調過 → `inset` 表；調過 → `fitInset` 執行時重算。裝飾也有 `gap`（與文字距離）、`scale`（大小），見 §3。顏色用 `src/ui/ColorPicker.tsx`（32 色＋最近用過＋自訂）。

### 4.1 貼圖 icon
- Fluent Emoji（3D/扁平/高對比，Microsoft MIT 授權）：表情、食物、動物、天氣、愛心、星星…最接近 Office 插入圖示的感覺。
- Tabler / Fluent UI System Icons：線條 icon（可改顏色、線寬）。
- 只打包使用到的子集（約 300 個常用），其他按分類延遲載入；附授權檔 `public/licenses/`。
- 貼圖可加白邊（貼紙感）、陰影、循環動畫（搖擺、彈跳、呼吸）。

## 5. 雲朵字（R11）

目標：有「雲朵/棉花感」即可，不必真 3D。用 Canvas2D 疊層做（匯出時同一套程式，結果一致）：
1. 文字 path 用**很粗的白色描邊**（字高 × 0.18，`lineJoin='round'`）＋白色填滿 → 變成圓胖的字形。
2. 沿著描邊外緣隨機撒圓（半徑 字高×0.04–0.09，密度可調）→ 邊緣蓬鬆凹凸感。做法：取樣字的輪廓點（把字畫到離屏 canvas，掃描 alpha 邊緣像素），每隔 N 點畫一個白圓。
3. 內陰影：用 `globalCompositeOperation='source-atop'` 畫一層由下而上的淡藍灰漸層（`rgba(150,170,200,0.45)` → 透明），做出下方陰影的立體感。
4. 加一層雜訊紋理（預先產生 256×256 的 noise 圖，`source-atop`、`multiply`、透明度 0.15）。
5. 外陰影：`shadowColor rgba(80,110,160,0.35)`、`shadowBlur 字高×0.12`、`shadowOffsetY 字高×0.05`。
6. 隨機種子固定（存在 run 裡），每次渲染長一樣。
7. 可選「慢慢飄動」循環動畫：整體 ±3px 上下浮動＋輕微縮放。
- 參數：蓬鬆度、陰影顏色、亮度。預設搭配饅頭黑體或粉圓（粗、圓的字效果最好）。
- 模板「Let's Go To Spring」：三行、每行略微旋轉、雲朵字，背景藍天影片。

## 6. 模板（R10）——第一版至少 48 個，分類放

模板 = 一個 `TextCard` JSON（含多個 run、字塊、裝飾、動畫），文字可替換。存在 `src/text/templates/<分類>.ts`。模板選單顯示**即時渲染縮圖**（用模板自己的範例文字）。以下依使用者截圖整理（只參考風格，**不要複製別人的商標或作品文字**）：

### 可愛（使用者要求多做）
1. 粉色膠囊＋白字＋左右小愛心
2. 雲朵對話框＋圓體字＋小星星
3. 思考泡泡＋「嗯…」手寫字
4. 鋸齒波浪印章圓＋中間兩個字（貼紙感、手繪抖動）
5. 尾端圈圈底線（§3.1）＋圓體黑字
6. 螢光筆斜色塊＋手寫字
7. 奶油黃圓角卡＋棕字＋✿ 裝飾
8. 手繪框＋歪斜 5° 的 Q 版字（清松手寫體 6）
9. 雙層描邊（白外粉內）泡泡字＋彈跳動畫
10. 糖果漸層字＋白描邊＋閃光 ✦
11. 小熊耳朵圓框（兩個小圓＋大圓角矩形）
12. 便條紙（淡黃方形＋膠帶小矩形斜貼在上緣）

### Vlog 標題（參考「8組百萬博主同款」）
13. 大寫粗體 VLOG（奶油色）＋上面疊斜體手寫英文「Slow living」（青色）＋左上小字
14. 手寫大字「Yan Good」＋下方粗襯線間距大的 VLOG＋（days）小字
15. 「My」大手寫＋「Day」粗襯線黃字＋右上小字
16. 「Good」細手寫大字＋「vibes only」細黑體＋蝴蝶線稿 icon
17. 深棕長條色塊＋「SLOW」「LIVING」小字左右＋中間大手寫「only」穿出色塊
18. 大襯線金字「HUANG」＋下方 dot-line＋右側小膠囊「Cozy time」
19. 「Lazy afternoon」細襯線＋「Lens」粗字＋手寫「up」＋貝殼 icon＋小十字星
20. 「Welcome to my」手寫＋「Roomtour」細圓體＋圓弧線＋小星光

### 片中序章 / 章節
21. 「1」大號細襯線紅字＋紅色長條斜體標題（內輪廓定妝 那種）
22. 細長綠黃漸層條＋小字章節名
23. 「#1」方塊＋斜體粗字標題
24. 「01 ▸ 標題」數字膠囊＋細框
25. 「NEXT ▶」粗字＋紅三角
26. 「Vol.22」白框膠囊
27. 「第 2 個 ↘」粗黑體＋橘色數字＋箭頭
28. 「02」超大空心描邊數字＋下方綠色色塊小標
29. 「°No.1」襯線＋上標小圈
30. 「#LOOK 1」反白方塊

### 美妝 / 清單
31. ✔ 打勾清單（多行，逐行出現）
32. 「STEPS 01」圓形點線環繞大數字
33. 細折線指引線＋小字說明（「雙排紐扣」那種標註線）
34. 對話框貼紙「遮瑕膏」（白底、圓角、下方尖角）
35. 漸層藝術字「素顏肌」＋右上箭頭
36. 圓括號 ( 曜石小方 ) 細手寫

### 運動 / 綜藝重點
37. 黃綠斜體粗字＋斜切色塊「30MIN 爆汗有氧」
38. 火焰漸層字「爆汗」＋小英文 SWEATING
39. 「START」白粗字＋上下細線
40. 綠色勾勾＋「正確示範」斜色塊
41. 「絕殺!!」粗斜體＋速度線
42. 「出發吧!」黑白漫畫爆炸框
43. 「NO.1」金屬金漸層＋下方深色長條小字
44. 「看這個重點」＋紅色彎箭頭
45. 「點讚 關注 評論」三個圓 icon 列

### 書法電影感（參考第 9 張圖）
46. **直排**毛筆大字（黃色，例「窗紙」）＋右側小手寫英文兩行
47. 橫排毛筆大字（白色，例「特效藥」）＋下方等寬細英文＋一個彩色小點
48. 草書大字（淡黃，例「聽風」）＋手寫英文小字斜放

### 雲朵字
49. 「Let's Go To Spring」三行雲朵字
50. 單行雲朵字＋藍天漸層小色塊

> 書法/毛筆模板用：辰宇落雁體、芫荽、志莽行書（簡體字形，要先檢查文字覆蓋）、內海字體、Yuji Syuku。若選的字體缺字，用 fallback 字體補並在 UI 提示「此字體缺 N 個字」。

## 7. 驗收（給使用者審核用）
- 每個模板的縮圖（深色背景＋淺色背景各一張）輸出到 `docs/screenshots/templates/`，並產生一個 `docs/screenshots/templates/index.html` 一頁看全部。
- 尾端圈圈：與參考圖疊圖對照。
- 排版置中測試：3 款字型各一張「padding 對稱」截圖。
- 雲朵字：白底、藍天底各一張。
