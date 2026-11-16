# 字會動 64 式（Animated Text）

64 種中文文字動態（kinetic typography）的即時展示頁，加上一支把它們輸出成 MP4 的腳本。
每一式都附一則可以直接貼給 AI 的指令，也附已經輸出好的 1920×1080 影片。

**線上展示：<https://pound0423.github.io/claude-animated-text/>**（不用下載，打開就能換字、看 64 式動態、複製指令）

![登場與流動](docs/preview-1.jpg)
![切換與強調](docs/preview-2.jpg)
![空間與歌詞 MV](docs/preview-3.jpg)
![綜藝字卡與恐怖片](docs/preview-4.jpg)

## 這個專案解決什麼問題

做影片時常需要會動的字：片頭標題、歌詞、綜藝字卡、恐怖片字幕。但是：

- AI 影片生成工具畫中文字常常畫錯，動態也不受控制。
- 用剪輯軟體一個一個手調關鍵影格很花時間。
- 想請 AI 用程式做，卻不知道那種動態叫什麼、該怎麼描述。

這個專案把 64 種常用的文字動態做成一個網頁，三件事一次解決：

1. **先看效果再挑**：每一格都是即時跑的動畫，換成自己的字馬上看到結果。
2. **知道怎麼描述**：每一式都有一則寫明秒數、角度、比例的指令，可以複製去請 AI 做出同樣的動態。
3. **直接拿到影片**：用 `render.py` 把任何一式輸出成 MP4，可指定文字、比例、底色（含綠幕）。

## 主要功能

### 展示頁 `index.html`

- 64 式文字動態，分成 8 組：登場、流動、切換、強調、空間、歌詞 MV、綜藝字卡、恐怖片。
- **換字**：在上方輸入自己的字，用空格、逗號或頓號分開多個詞（最多 8 個詞、每個詞最多 14 個字），64 格和 64 則指令會一起更新。輸入內容會記在瀏覽器裡。
- **放大檢視**：點任一格放大，可切 16:9、9:16、1:1，底色可選墨黑、紙白、鈷藍、朱紅、綠幕，支援全螢幕，鍵盤左右鍵換上一式、下一式。
- **指令**：每格有「複製指令」；頁面最下方列出全部 64 則，可一次複製。放大檢視裡換比例或底色，指令會跟著改。
- **其他**：可以只看某一組、可以暫停全部動畫；系統若設定「減少動態效果」，預設不自動播放。
- 單一 HTML 檔，沒有建置步驟，不依賴任何 JavaScript 套件。

### 輸出腳本 `render.py`

- 用無頭 Chrome 逐格算圖（指定時間 → 截圖 → 交給 ffmpeg），輸出不受電腦快慢影響。
- 可指定要輸出哪幾式、畫面大小（含直式）、每秒格數、影片長度、底色、自訂文字、畫質。
- 輸出 H.264 MP4（yuv420p），依組別分資料夾，檔名是「編號_中文名_英文名.mp4」。

### 現成的檔案

- `mp4/`：64 支已輸出的影片，1920×1080、30fps、無聲，每支 4–12 秒，用的是各式的範例字與預設底色。
- `prompts.txt`：64 則指令的純文字版（範例字、16:9、預設底色）。

## 安裝方法

**只看展示頁**不需要安裝任何東西：下載或 clone 這個專案，用瀏覽器開啟 `index.html` 即可。

```bash
git clone https://github.com/POUND0423/claude-animated-text.git
cd claude-animated-text
```

連網時頁面會從 Google Fonts 載入 Noto Sans TC、Noto Serif TC、Archivo；離線時改用系統字型（蘋方、微軟正黑體、Noto Sans CJK TC 等），字形會略有不同。

**要輸出 MP4** 另外需要：

