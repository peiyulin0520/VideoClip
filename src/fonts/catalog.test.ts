import fs from 'node:fs';
import path from 'node:path';
import { CATALOG, PACKS, PERSONAL_FONTS } from './catalog';

const PUBLIC = path.resolve(import.meta.dirname, '../../public/fonts');

describe('字體目錄', () => {
  it('每個字體都有檔案、授權檔，且大小與目錄記載一致', () => {
    expect(CATALOG.length).toBeGreaterThan(30);
    for (const f of CATALOG) {
      expect(f.faces.length, f.key).toBeGreaterThan(0);
      expect(Object.keys(PACKS), f.key).toContain(f.pack);
      for (const face of f.faces) {
        const p = path.join(PUBLIC, f.key, face.file);
        expect(fs.existsSync(p), p).toBe(true);
        expect(fs.statSync(p).size, p).toBe(face.bytes);
      }
      expect(fs.existsSync(path.join(PUBLIC, f.key, f.preview)), `${f.key} preview`).toBe(true);
      expect(fs.existsSync(path.join(PUBLIC, f.key, f.licenseFile)), `${f.key} 授權檔`).toBe(true);
    }
  });

  it('key 不重複；family 名稱以 vc- 開頭', () => {
    const keys = CATALOG.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(CATALOG.every((f) => f.family === `vc-${f.key}`)).toBe(true);
  });

  it('授權不允許散布的字體不能在目錄裡（只能讓使用者自己匯入）', () => {
    const banned = ['proper-script', 'starpanda', '851', 'zhiyi'];
    for (const f of CATALOG) for (const b of banned) expect(f.key.includes(b), `${f.key} 不該被放進網站`).toBe(false);
    expect(PERSONAL_FONTS.length).toBeGreaterThan(0);
  });

  it('只放授權明確的字體：OFL，或字言手繪體（原檔照放、不裁切）', () => {
    for (const f of CATALOG) {
      if (f.license.startsWith('OFL')) continue;
      expect(f.key).toBe('fancy-free');
      expect(f.unmodified).toBe(true);
      expect(f.faces[0]!.file.endsWith('.ttf')).toBe(true); // 沒有轉檔
    }
  });

  it('每個字體都有一個繁體缺字資訊（英文字體除外）', () => {
    for (const f of CATALOG) if (!f.latinOnly) expect(f.coverage?.common, f.key).toBeGreaterThan(50);
  });
});
