測試素材（用 ffmpeg 產生，沒有真人）。Chromium 沒有 H.264，所以用 WebM（VP8/Opus）。

- clip-a.webm：testsrc2，320×568 直式，2 秒，有聲音（440Hz）
- clip-b.webm：smptebars，320×568 直式，1.6 秒，沒有聲音
- clip-c.webm：testsrc，480×270 橫式，3 秒，有聲音（660Hz）
- photo.png：400×300 漸層圖
- solid-red.webm / solid-green.webm / solid-blue.webm：純色 320×568 直式，4 秒，沒有聲音（Phase 2 疊圖層測試用，可以用取樣顏色判斷誰在上面）
- mini-font.ttf：從芫荽 Iansui（SIL OFL 1.1，https://github.com/ButTaiwan/iansui）裁切出幾個字的小字體，測試「匯入字體」用
- big-1080p.webm：testsrc2，1920×1080 橫式，2 秒，有聲音（550Hz）。長邊超過 1280，匯入後會自動做預覽用輕量影片（proxy，測試用）
- music-4s.wav：880Hz、4 秒、單聲道，每秒前半響後半輕（背景音樂測試用，波形看得出起伏）
- long-90s.webm：160×284 直式，90 秒，前 45 秒純紅、後 45 秒純藍，2fps，沒有聲音（時間軸縮圖超過 60 秒也要鋪滿的測試用；`ffmpeg -f lavfi -i color=c=red:s=160x284:r=2:d=45 -f lavfi -i color=c=blue:s=160x284:r=2:d=45 -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0" -c:v libvpx -b:v 20k -g 20 long-90s.webm`）
