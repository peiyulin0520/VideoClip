import { thumbFor } from './thumbs';
import type { Asset, Item } from '../model/types';

/** 物件沒有自己命名時的預設名稱 */
export function defaultName(item: Item, asset?: Asset): string {
  if (item.type === 'text') {
    const t = item.card.runs[0]?.text.replace(/\n/g, ' ') ?? '';
    return t === '' ? '圖形' : `Aa ${t}`;
  }
  if (item.type === 'audio') return `♪ ${asset?.name ?? '音樂'}`;
  return item.type === 'image' ? '照片' : '影片';
}

/** 物件的名稱：使用者命名的優先 */
export function itemTitle(item: Item, asset?: Asset): string {
  const label = item.label?.trim();
  if (!label) return defaultName(item, asset);
  return item.type === 'text' ? `Aa ${label}` : item.type === 'audio' ? `♪ ${label}` : label;
}

/** 這個物件「開始那一格」的縮圖（素材縮圖依入點挑最近的一張）；沒有縮圖回傳 undefined */
export function thumbOf(item: Item, asset?: Asset): string | undefined {
  if (item.type === 'text' || !asset || asset.thumbs.length === 0) return undefined;
  if (item.type === 'image' || asset.duration <= 0) return asset.thumbs[0];
  return thumbFor(asset.thumbs, item.trimIn, asset.duration);
}

/** 同一條軌道上依開始時間排的第幾個（1 起算）；時間軸上片段名稱前面的序號，自動算、不存 */
export function ordinalIn(items: Item[], id: string): number {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  return sorted.findIndex((x) => x.id === id) + 1;
}
