# 字體：清單、授權、建置與執行時（Phase 3）

> 主清單：`fonts/manifest.json`（來源、sha256、授權、分包、字重）。
> 成品：`public/fonts/<key>/`（woff2＋授權檔＋預覽字樣）、`src/fonts/catalog.generated.json`、`docs/font-coverage.md`（繁體覆蓋率，自動產生）。
> 這些成品都是 `npm run fonts` 產生並 commit 進 repo 的；一般改程式不需要重跑。

## 1. 現況（2026-11-11）

網站裡有 **39 個字體、約 130 MB**（裁切成繁體常用字集後的 woff2）。分 5 包＋英文：
基本包（7）、手寫可愛包（15）、標題設計包（7）、毛筆書法包（2）、日文字體包（8）。覆蓋率見 `docs/font-coverage.md`。

| 狀況 | 字體 |
|---|---|
| ✅ 在網站裡（OFL，裁切成 woff2） | 思源黑體/宋體、jf open 粉圓、饅頭黑體、芫荽、霞鶩文楷、清松手寫體 1–9、內海字體、**大波浪圓體（含注音）**、辰宇落雁、源泉圓體、精品點陣體、Chocolate 古典黑、IBM Plex 黑體、源樣明/黑體、源流明體、源石黑體、源雲明體、正風毛筆、莫大毛筆、日文 8 款（Hachi Maru Pop、Kaisei Decol、Klee One、Shippori 明朝、Yomogi、Yusei Magic、Zen Kaku、Zen Old 明朝）、LINE Seed（英文） |
| ✅ 在網站裡（**原檔照放**，不能改作） | 字言手繪體：授權書允許「連同授權書放到網站/雲端、非營利分享、不可改作」，所以不轉檔不裁切，預覽用圖片 |
| 🚫 **不能放進公開網站**（使用者自己匯入） | 中規中矩體 Proper Script（字型檔寫明 All rights reserved）、星光小熊貓幼兒體（授權禁止把字型檔放到任何網站/雲端供下載）、851 手書き雜（字型檔沒有授權說明） |
| ⏳ 還缺檔（使用者的下載中斷／還沒給） | LINE Seed 繁中（3 檔）、致一宋體、佮逸體。放到 `.font-cache/user/<manifest 的 file 路徑>` 後重跑 `npm run fonts`；致一宋體要先讀授權（見 §4） |

使用者的說明：這些都是開源/免費資源，非商業使用、不改版。**我們仍照字型檔裡寫的授權處理**，因為放進公開網站就是「散布」，授權不允許的就改成讓使用者自己匯入（效果一樣，只是檔案只存在他自己的裝置）。

## 2. 建置流程

```
npm run fonts:setup   # 一次：建立 .venv，裝 fonttools / brotli / pillow
npm run fonts         # 下載 → 核對 → 裁切 → 產生目錄
```
1. `scripts/fetch-fonts.mjs`：讀 manifest 裡 `build: true` 的項目，準備到 `.font-cache/`（不進 git）。順序：已有且 sha256 相符 → `.font-cache/user/<file>` 使用者提供的 → 從 `url` 下載（raw.githubusercontent.com，4 個一起，失敗重試 3 次）。**大小/雜湊對不上不會覆蓋**，只回報（可能上游更新了，請人確認後再改 manifest）。沙盒要走代理，所以腳本用 `NODE_USE_ENV_PROXY=1`。
2. `scripts/build-fonts.py`（`python -I`，用 `.venv`）：
   - 字集：Big5 常用字 5401＋次常用字 7652（用 Python 的 `big5` codec 產生）＋拉丁、標點、假名、**注音**、直排標點、全形、符號。不在字體裡的字會直接略過。
   - 裁切成 woff2：關掉 hinting、保留常用 OpenType 功能；可變字體（思源）保留字重軸。
   - OFL 字體：內部名稱加 `VC Subset`（OFL 規定修改版不能沿用字型名稱）；每個字體附 `OFL.txt`（版權行＋來源＋OFL 全文）。
   - 預覽字樣：每個字體另做一個幾 KB 的 `preview.woff2`（只有名稱和「永遠的家 Aa 123」），下拉選單用；原檔照放的字體改用 PNG 圖片。
   - 算繁體覆蓋率 → `docs/font-coverage.md` 和目錄；用 `build-stamps.json` 跳過沒變的，`--force` 強制重做。