- Python 3.9 以上
- [Playwright for Python](https://playwright.dev/python/)
- Chrome 或 Chromium
- ffmpeg（要有 libx264）
- 建議安裝 Noto Sans CJK TC 與 Noto Serif CJK TC 字型

```bash
pip install -r requirements.txt
# 電腦裡沒有 Chrome／Chromium 的話，讓 Playwright 自己裝一份：
playwright install chromium
```

`render.py` 會依序尋找 `google-chrome`、`chromium` 等指令，找不到就用 Playwright 安裝的 Chromium；也可以用 `--chrome` 指定執行檔路徑。

> 輸出時會刻意擋掉網路字型、改用系統字型，所以沒有網路也能跑。`mp4/` 裡的影片是在 Linux 上用 Noto Sans CJK TC／Noto Serif CJK TC 算的。腳本目前只在 Linux 上實際跑過，macOS 和 Windows 尚未測試。

## 使用方法

### 展示頁

1. 用瀏覽器開啟 `index.html`（已在 Chrome 測過；動畫用到 CSS container query 單位，需要較新的瀏覽器）。
2. 在「你的字」輸入文字，例如 `今晚八點 首播 不見不散`。
3. 用上方的分組按鈕篩選，點任一格放大，選比例和底色。
4. 按「複製指令」把那一式的描述貼給會寫程式的 AI；或選綠幕底後用螢幕錄影，進剪輯軟體去背。

### 輸出 MP4

```bash
# 列出全部 64 式的編號、id、名稱、預設長度
python render.py --list

# 全部輸出到 ./mp4（1920×1080、30fps，各式預設長度）
python render.py

# 只輸出指定的幾式
python render.py burst neon vpop

# 直式、綠幕、自訂文字、每支 3 秒，輸出到 out/
python render.py vpop neon --size 1080x1920 --scheme key --words "今晚八點 首播" --seconds 3 --out out
```

| 參數 | 說明 | 預設 |
|---|---|---|
| `ids` | 要輸出的動態 id，可給多個；不給就輸出全部 | 全部 |
| `--list` | 列出所有動態後結束 | |
| `--out` | 輸出資料夾 | `./mp4` |
| `--size` | 畫面大小 `寬x高`，寬高都要是偶數 | `1920x1080` |
| `--fps` | 每秒格數 | `30` |
| `--seconds` | 每支影片的長度（秒） | 各式預設的一輪長度 |
| `--scheme` | 底色：`ink` 墨黑、`paper` 紙白、`cobalt` 鈷藍、`verm` 朱紅、`key` 綠幕 | 各式預設 |
| `--words` | 自訂文字，用空格分開多個詞 | 各式範例字 |
| `--crf` | x264 畫質，數字越小越清楚、檔案越大 | `20` |
| `--chrome` | Chrome／Chromium 執行檔路徑 | 自動尋找 |
| `--page` | `index.html` 的路徑 | 與腳本同資料夾 |

速度參考：在 2 核心的機器上，1080p 大約每秒算 10 格；64 式全部（約 7 分 41 秒的影片）分兩個程序同時跑，約 12 分鐘。

## 輸入輸出範例

### 範例 1：在展示頁換字，取得指令

輸入：

```
今晚八點 首播 不見不散
```

輸出：64 格動畫都改用這三個詞，第 01 式的指令變成：

```
【01 爆出】
用單一 HTML 檔（純 CSS + JavaScript，不用外部套件）做一個可以無縫循環播放的文字動畫。
畫面：比例 16:9，背景 #14161b，主文字 #f4f5f7，強調色 #ff4d2e。
字體：最粗的黑體（Noto Sans TC 900）。
文字：「今晚八點」「首播」「不見不散」
動態：一次顯示一個詞，置中。每個詞用 0.4 秒從 0 放大到 100%，帶過衝回彈（先衝到約 115% 再回到 100%）。同時有 14 條強調色短線從文字中心向四周射出，0.5 秒內飛遠、縮短、消失。停留約 1.4 秒後，用 0.3 秒縮小淡出，換下一個詞。每個詞 2.2 秒。
其他：文字大小跟著畫面縮放，不要超出畫面；只要這一個動畫，不要其他介面或說明文字。
```

### 範例 2：輸出直式綠幕影片

輸入：

```bash
python render.py vpop neon --size 1080x1920 --scheme key --words "今晚八點 首播" --seconds 3 --out out
```

輸出（實際執行結果，秒數為算圖耗時）：

```
out/4_強調/28_霓虹燈管_Neon-flicker.mp4  90 格  8.9s  0.09MB
out/7_綜藝字卡/49_彈出字卡_Pop-caption.mp4  90 格  6.6s  0.31MB
```

兩支都是 1080×1920、30fps、3 秒的 H.264 MP4，綠色底、文字是「今晚八點」「首播」。

### 範例 3：列出動態

輸入：

```bash
python render.py --list
```

輸出（前 4 行）：

```
01  burst      爆出  (Burst)  6.6s
02  hit        逐字重擊  (Hit by hit)  6.54s
03  stamp      蓋章  (Stamp)  7.2s
04  punch      衝向鏡頭  (Punch in)  6.3s
```

### 範例 4：現成的影片

`mp4/7_綜藝字卡/51_集中線_Speed-lines.mp4` 是第 51 式用範例字「震驚」「什麼」輸出的結果：1920×1080、30fps、4.8 秒。

## 64 式一覽

**登場（01–08）** 字一出現就要被看見

| 編號 | id | 名稱 | 英文名 | 預設長度 |
|---|---|---|---|---|
| 01 | `burst` | 爆出 | Burst | 6.6 秒 |
| 02 | `hit` | 逐字重擊 | Hit by hit | 6.54 秒 |
| 03 | `stamp` | 蓋章 | Stamp | 7.2 秒 |
| 04 | `punch` | 衝向鏡頭 | Punch in | 6.3 秒 |
| 05 | `stack` | 左右疊字 | Side stack | 6.8 秒 |
| 06 | `stretch` | 拉長 | Stretch | 6.98 秒 |
| 07 | `through` | 穿過去 | Fly through | 5.7 秒 |
| 08 | `squash` | 落地回彈 | Drop and squash | 6.6 秒 |

**流動（09–16）** 字一直在跑，可以鋪滿畫面當背景

| 編號 | id | 名稱 | 英文名 | 預設長度 |
|---|---|---|---|---|
| 09 | `crawl` | 巨字橫移 | Giant crawl | 8 秒 |
| 10 | `drift` | 直排對流 | Column drift | 8 秒 |
| 11 | `echo` | 重複波浪 | Echo wave | 5.89 秒 |
| 12 | `slant` | 斜帶 | Slant bands | 8 秒 |
| 13 | `path` | 彎道 | Path ribbon | 8 秒 |
| 14 | `ticker` | 多層跑馬燈 | Ticker stack | 8 秒 |
| 15 | `depth` | 遠近直書 | Depth columns | 8 秒 |
| 16 | `tape` | 交叉封條 | Crossed tape | 8 秒 |

**切換（17–24）** 把一個詞換成另一個詞

| 編號 | id | 名稱 | 英文名 | 預設長度 |
|---|---|---|---|---|
| 17 | `flap` | 翻牌看板 | Split flap | 9.6 秒 |
| 18 | `flip` | 翻卡 | Card flip | 9.6 秒 |
| 19 | `type` | 打字機 | Typewriter | 5.68 秒 |
| 20 | `slot` | 拉霸 | Slot reel | 9.9 秒 |
| 21 | `odo` | 跳錶 | Odometer | 7.6 秒 |
| 22 | `swapline` | 標題輪替 | Headline swap | 5.4 秒 |
| 23 | `led` | 點陣看板 | Dot matrix | 8 秒 |
| 24 | `split` | 上下裂開 | Split reveal | 8.8 秒 |

**強調（25–32）** 字已在畫面上，用質感和抖動加情緒

| 編號 | id | 名稱 | 英文名 | 預設長度 |
|---|---|---|---|---|
| 25 | `glitch` | 訊號故障 | Glitch | 5.2 秒 |
| 26 | `marker` | 螢光筆 | Highlighter | 7.8 秒 |
| 27 | `shake` | 抖動 | Shake | 7.2 秒 |
| 28 | `neon` | 霓虹燈管 | Neon flicker | 8 秒 |
| 29 | `bob` | 波浪起伏 | Wave bob | 8.8 秒 |
| 30 | `track` | 字距拉開 | Tracking out | 7.2 秒 |
| 31 | `fill` | 空心填滿 | Outline fill | 6 秒 |
| 32 | `focus` | 對焦 | Focus pull | 6 秒 |

**空間（33–40）** 透視、深度和遮罩

| 編號 | id | 名稱 | 英文名 | 預設長度 |
|---|---|---|---|---|
| 33 | `cube` | 四角柱翻面 | Prism roll | 6 秒 |
| 34 | `crawl3d` | 透視字幕 | Perspective crawl | 8 秒 |
| 35 | `orbit` | 環繞 | Orbit ring | 12 秒 |
| 36 | `tunnel` | 隧道 | Tunnel | 8.4 秒 |
| 37 | `scatter` | 散開聚合 | Scatter assemble | 6.4 秒 |
| 38 | `extrude` | 厚度陰影 | Extrude | 6 秒 |
| 39 | `blinds` | 橫條拼字 | Slice in | 5.2 秒 |
| 40 | `block` | 色塊揭開 | Block reveal | 8.4 秒 |

**歌詞 MV（41–48）** 跟著節拍和句子走

| 編號 | id | 名稱 | 英文名 | 預設長度 |
|---|---|---|---|---|
| 41 | `kara` | 跟唱填色 | Karaoke fill | 5.58 秒 |
| 42 | `popsync` | 逐字踩拍 | Beat by beat | 5.1 秒 |
| 43 | `dual` | 上下兩行 | Two-line karaoke | 8.8 秒 |
| 44 | `beat` | 重拍反白 | Beat flash | 4 秒 |
| 45 | `soft` | 柔焦浮現 | Soft rise | 6.99 秒 |
| 46 | `lyrics` | 歌詞捲動 | Lyric scroll | 9 秒 |
| 47 | `trail` | 重拍殘影 | Echo trail | 4.8 秒 |
| 48 | `mix` | 大小混排 | Type block | 7.6 秒 |

**綜藝字卡（49–56）** 粗外框、亮色、彈來彈去

| 編號 | id | 名稱 | 英文名 | 預設長度 |
|---|---|---|---|---|
| 49 | `vpop` | 彈出字卡 | Pop caption | 6.6 秒 |
| 50 | `slam` | 斜砸下來 | Diagonal slam | 6.6 秒 |
| 51 | `lines` | 集中線 | Speed lines | 4.8 秒 |
| 52 | `marks` | 問號驚嘆號 | Reaction marks | 7.8 秒 |
| 53 | `telop` | 字卡條 | Telop bar | 7.8 秒 |
| 54 | `emph` | 關鍵字放大 | Keyword zoom | 5.6 秒 |
| 55 | `bouncy` | 逐字蹦跳 | Bouncy letters | 5.7 秒 |
| 56 | `star` | 爆炸框 | Starburst | 7.2 秒 |

**恐怖片（57–64）** 忽明忽暗、抖動、緩慢逼近

| 編號 | id | 名稱 | 英文名 | 預設長度 |
|---|---|---|---|---|
| 57 | `flick` | 燈泡將熄 | Dying bulb | 7.2 秒 |
| 58 | `drip` | 往下滴 | Drip | 8.8 秒 |
| 59 | `creep` | 慢慢逼近 | Slow creep | 5.2 秒 |
| 60 | `ghost` | 重影抽搐 | Double vision | 6.8 秒 |
| 61 | `corrupt` | 字被換掉 | Corrupt | 8.8 秒 |
| 62 | `mirror` | 鏡中倒影 | Mirror | 6.4 秒 |
| 63 | `torch` | 手電筒 | Flashlight | 10 秒 |
| 64 | `melt` | 融化拉長 | Melt | 8.4 秒 |

## 已知限制

- 跑馬燈類的影片（09、10、12–16、23、34）頭尾不一定剛好接得上，循環使用時可能需要自己剪。
- 綠幕底搭配有柔光、模糊或半透明的效果（例如 28 霓虹燈管、32 對焦、63 手電筒）去背不會乾淨，這幾式建議直接用深色底疊圖。
- 指令是照頁面上實際的動畫參數寫的，但沒有逐則拿去各家 AI 實測，生成結果可能需要再微調。
- 範例字和範例歌詞是為這個專案另外寫的；影片都沒有聲音。
- 目前沒有自動化測試。

## 專案結構

```
index.html        展示頁（64 式動畫、指令、放大檢視）
render.py         把動畫輸出成 MP4 的腳本
requirements.txt  render.py 的 Python 依賴
prompts.txt       64 則指令的純文字版
mp4/              64 支已輸出的影片，依組別分資料夾
docs/             README 用的預覽圖
LICENSE           MIT 授權
```

## 授權

[MIT](LICENSE)
