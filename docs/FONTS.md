# 字體清單與取得方式（Phase 3，R18、R19）

> 原則：**只把允許再散布的免費字體（SIL OFL 1.1 等）放進公開 repo**。個人使用授權、來源不明的字體**不放 repo**，改由使用者自己匯入（存在自己的裝置或 Google Drive）。
> 每款字體附授權檔：`public/fonts/<id>/OFL.txt`；`src/fonts/catalog.ts` 記錄名稱、作者、來源網址、授權、版本、SHA-256、繁體覆蓋率。
> 授權欄是 2026-11 查到的紀錄，**下載時請再看一次官方頁面確認**。

## 1. 取得管道（沙盒網路實測，2026-11-11）

| 管道 | 狀態 | 用法 |
|---|---|---|
| npm `@fontsource/*` | ✅ 可用（registry.npmjs.org） | `npm i @fontsource/<名稱>`；已切好 unicode-range 分塊的 woff2，瀏覽器只下載用到的字 |
| `raw.githubusercontent.com` | ✅ 可用 | 下載 GitHub repo 裡的字體檔（先讀該 repo 的 README 找確切路徑） |
| `github.com` / Release 下載 / `api.github.com` | ❌ 被擋（403） | 需要的話請使用者在環境網路設定加入 `github.com`、`objects.githubusercontent.com` |
| `cdn.jsdelivr.net` | ❌ 被擋 | 不要依賴 |
| `drive.google.com` | ❌ 被擋 | 佮逸體請使用者另外提供檔案 |
| `fonts.googleapis.com` | ✅ 可用 | 只當預覽參考；正式用 fontsource（自架、可離線） |

## 2. 自架字體的處理流程（`scripts/`）
1. `scripts/fetch-fonts.mjs`：依 catalog 下載原始 TTF/OTF 到 `.font-cache/`（加進 `.gitignore`，**原始檔不進 git**），計算 SHA-256。
2. `scripts/build-fonts.py`（`pip install fonttools brotli`；執行時加 `-I`）：
   - 用 `pyftsubset` 轉成 woff2，並切 2 塊：
     - 塊 A：ASCII＋全形標點＋注音＋**Big5 常用字 5401 字**（Big5 0xA440–0xC67E，可用 Python 內建 `big5` codec 產生，不用另外下載字表）
     - 塊 B：其餘所有字
   - 產生 `@font-face`（含 `unicode-range`）CSS。
   - 計算**繁體覆蓋率**＝字型 cmap 含有的 Big5 常用字數 / 5401，另算次常用字（0xC940–0xF9D5）覆蓋率，寫進 `docs/font-coverage.md` 與 catalog。
3. 覆蓋率標示：≥ 99% 完整；95–99% 少量缺字；< 95% 在字體選單標「繁體缺字多」。
4. 執行時缺字 fallback：`font-family: "<字體>", "Noto Sans TC", sans-serif`；Canvas 繪製時要逐字檢查（`document.fonts.check`＋字型 cmap 資料），缺字的字改用 fallback 畫，並在字卡面板提示「此字體缺 N 個字」。
5. Canvas 繪製前一定要 `await document.fonts.load('64px "<字體>"', 文字)`，匯出前把整支片用到的所有文字都預先載入，否則會畫出預設字體。

## 3. 首次使用的下載包（使用者勾選，預設勾「基本包」）

### 基本包（預設下載，約 25–40 MB woff2）
| 字體 | 風格 | 來源 | 授權 |
|---|---|---|---|
| 思源黑體 Noto Sans TC | 標準黑體（也是 fallback） | `@fontsource/noto-sans-tc` | OFL 1.1 |
| 思源宋體 Noto Serif TC | 明體 | `@fontsource/noto-serif-tc` | OFL 1.1 |
| jf open 粉圓 | 非常圓潤 | `@fontsource/huninn`（或 GitHub justfont/open-huninn-font） | OFL 1.1 |
| **饅頭黑體 Mantou Sans** | 粗厚可愛日系黑體（Zizi 字體之一，雲朵字推薦） | raw：`mant0u0/MantouSans/main/Font/MantouSans-Regular.ttf`（已確認 README 寫的路徑） | OFL 1.1（基於 Dela Gothic One；保留名稱「饅頭黑體」） |
| 霞鶩文楷 TC | 楷體、文青 | `@fontsource/lxgw-wenkai-tc` | OFL 1.1 |
| 芫荽 Iansui | 手寫楷體感 | `@fontsource/iansui` | OFL 1.1 |

### 手寫可愛包
| 字體 | 風格 | 來源（raw.githubusercontent.com 上的 repo；確切檔名請先讀 README） | 授權 |
|---|---|---|---|
| 清松手寫體 1–8（至少 3 呆萌、4 POP、6 Q 萌、8 隨性） | 手寫 | `jasonhandwriting/JasonHandwriting` | OFL（作者 README 標示） |
| 悠哉字體 Yozai | 輕鬆手寫 | `lxgw/yozai-font` | OFL 1.1 |
| 內海字體 Naikai | 圓潤粗手寫 | `max32002/naikaifont`（檔案在 `tw/NaikaiFont-Regular.ttf`；分支名稱請確認，`main` 讀不到 README） | OFL 1.1 |
| 辰宇落雁體 | 細毛筆手寫 | `Chenyu-otf/chenyuluoyan_thin` | OFL 1.1 |
| 源泉圓體 GenSen Rounded | 圓體 | `ButTaiwan/gensen-font` | OFL 1.1 |
| 獅尾四季春 Swei Spring | 柔和黑體 | `max32002/swei-spring` | OFL 1.1 |
| 俐方體 11 號 Cubic 11 | 像素點陣（可愛復古） | `ACh-K/Cubic-11` | OFL 1.1 |

