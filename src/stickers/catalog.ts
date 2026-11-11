import data from './catalog.generated.json';

// 貼圖 icon：Microsoft Fluent Emoji（MIT），檔案在 public/stickers/<name>.svg（由 scripts/build-stickers.mjs 產生）
export type StickerCategory = { name: string; items: string[] };
export const STICKER_CATS: StickerCategory[] = data.categories;
export const STICKER_SOURCE = { source: data.source, license: data.license, author: data.author };

export const stickerUrl = (name: string) => `${import.meta.env.BASE_URL}stickers/${name}.svg`;

/** 名稱給人看：smiling-face-with-heart-eyes → smiling face with heart eyes */
export const stickerLabel = (name: string) => name.replace(/-/g, ' ');

/**
 * 把 SVG 貼圖畫成 512px 的 PNG 檔（之後當一般照片素材加進專案：存在這台裝置、可以拖、縮放、匯出）。
 * 直接用 SVG 當貼圖的話，畫布會用 SVG 宣告的原始大小取樣，放大時會糊。
 */
export async function stickerToPng(name: string, size = 512): Promise<File> {
  const res = await fetch(stickerUrl(name));
  if (!res.ok) throw new Error(`下載貼圖失敗（${res.status}）`);
  const svg = await res.blob();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = size;
    c.height = Math.round((size * (img.naturalHeight || 1)) / (img.naturalWidth || 1));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((ok, bad) =>
      c.toBlob((b) => (b ? ok(b) : bad(new Error('轉成圖片失敗'))), 'image/png'),
    );
    return new File([blob], `貼圖-${name}.png`, { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
