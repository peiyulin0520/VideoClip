#!/usr/bin/env python3
"""把 .font-cache/ 裡的字體原檔轉成網站用的 woff2（裁切成繁體中文常用字集），
產生 public/fonts/<key>/ 與 src/fonts/catalog.generated.json、docs/font-coverage.md。

用法：.venv/bin/python -I scripts/build-fonts.py [--force]
（.venv 的建立：python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt）

規則：
- 授權是 OFL 的：裁切成 woff2，並把內部的字體名稱加上「VC Subset」（OFL 規定修改版不能用保留字型名稱）。
- unmodified（原檔不能改作，例如字言手繪體）：原檔照放，不轉檔不裁切；預覽用「畫成圖片」的方式。
- personal（授權不允許散布）：不處理。
"""
import json
import hashlib
import shutil
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.font-cache'
OUT = ROOT / 'public' / 'fonts'
CATALOG = ROOT / 'src' / 'fonts' / 'catalog.generated.json'
BUILDER_VERSION = 3
FORCE = '--force' in sys.argv


def big5_chars(ranges):
    out = []
    for lo_b, hi_b in ranges:
        for hi in range(lo_b >> 8, (hi_b >> 8) + 1):
            for lo in range(0x40, 0xFF):
                code = (hi << 8) | lo
                if code < lo_b or code > hi_b:
                    continue
                try:
                    ch = bytes([hi, lo]).decode('big5')
                except UnicodeDecodeError:
                    continue
                if len(ch) == 1:
                    out.append(ch)
    return out


COMMON = big5_chars([(0xA440, 0xC67E)])  # 常用字 5401
RARE = big5_chars([(0xC940, 0xF9D5)])  # 次常用字 7652
EXTRA_RANGES = [
    (0x20, 0x7E), (0xA0, 0xFF), (0x100, 0x17F),  # 拉丁
    (0x2000, 0x206F), (0x2100, 0x214F), (0x2190, 0x21FF), (0x2460, 0x24FF),  # 標點、箭頭、圈圈數字
    (0x25A0, 0x25FF), (0x2600, 0x26FF), (0x2700, 0x27BF),  # 幾何、符號
    (0x3000, 0x303F), (0x3040, 0x30FF),  # CJK 標點、假名
    (0x3100, 0x312F), (0x31A0, 0x31BF), (0x02C7, 0x02CB),  # 注音
    (0xFE10, 0xFE1F), (0xFE30, 0xFE4F), (0xFF00, 0xFFEF),  # 直排標點、全形
]
CHARSET = set(map(ord, COMMON)) | set(map(ord, RARE))
for a, b in EXTRA_RANGES:
    CHARSET |= set(range(a, b + 1))

PREVIEW_SAMPLE = ' 永遠的家 Aa Bb 123'


def options(preview=False):
    o = subset.Options()
    o.flavor = 'woff2'
    o.layout_features = ['kern', 'liga', 'ccmp', 'locl', 'calt', 'vert', 'vrt2', 'vkrn', 'vpal', 'palt', 'chws'] if not preview else ['kern']
    o.name_IDs = ['*']
    o.name_languages = ['*']
    o.notdef_outline = True
    o.glyph_names = False
    o.hinting = False
    o.desubroutinize = True
    o.legacy_kern = False
    o.drop_tables += ['DSIG', 'EBDT', 'EBLC', 'EBSC', 'FFTM', 'prop', 'Feat', 'Glat', 'Gloc', 'Silf', 'Sill']
    return o


def rename_for_subset(font):
    """修改版不能沿用原字體名稱（OFL）：在內部名稱後面加 VC Subset。"""
    for rec in font['name'].names:
        try:
            s = rec.toUnicode()
        except Exception:
            continue
        if rec.nameID in (1, 4, 16):
            rec.string = s + ' VC Subset'
        elif rec.nameID == 6:
            rec.string = s + '-VCSubset'
        elif rec.nameID == 3:
            rec.string = s + ';VCSubset'


def weight_of(font):
    try:
        return font['OS/2'].usWeightClass
    except Exception:
        return None


def coverage(cmap):
    common = sum(1 for ch in COMMON if ord(ch) in cmap)
    rare = sum(1 for ch in RARE if ord(ch) in cmap)
    return {
        'common': round(100 * common / len(COMMON), 1),
        'rare': round(100 * rare / len(RARE), 1),
        'missingCommon': len(COMMON) - common,
        'bopomofo': all(ord(c) in cmap for c in 'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦㄧㄨㄩ'),
    }


def build_face(args):
    entry, src, dst = args
    font = TTFont(src, lazy=False)
    cmap = font.getBestCmap()
    cov = coverage(cmap)
    wcls = weight_of(font)
    sub = subset.Subsetter(options())
    sub.populate(unicodes=sorted(CHARSET & set(cmap)))
    sub.subset(font)
    rename_for_subset(font)
    dst.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = 'woff2'
    font.save(dst)
    return {'file': entry['file'], 'cov': cov, 'wcls': wcls, 'glyphs': len(cmap), 'bytes': dst.stat().st_size, 'copyright': copyright_of(src)}