### 標題/設計包
| 字體 | 來源 | 授權 |
|---|---|---|
| 獅尾黑體 Swei Gothic | `max32002/swei-gothic` | OFL 1.1 |
| 源樣明體 GenYoMin | `ButTaiwan/genyo-font` | OFL 1.1 |
| 昭源黑體香港 Chiron Hei HK | `@fontsource/chiron-hei-hk` | OFL 1.1 |
| 注音楷體 Bpmf Zihi Kai | `@fontsource/bpmf-zihi-kai-std` | OFL 1.1 |

### 日文字體包（部分支援繁體，**一定要跑覆蓋率**，缺字自動 fallback）
| 字體 | 風格 | npm |
|---|---|---|
| Klee One | 手寫教科書體 | `@fontsource/klee-one` |
| Zen Maru Gothic | 圓黑體 | `@fontsource/zen-maru-gothic` |
| Kiwi Maru | 可愛圓明體 | `@fontsource/kiwi-maru` |
| M PLUS Rounded 1c | 圓體 | `@fontsource/m-plus-rounded-1c` |
| Hachi Maru Pop | 超可愛圓手寫 | `@fontsource/hachi-maru-pop` |
| Mochiy Pop One | 可愛粗 POP | `@fontsource/mochiy-pop-one` |
| Yusei Magic | 麥克筆手寫 | `@fontsource/yusei-magic` |
| Zen Kurenaido | 筆刷手寫 | `@fontsource/zen-kurenaido` |
| Yuji Syuku | 書法 | `@fontsource/yuji-syuku` |
| Dela Gothic One | 粗黑（饅頭黑體的原型） | `@fontsource/dela-gothic-one` |
| Potta One / Rampart One / Reggae One / DotGothic16 | 綜藝感、立體、像素 | `@fontsource/<名稱>` |

（以上 npm 套件 2026-11-11 已確認存在，授權 OFL-1.1。）

### 英文字體包（Vlog 標題用，Google Fonts / fontsource，OFL）
手寫/草寫：Great Vibes、Allura、Parisienne、Sacramento、Dancing Script、Pacifico、Satisfy、Caveat、Homemade Apple（授權請確認，若非 OFL 就換）、Shadows Into Light。
襯線：Playfair Display、Cormorant Garamond、DM Serif Display、Bodoni Moda、Abril Fatface、Cinzel。
無襯線/其他：Montserrat、Bebas Neue、Fredoka、Baloo 2、Courier Prime（等寬小字）。
單線手寫動畫：Hershey Script（公有領域，`handwrite` 動畫用的路徑資料，不是一般字型）。

### 書法包（⚠ 簡體字形，繁體會缺字；選單標示）
志莽行書 Zhi Mang Xing、劉建毛草 Liu Jian Mao Cao、馬善政 Ma Shan Zheng、龍藏體 Long Cang、站酷快樂體 ZCOOL KuaiLe（Google Fonts，OFL）。

## 4. 使用者點名但**不能直接放進 repo** 的字體

| 字體 | 狀況 | 做法 |
|---|---|---|
| 佮逸體 Kahik | 使用者舊筆記記錄：作者逸嘉 Wang, YI CHIA，作者說明為 SIL OFL 1.1；來源是 Google Drive 分享資料夾 `https://drive.google.com/drive/folders/1OnXPY_aZZ4a1SzrJnnS_JPUwwDcb5VGc`（非官方發布頁）；當時的 SHA-256：`0d5c2aeae4b38c12eb7bcfb642339a38aa3149f991844023111316857474308c`、6187256 bytes。網路搜尋找不到官方頁。 | 使用者同意放字庫。請使用者把 TTF **直接上傳到 Sonnet 的對話**（或放進 repo 的 `.font-cache/`），核對 SHA-256 一致後處理。若檔內 name table 的授權欄確實是 OFL，就和其他 OFL 字體一樣放進 `public/fonts/kahik/` 並附 OFL.txt；若授權不明，改成「個人字體」：只放使用者自己的 Drive，App 用「匯入字體」載入，不進公開 repo。 |
| 饅頭黑體（Zizi） | ✅ 找到官方 GitHub，OFL | 已列入基本包 |
| 中規中矩體（Zizi） | ❌ 網路搜尋找不到公開來源 | 請使用者提供作者或下載網址；若只能從 Zizi app 取得檔案，屬於個人使用 → 用「匯入字體」載入 |
| 星光手體（Zizi） | ❌ 同上 | 同上 |

## 5. 「匯入字體」功能（必做）
- 設定頁與字體下拉選單底部都有「＋匯入字體」：選 .ttf/.otf/.woff/.woff2（iPhone 檔案 App 可直接選 Google Drive 裡的檔案）。
- 讀取字型 name table 取名稱，存 OPFS `fonts/`，用 `FontFace` API 註冊；計算繁體覆蓋率。
- 這些字體**只存在該裝置**（P6 完成後可同步到使用者自己的 Drive `VideoClip/fonts/`）。

## 6. 首次使用 → 之後讀快取（使用者的需求）
- 第一次：詢問「第一次在這台裝置使用嗎？」→ 勾選字體包 → 下載到 Cache Storage → IndexedDB 記錄 `installedFonts`。
- 之後：直接從快取讀，不再詢問。快取被清掉時，自動提示重新下載缺少的字體。
- 字體檔放在 GitHub Pages（同網域），**不要從 Google Drive 載入字體給網頁用**（Drive 有 CORS 與下載量限制，也會讓別人用這個網址時讀不到）。Drive 只用來備份使用者的個人字體與專案。