3. 產出的 `public/fonts/` **要 commit**（GitHub Pages 直接提供）。容量預算：整站 ≤ 400 MB（Pages 上限 1 GB），目前約 130 MB。
4. 新增字體：在 manifest 加一筆（`key`、`label`、`weight`、`pack`、`url`、`bytes`、`sha256`、`license`、`build: true`）→ 跑 `npm run fonts` → 看 `docs/font-coverage.md` → 授權檔和目錄跟著產生。
5. **授權判斷以字型檔的 name table 為準**：用 fontTools 讀 nameID 0/13/14，再找作者發布頁。寫明 OFL → 照放；不允許散布 → manifest 標 `personal: true`、`build: false`，並加到 `personal_fonts`（設定頁的授權說明會列出來）。測試 `src/fonts/catalog.test.ts` 會擋掉不該出現在網站的字體。

## 3. 執行時（`src/fonts/`）

- `catalog.ts`：讀目錄、包的大小、覆蓋率標籤（≥99% 完整、95–99% 少量缺字、<95% 繁體缺字多、英文字體）。
- `fontStore.ts`：
  - **下載**到 Cache Storage（`vc-fonts-v1`），已下載清單記在 IndexedDB（`installedFonts`）。之後都從快取讀，**不再詢問**；快取被清掉時，用到那個字體會自動重新下載。沒有 Cache Storage（無痕模式）就每次從網路抓，功能不受影響。
  - **載入**：`new FontFace(家族名, 檔案內容)` → `document.fonts.add`。字卡畫布用這個家族名＋備用字體（`FALLBACK_STACK`，缺字時補）。畫字卡時如果字體還沒載入，會先用備用字體畫、背景載入，載好後 `epoch+1` 觸發預覽重畫（`textRender` 的快取鍵包含「各字體載入了沒」）。
  - **預覽字樣**：下拉選單打開才載，一次最多 6 個。
  - **匯入自己的字體**：.ttf/.otf/.woff/.woff2，先確認瀏覽器讀得懂（壞檔不存），存到這台裝置的 IndexedDB（`userFonts`），名稱從 name table 讀（讀不到就用檔名）。fontId 是 `u:<id>`。不上傳到任何地方。
- UI：字卡分頁的 `FontSelect`（每個字體用自己的字形顯示名稱、標示已下載/大小/繁體缺字/只有英文、底部「匯入字體檔」）；設定頁的字體管理（各包下載/移除、我的字體、授權與來源、儲存空間）；首次使用精靈第 3 步。
- 備註：iPhone Safari 不能讓網頁自動把檔案存進「檔案」App 的下載資料夾，所以官方字體存在瀏覽器裡（比下載資料夾可靠）；使用者自己的字體用「匯入字體檔」從「檔案」App（含 iCloud、Google Drive）選。

## 4. 待辦與注意

- **缺檔**：LINE Seed 繁中（`LINESeedTW/LINESeedTW_TTF_{Rg,Bd,Eb}.ttf`）、致一宋體（`ZhiyiSerif/致一宋體-Regular.ttf`）、佮逸體（`Kahik/Kahikfontproportional.ttf`，來源是使用者的 Drive 資料夾，字型檔內附 OFL 說明）。使用者重新下載後放到 `.font-cache/user/` 或上傳到對話。
- **致一宋體**授權還沒確認（檔案沒收到）。收到後讀 name table；寫明可散布才放進網站。
- 日文字體繁體覆蓋率 82–88%（缺字會自動改用備用字體畫）；清松手寫體 2、4 缺字多（89–92%）。選單裡有標示。
- **罕用字**：目前只收常用字＋次常用字（約 13,000 字）。閩南語/客語等罕用字（例如大波浪圓體補的那些）還沒收進網站；之後可以加第二個裁切檔（`unicode-range`）。
- 同一種字體的粗體：清單只放有的字重；沒有粗體的字體選「粗體」時，瀏覽器會用合成粗體（會比較糊，之後字卡引擎改用描邊加粗，見 TEXT_CARDS.md）。
- Zizi app 對照：饅頭黑體 ✅、中規中矩體＝Proper Script（個人匯入）、星光手體＝星光小熊貓幼兒體（個人匯入）、致一宋體（缺檔）。
- 單線手寫動畫用的 Hershey Script（公有領域路徑資料，不是字型）還沒做，屬於字卡動畫（Phase 4）。
