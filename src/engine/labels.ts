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

/** 同一條軌道上依開始時間排的第幾個（1 起算）；時間軸上片段名稱前面的序號，自動算、不存 */
export function ordinalIn(items: Item[], id: string): number {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  return sorted.findIndex((x) => x.id === id) + 1;
}
