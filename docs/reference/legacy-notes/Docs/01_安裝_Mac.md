# 安裝(Mac)— 先查證,再同意,再下載

**這份是依官方說明整理的,我們沒有在 Mac 上實測過。** 請 AI 一步一步跑;每一步先給你看指令,你同意才執行;卡住就停下來。

## 安裝前:AI 必須先給你這張清單,你說「可以」才動手

| 欄位 | 內容 |
|---|---|
| 檔名/套件名 | |
| 來源網址(官方) | |
| 大小 | |
| 官方公布的雜湊值 | |
| 風險 | (例如:沒有數位簽章、會連網嗎、需不需要管理員密碼) |
| 移除方式 | |

答不出其中一欄,就先不要裝。

## 1. Homebrew(套件管理工具)

- 官方網站:`https://brew.sh`。
- **安裝 Homebrew 本身會執行一段從網路下載的安裝程式,而且通常要輸入你的 Mac 密碼。** 這是系統層級的改動,**AI 不要代你裝**,你自己讀過官方說明再決定。
- 如果你不想裝 Homebrew,也可以改用其他官方管道取得 ffmpeg,但每一種都要照上面的清單查證。

## 2. ffmpeg(剪接、合成、輸出)

- Homebrew 官方套件庫有 `ffmpeg`(查詢時看到版本 9.0.2;**以你執行 `brew info ffmpeg` 看到的為準**)。
- 步驟:
  1. `brew info ffmpeg`:看版本、授權、依賴套件、大小。把重點貼給你看。
  2. 你同意後:`brew install ffmpeg`。
  3. 驗證:`ffmpeg -version`、`ffprobe -version`。
- 移除:`brew uninstall ffmpeg`。

## 3. 語音轉文字:whisper.cpp(本機,不上傳)

只有「口播影片」才需要。素材沒有人說話,可以跳過。

- 程式:Homebrew 官方套件庫有 `whisper.cpp`(舊名 `whisper-cpp`;查詢時看到版本 1.9.5,授權 MIT,有 Apple Silicon 的預編譯版本。**Intel Mac 有沒有,要看 `brew info whisper.cpp`**)。
  - `brew info whisper.cpp` → 你同意 → `brew install whisper.cpp`。
  - 安裝後的指令是 `whisper-cli`(版本不同名稱可能不同,以實際為準)。
- **模型要另外下載**,套件不附:
  - 來源:Hugging Face 的 `ggerganov/whisper.cpp`。
  - 我們用的是 `ggml-large-v3-turbo-q5_0.bin`(約 574 MB,2026-11 查到的 SHA-256:`394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2`;**請以官方頁面當下的值為準**)。
  - 下載到一個**空資料夾**,用 `shasum -a 256 檔名` 核對,相符才使用。
  - 模型只是資料檔,不是程式,但仍要核對來源與雜湊。
- 驗證(**不要用有家人的影片測**):先用 Mac 內建的 `say` 唸一句話存成音檔(`say -o test.aiff "…"`,中文語音名稱用 `say -v '?'` 查),再轉成 16 kHz 單聲道 wav(`ffmpeg -i test.aiff -ar 16000 -ac 1 test.wav`),最後 `whisper-cli -m 模型路徑 -f test.wav -l zh -osrt`。**這幾行沒有在 Mac 上實測過。**
- 跑的時候,可以用「活動監視器」或網路監控確認它**沒有連外**(我們在 Windows 上是這樣檢查的)。
- 移除:`brew uninstall whisper.cpp`,再刪掉模型檔。

## 4. 簡體轉繁體

Whisper 的中文輸出常是**簡體**。最簡單的做法:請 Codex 在校對逐字稿時一併轉成你要的用字。要自動轉換的話,OpenCC 之類的工具常被使用,但那是另一個要查證的安裝,**不是必要。**

## 5. macOS 的安全提示

- 如果跳出「無法驗證開發者」之類的提示,**不要為了繞過它去移除隔離屬性或改系統安全設定**。先停下來,把提示內容貼給 AI,查清楚來源再決定。
- 全程**不需要**改系統設定、關閉任何防護。

## 完成後請 AI 做的最後檢查

- 列出「這次裝了什麼、放在哪裡、怎麼移除」,寫進 `進度.md`。
