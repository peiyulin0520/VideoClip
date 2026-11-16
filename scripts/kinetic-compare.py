#!/usr/bin/env python3
"""把 .kinetic-compare/ 裡原版與我們的畫面拼成對照圖（每一式一張：上排原版、下排我們，5 個時間點）。
用法：KINETIC_COMPARE=1 npx playwright test e2e/kinetic-compare.spec.ts --trace off，再 python3 -I scripts/kinetic-compare.py"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

root = Path('.kinetic-compare')
ids = json.loads((root / 'ids.json').read_text())
only = sys.argv[1:] or ids
out = root / 'sheets'
out.mkdir(exist_ok=True)
SIZE = (400, 225)  # 每一格縮成這個大小（原版截圖在高解析度裝置上是 3 倍大，統一縮放才對得齊）
for id_ in only:
    cols = []
    for row in ('orig', 'ours'):
        ims = []
        for i in range(5):
            p = root / f'{id_}-{i}-{row}.png'
            if not p.exists():
                break
            im = Image.open(p).convert('RGBA')
            bg = Image.new('RGBA', im.size, (60, 60, 60, 255))
            bg.alpha_composite(im)
            ims.append(bg.convert('RGB').resize(SIZE))
        cols.append(ims)
    if not cols[0]:
        continue
    w, h = cols[0][0].size
    sheet = Image.new('RGB', (w * len(cols[0]), h * 2 + 18), (20, 20, 20))
    d = ImageDraw.Draw(sheet)
    d.text((4, 2), f'{id_}  上排＝原版　下排＝我們', fill=(255, 255, 255))
    for r, ims in enumerate(cols):
        for c, im in enumerate(ims):
            sheet.paste(im, (c * w, 18 + r * h))
    sheet.save(out / f'{id_}.png')
print('done', len(only))
