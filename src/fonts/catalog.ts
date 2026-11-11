import data from './catalog.generated.json';

// 字體目錄：由 scripts/build-fonts.py 依 fonts/manifest.json 產生（來源、授權、繁體覆蓋率都在裡面）。
export type FontFaceInfo = { weight: number | string; file: string; bytes: number };
export type Coverage = { common: number; rare: number; missingCommon: number; bopomofo: boolean };
export type CatalogFont = {
  key: string;
  label: string;
  pack: string;
  family: string; // CSS font-family 名稱，例如 vc-pop-gothic
  faces: FontFaceInfo[];
  preview: string;
  previewKind: 'font' | 'image';
  bytes: number;
  license: string;
  source: string;
  licenseFile: string;
  coverage: Coverage | null;
  unmodified: boolean;
  latinOnly: boolean;
};

export const CATALOG = data.fonts as CatalogFont[];
export const PACKS = data.packs as Record<string, string>;
export const PERSONAL_FONTS = data.personal as { label: string; license: string; how: string }[];

export const findFont = (key: string) => CATALOG.find((f) => f.key === key);
export const fontUrl = (key: string, file: string) => `${import.meta.env.BASE_URL}fonts/${key}/${file}`;

export function packFonts(pack: string): CatalogFont[] {
  return CATALOG.filter((f) => f.pack === pack);
}
export const packBytes = (pack: string) => packFonts(pack).reduce((s, f) => s + f.bytes, 0);

export const formatMB = (bytes: number) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(Math.round(bytes / 1e3), 1)} KB`);

/** 繁體缺字多（常用字覆蓋率 < 95%）就提醒 */
export function coverageLabel(f: CatalogFont): 'latin' | 'full' | 'few' | 'many' {
  if (f.latinOnly || !f.coverage) return 'latin';
  if (f.coverage.common >= 99) return 'full';
  return f.coverage.common >= 95 ? 'few' : 'many';
}