def copyright_of(src):
    f = TTFont(src, lazy=True)
    r = f['name'].getName(0, 3, 1, 0x409) or f['name'].getName(0, 1, 0, 0)
    return str(r).replace('\n', ' ').strip() if r else ''


def build_preview(args):
    label, src, dst = args
    font = TTFont(src, lazy=False)
    cmap = font.getBestCmap()
    text = label + PREVIEW_SAMPLE
    sub = subset.Subsetter(options(preview=True))
    sub.populate(unicodes=sorted({ord(c) for c in text} & set(cmap)))
    sub.subset(font)
    rename_for_subset(font)
    font.flavor = 'woff2'
    font.save(dst)
    return dst.stat().st_size


def render_preview_png(args):
    label, src, dst = args
    from PIL import Image, ImageDraw, ImageFont
    text = label + PREVIEW_SAMPLE
    f = ImageFont.truetype(str(src), 56)
    box = f.getbbox(text)
    w, h = box[2] - box[0] + 16, 80
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((8, 8 - box[1] + 4), text, font=f, fill=(244, 244, 244, 255))
    im.save(dst, optimize=True)
    return dst.stat().st_size


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    manifest = json.loads((ROOT / 'fonts' / 'manifest.json').read_text(encoding='utf-8'))
    ofl_text = (ROOT / 'fonts' / 'OFL-1.1.txt').read_text(encoding='utf-8')
    stamps_path = CACHE / 'build-stamps.json'
    stamps = json.loads(stamps_path.read_text()) if stamps_path.exists() else {}
    prev_catalog = {e['key']: e for e in json.loads(CATALOG.read_text(encoding='utf-8'))['fonts']} if CATALOG.exists() else {}

    groups = {}
    for e in manifest['fonts']:
        if e.get('build') and (CACHE / e['file']).exists():
            groups.setdefault(e['key'], []).append(e)
    skipped = [e['file'] for e in manifest['fonts'] if e.get('build') and not (CACHE / e['file']).exists()]

    jobs, preview_jobs, png_jobs = [], [], []
    plan = {}
    for key, entries in groups.items():
        entries.sort(key=lambda e: str(e['weight']))
        unmodified = any(e.get('unmodified') for e in entries)
        for e in entries:
            src = CACHE / e['file']
            stamp = f"{BUILDER_VERSION}:{sha(src)}"
            ext = '.ttf' if unmodified else '.woff2'
            name = f"{key}-{str(e['weight']).replace(' ', '-')}{ext}"
            dst = OUT / key / name
            plan.setdefault(key, []).append((e, src, dst, stamp, unmodified))
            fresh = (not FORCE) and dst.exists() and stamps.get(str(dst)) == stamp and key in prev_catalog
            if fresh:
                continue
            if unmodified:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(src, dst)
            else:
                jobs.append((e, src, dst))
        base = min(entries, key=lambda e: abs((e['weight'] if isinstance(e['weight'], int) else 400) - 400))
        psrc = CACHE / base['file']
        if unmodified:
            png_jobs.append((entries[0]['label'], psrc, OUT / key / 'preview.png'))
        else:
            preview_jobs.append((entries[0]['label'], psrc, OUT / key / 'preview.woff2'))

    results = {}
    with ProcessPoolExecutor(max_workers=4) as pool:
        for r in pool.map(build_face, jobs):
            results[r['file']] = r
            print(f"  {r['file']}  →  {r['bytes']/1e6:.2f} MB", flush=True)
        for _ in pool.map(build_preview, preview_jobs):
            pass
        for _ in pool.map(render_preview_png, png_jobs):
            pass

    catalog = []
    for key, items in plan.items():
        first = items[0][0]
        unmodified = items[0][4]
        faces, total, cov, gl, cpr = [], 0, None, 0, ''
        for e, src, dst, stamp, _ in items:
            r = results.get(e['file'])
            old = next((f for f in prev_catalog.get(key, {}).get('faces', []) if f['file'] == dst.name), None)
            if r:
                size, cov_e, gl_e, cpr_e = r['bytes'], r['cov'], r['glyphs'], r['copyright']
                if isinstance(e['weight'], int) and r['wcls'] and abs(r['wcls'] - e['weight']) > 100:
                    print(f"  ⚠ {e['file']} 字重標示 {e['weight']} 但字型內是 {r['wcls']}")
            elif old:
                size, cov_e, gl_e, cpr_e = old['bytes'], prev_catalog[key]['coverage'], prev_catalog[key]['glyphs'], prev_catalog[key].get('copyright', '')
            else:  # unmodified：直接量原檔
                f = TTFont(src, lazy=True)
                size, cov_e, gl_e, cpr_e = dst.stat().st_size, coverage(f.getBestCmap()), len(f.getBestCmap()), copyright_of(src)
            stamps[str(dst)] = stamp
            faces.append({'weight': e['weight'], 'file': dst.name, 'bytes': size})
            total += size
            cov, gl, cpr = cov_e, gl_e, cpr_e or cpr
        # 授權檔
        d = OUT / key
        if unmodified:
            name_rec = TTFont(items[0][1], lazy=True)['name']
            lic = next((r.toUnicode() for r in name_rec.names if r.nameID == 13), '')
            (d / 'LICENSE.txt').write_text(f"{cpr}\n\n{lic}\n", encoding='utf-8')
            lic_file = 'LICENSE.txt'
        else:
            (d / 'OFL.txt').write_text(f"{cpr}\nSource: {first.get('source', '')}\n\n{ofl_text}", encoding='utf-8')
            lic_file = 'OFL.txt'
        preview = 'preview.png' if unmodified else 'preview.woff2'
        catalog.append({
            'key': key, 'label': first['label'], 'pack': first['pack'], 'family': f'vc-{key}',
            'faces': faces, 'preview': preview, 'previewKind': 'image' if unmodified else 'font',
            'bytes': total + (d / preview).stat().st_size, 'license': first['license'], 'source': first.get('source', ''),
            'licenseFile': lic_file, 'coverage': cov, 'glyphs': gl, 'copyright': cpr,
            'unmodified': unmodified, 'latinOnly': False,
        })

    # 原廠已經是網頁字型的（只放進網站，不再處理）
    for pb in manifest.get('prebuilt', []):
        src_dir = CACHE / 'user' / pb['dir']
        d = OUT / pb['dir']
        if not all((src_dir / f['file']).exists() for f in pb['faces']):
            skipped.append(pb['dir'])
            continue
        d.mkdir(parents=True, exist_ok=True)
        faces, total = [], 0
        for f in pb['faces']:
            shutil.copyfile(src_dir / f['file'], d / f['file'])
            faces.append({'weight': f['weight'], 'file': f['file'], 'bytes': (d / f['file']).stat().st_size})
            total += faces[-1]['bytes']
        (d / 'OFL.txt').write_text(f"© LY Corporation (LINE Seed Sans)\nSource: {pb['source']}\n\n{ofl_text}", encoding='utf-8')
        catalog.append({
            'key': pb['key'], 'label': pb['label'], 'pack': pb['pack'], 'family': f"vc-{pb['key']}", 'faces': faces,
            'preview': faces[0]['file'], 'previewKind': 'font', 'bytes': total, 'license': pb['license'], 'source': pb['source'],
            'licenseFile': 'OFL.txt', 'coverage': None, 'glyphs': 0, 'copyright': '© LY Corporation', 'unmodified': True, 'latinOnly': True,
        })

    order = {p: i for i, p in enumerate(manifest['packs'])}
    catalog.sort(key=lambda c: (order.get(c['pack'], 99), c['label']))
    CATALOG.parent.mkdir(parents=True, exist_ok=True)
    CATALOG.write_text(json.dumps({'packs': manifest['packs'], 'personal': manifest.get('personal_fonts', []), 'fonts': catalog},
                                  ensure_ascii=False, indent=1), encoding='utf-8')
    stamps_path.write_text(json.dumps(stamps))

    # 繁體覆蓋率報告
    lines = ['# 字體繁體覆蓋率', '', '常用字＝Big5 常用字 5401 字；次常用字＝7652 字。由 `scripts/build-fonts.py` 自動產生，不要手改。', '',
             '| 字體 | 包 | 常用字 | 次常用字 | 缺常用字 | 注音 | 網站檔案大小 | 授權 |', '|---|---|---|---|---|---|---|---|']
    for c in catalog:
        cv = c['coverage']
        if cv:
            tag = '完整' if cv['common'] >= 99 else ('少量缺字' if cv['common'] >= 95 else '**繁體缺字多**')
            lines.append(f"| {c['label']} | {c['pack']} | {cv['common']}%（{tag}） | {cv['rare']}% | {cv['missingCommon']} | {'有' if cv['bopomofo'] else '無'} | {c['bytes']/1e6:.1f} MB | {c['license']} |")
        else:
            lines.append(f"| {c['label']} | {c['pack']} | （只有英文） | — | — | — | {c['bytes']/1e6:.2f} MB | {c['license']} |")
    if skipped:
        lines += ['', '## 缺檔（還沒放進網站）', ''] + [f'- {s}' for s in skipped]
    (ROOT / 'docs' / 'font-coverage.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    tot = sum(c['bytes'] for c in catalog)
    print(f"\n完成：{len(catalog)} 個字體，合計 {tot/1e6:.0f} MB；缺檔 {len(skipped)} 個")


if __name__ == '__main__':
    main()
