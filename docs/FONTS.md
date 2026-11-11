# 字體清單與取得方式（Phase 3，R18、R19）

> **主清單是 `fonts/manifest.json`**（78 個字體檔：名稱、分包、下載網址、大小、SHA-256、授權、是否放進網站）。它是依使用者 2026-11-08 的下載紀錄整理的。這份文件說明怎麼用它。
> 原則：只放允許再散布的字體（SIL OFL 1.1 等），每款附授權檔 `public/fonts/<family>/OFL.txt`。使用者確認這些字體都是開源免費、**非商業使用、不改版**。
> 授權欄 `unverified` 的 4 款要先確認（見 §4），不要跳過。

## 1. 取得管道（沙盒網路實測，2026-11-11）

| 管道 | 狀態 | 用法 |
|---|---|---|
| `raw.githubusercontent.com` | ✅ 可用 | manifest 裡大部分字體的 `url` 都在這裡。大檔（內海字體 30 MB 以上）曾經逾時：curl 用 `--max-time 600 --retry 3`，失敗就重試 |
| npm `@fontsource/*` | ✅ 可用 | 英文字體（Vlog 標題用）直接裝 npm 套件 |
| `github.com` Release / `api.github.com` | ❌ 被擋 | 不要依賴 |
| `drive.google.com` | ❌ 被擋 | 佮逸體請使用者上傳檔案 |
| `cdn.jsdelivr.net` | ❌ 被擋 | 不要依賴 |

## 2. 建置流程（`npm run fonts`）
1. `scripts/fetch-fonts.mjs`：讀 `fonts/manifest.json`，只處理 `build: true` 的項目：
   - 有 `url` 的就下載到 `.font-cache/<file>`；`needsUserFile: true` 的到 `.font-cache/user/` 找使用者上傳的檔案，找不到就列出清單並跳過，不要讓整個建置失敗。
   - 每個檔都要核對 `bytes` 與 `sha256`。不一致代表上游更新了：停下來回報，不要直接覆蓋。使用者確認後再更新 manifest。
   - `.font-cache/` 加進 `.gitignore`，**原始 TTF/OTF 不進 git**。
2. `scripts/build-fonts.py`（`pip install fonttools brotli`；用 `python3 -I` 執行）：
   - 用 `pyftsubset` 轉成 woff2，每個字體切成 2 塊：
     - 塊 A：ASCII、全形標點、注音、**Big5 常用字 5401 字**（Big5 0xA440–0xC67E，用 Python 內建 `big5` codec 產生）
     - 塊 B：其餘所有字
   - 輸出到 `public/fonts/<family>/`，附 OFL.txt；產生 `@font-face` CSS（含 `unicode-range`）與 `src/fonts/catalog.generated.ts`。
   - 計算**繁體覆蓋率**：常用字 5401 字＋次常用字（Big5 0xC940–0xF9D5），寫進 `docs/font-coverage.md` 與 catalog。manifest 裡的 `sampleCoverage` 只是使用者之前用一小段測試字算的，日文字體缺「歲爸你溫」等字，以新算的為準。
3. **轉好的 woff2 要 commit 進 repo**（`public/fonts/`）：GitHub Pages 直接提供，不用每次部署都重新下載。只有 manifest 變動時才重建，避免 repo 歷史變肥。
4. 容量預算：`build: true` 的原始檔約 524 MB，轉成 woff2 估計 250–320 MB。**`public/fonts/` 總量要在 400 MB 以內**（GitHub Pages 整站上限 1 GB）。超過就先把粗體、細體這類額外字重改成 `build: false`，並跟使用者確認。
5. 覆蓋率標示：≥ 99% 完整；95–99% 少量缺字；< 95% 在字體選單標「繁體缺字多」。
6. 缺字 fallback：`font-family: "<字體>", "Noto Sans TC", sans-serif`。Canvas 繪製時逐字檢查 cmap，缺的字用 fallback 畫，字卡面板提示「此字體缺 N 個字」。
7. Canvas 繪製前一定要 `await document.fonts.load('64px "<字體>"', 文字)`；匯出前先載入整支片用到的所有文字。

## 3. 分包（首次使用時勾選，預設勾「基本包」）

`build: true` 代表放進網站，`false` 只記錄在清單（多餘的字重）。

