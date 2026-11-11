# CLAUDE.md

**請先完整讀 [`AGENTS.md`](AGENTS.md)**（規則、指令、紀錄規則都在那裡，是給所有 AI 共用的唯一版本），再讀 `docs/PROGRESS.md` 的「交接快照」與 `docs/HANDOFF.md`。

Claude Code 在雲端沙盒執行時的補充：
- 沙盒已裝好 Chromium＋Playwright：**不要**執行 `playwright install`；跑 e2e 加 `--trace off`。沒有 WebKit。
- 沙盒的網路只能連 `raw.githubusercontent.com`、npm、pypi；`github.com`（release、api）和 `drive.google.com` 會被擋。Node 腳本要走代理時加 `NODE_USE_ENV_PROXY=1`。
- 沙盒的 Chromium 沒有 H.264，測試影片用 WebM（`tests/fixtures/`）。
- 下載的檔案放專用空資料夾（`.font-cache/`），讀它們的 Python 用 `python3 -I`。
- GitHub 操作用 GitHub MCP 工具（沒有 `gh` CLI）。
