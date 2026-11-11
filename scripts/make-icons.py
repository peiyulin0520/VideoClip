"""產生 PWA 圖示（自繪：深色底＋粉紅播放三角＋時間軸條，不使用任何第三方圖案）。
用法：python3 -I scripts/make-icons.py public/icons
"""
import sys, os
from PIL import Image, ImageDraw

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
BG, PINK, WHITE = (17, 17, 17), (255, 77, 141), (244, 244, 244)

def draw(size, pad):
    S = size * 4  # 超取樣
    im = Image.new('RGB', (S, S), BG)
    d = ImageDraw.Draw(im)
    p = int(S * pad)
    inner = S - 2 * p
    d.rounded_rectangle([p, p, S - p, S - p], radius=int(inner * 0.22), fill=(34, 34, 34))
    # 播放三角
    cx, cy = S * 0.5, S * 0.44
    r = inner * 0.22
    d.polygon([(cx - r * 0.8, cy - r), (cx - r * 0.8, cy + r), (cx + r * 1.1, cy)], fill=PINK)
    # 時間軸條
    y0 = S * 0.70
    h = inner * 0.07
    x0 = p + inner * 0.16
    d.rounded_rectangle([x0, y0, x0 + inner * 0.68, y0 + h], radius=h / 2, fill=WHITE)
    d.rounded_rectangle([x0, y0, x0 + inner * 0.34, y0 + h], radius=h / 2, fill=PINK)
    return im.resize((size, size), Image.LANCZOS)

draw(192, 0.06).save(os.path.join(out, 'icon-192.png'))
draw(512, 0.06).save(os.path.join(out, 'icon-512.png'))
draw(512, 0.20).save(os.path.join(out, 'icon-maskable-512.png'))   # maskable：內容放在安全區內
draw(180, 0.0).save(os.path.join(out, 'apple-touch-icon.png'))
draw(64, 0.04).save(os.path.join(out, 'favicon.png'))
print('ok')