| 包 | 字體（放進網站的字重） |
|---|---|
| **基本包** | 思源黑體 Noto Sans TC（可變字重）、思源宋體 Noto Serif TC（可變字重）、jf open 粉圓、**饅頭黑體**、霞鶩文楷 TC（Regular、Medium）、芫荽、LINE Seed TW（Rg、Bd、Eb）＊ |
| **手寫可愛包** | 清松手寫體 1–9、**佮逸體**（比例版）＊、內海字體（Regular）、辰宇落雁體、源泉圓體（R、B）、**字言字型手繪體**＊、**星光小熊貓幼兒體**＊、**中規中矩體 Proper Script**＊、精品點陣體 9×9（R、B） |
| **標題設計包** | 源石黑體（R、B）、源樣黑體（R、B）、源樣明體（R、B）、源流明體（R）、源雲明體、**致一宋體**＊、Chocolate Classical Sans、IBM Plex Sans TC（R、B） |
| **毛筆書法包** | 正風毛筆（Regular）、莫大毛筆（Regular） |
| **日文字體包** | Klee One（R、SemiBold）、Shippori Mincho（R）、Zen Old Mincho、Zen Kaku Gothic New、Kaisei Decol、Yomogi、Yusei Magic、Hachi Maru Pop |
| **英文字體**（npm fontsource，不需勾選，隨網站載入） | 手寫：Great Vibes、Allura、Parisienne、Sacramento、Dancing Script、Pacifico、Satisfy、Caveat、Shadows Into Light；襯線：Playfair Display、Cormorant Garamond、DM Serif Display、Bodoni Moda、Abril Fatface、Cinzel；其他：Montserrat、Bebas Neue、Fredoka、Baloo 2、Courier Prime |

＊ ＝ `needsUserFile`：沒有可直接下載的網址，**要使用者上傳檔案**（見 §4）。

Zizi app 字體對照：饅頭黑體 ✅、中規中矩體 = Proper Script ✅（檔案由使用者提供）、使用者說的「星光手體」= 星光小熊貓幼兒體（檔案由使用者提供）、Zizi 的「一致宋體」= 致一宋體（檔案由使用者提供）。

單線手寫動畫另用 Hershey Script（公有領域路徑資料，不是一般字型）。

## 4. 需要使用者提供檔案的字體

| 字體 | 檔案 | 授權狀態 | 怎麼做 |
|---|---|---|---|
| 佮逸體 | `Kahik/Kahikfontproportional.ttf`（必要）、`Kahikfontmonospaced.ttf`（選用） | OFL 1.1（使用者的分享資料夾附有作者授權文字） | 請使用者上傳，核對 sha256 後建置 |
| LINE Seed TW | `LINESeedTW/LINESeedTW_TTF_{Rg,Bd,Eb}.ttf` | OFL 1.1（line/seed README 寫明） | GitHub 只有原始碼；字型檔要從 seed.line.me 的下載包取得，請使用者上傳 |
| 中規中矩體 Proper Script | `ProperScript/ProperScript-Regular.ttf` | unverified | 上傳後先確認授權 |
| 星光小熊貓幼兒體 | `StarPandaKidsFonts/StarPandaKidsBeta2.1.otf` | unverified | 同上 |
| 字言字型手繪體 | `FancyFreeFont/Fancy-FreeFont1_V1_1.ttf` | unverified | 同上 |
| 致一宋體 | `ZhiyiSerif/致一宋體-Regular.ttf` | unverified | 同上 |

**unverified 的確認方式**：用 fontTools 讀字型 name table 的 nameID 13（授權說明）與 14（授權網址），並搜尋作者的發布頁。
- 寫明 OFL 或允許再散布 → 照一般字體放進網站。
- 寫明「僅供個人使用」或「不得散布」→ **不放進公開網站**，改成使用者個人字體：用「匯入字體」載入，或存在使用者自己的雲端 `VideoClip/fonts/`，換裝置時自動同步（見 PLAN.md Phase 6）。這不影響使用者自己使用。
- 把結果記進 manifest 的 `license` 欄位，並向使用者回報。

使用者上傳的檔案放在 `.font-cache/user/<file>`（路徑與 manifest 的 `file` 欄位一致），不進 git。

## 5. 「匯入字體」功能（必做）
- 設定頁與字體下拉選單底部都有「＋匯入字體」：選 .ttf/.otf/.woff/.woff2（iPhone 檔案 App 可以直接選 Google Drive 裡的檔案）。
- 讀字型 name table 取名稱，存到 OPFS `fonts/`，用 `FontFace` API 註冊，並計算繁體覆蓋率。
- 這些字體存在該裝置。備份位置選「Google 雲端」的話，會同步到使用者自己 Drive 的 `VideoClip/fonts/`，換裝置登入後自動下載；選「手機檔案」則包含在備份 .zip 裡。

## 6. 首次使用 → 之後讀快取
- 第一次：首次使用精靈的第 3 步勾選字體包 → 從網站（同網域 `public/fonts/`）下載到 Cache Storage → IndexedDB 記錄 `installedFonts`。
- 之後：直接從快取讀，不再詢問。快取被清掉時，自動提示重新下載缺少的字體。
- 字體由 GitHub Pages 提供，**不從 Google Drive 載入字體給網頁用**（Drive 有 CORS 與下載量限制）。
