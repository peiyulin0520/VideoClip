import { createTextItem } from '../model/defaults';
import type { Project, TextItem, Track } from '../model/types';
import { frameOfGroup } from './layoutTracks';

// 「點兩下編輯文字」提示字：新文字一開始是空的（placeholder: true），預覽上用半透明的提示字畫出來讓人看得到、點得到；
// 一打字就拿掉旗標。匯出、單格輸出直接用專案資料（空字串，不畫），所以提示字不會出現在影片裡。

export const PLACEHOLDER_TEXT = '點兩下編輯文字';

/** 版型裡還沒放素材的格子（有位置、有外框，沒有素材） */
export function emptyCells(p: Project): Track[] {
  return p.tracks.filter((t) => t.groupRole === 'cell' && !!t.cell && t.items.length === 0);
}

/** 預覽用：把還沒輸入的文字換成半透明提示字；空的版型格子畫上「第 N 格」。沒有任何提示就原樣回傳同一個專案 */
export function showPlaceholders(p: Project): Project {
  const empties = emptyCells(p);
  const hasText = p.tracks.some((t) => t.items.some((x) => x.type === 'text' && x.placeholder));
  if (!hasText && empties.length === 0) return p;
  return {
    ...p,
    tracks: p.tracks.map((t) => {
      if (empties.includes(t)) {
        const fr = t.group ? frameOfGroup(p.tracks, t.group) : null;
        if (!fr) return t;
        const n = p.tracks.filter((x) => x.group === t.group && x.groupRole === 'cell').indexOf(t) + 1;
        const c = t.cell!;
        // 預覽專用的提示字（鎖住的軌道：預覽上不會被點到、也不會進匯出）
        const hint = createTextItem(fr.item.start, `第 ${n} 格`);
        hint.id = `empty-cell-${t.id}`;
        hint.duration = fr.item.duration;
        hint.group = t.group;
        hint.transform = { x: c.x + c.w / 2, y: c.y + c.h / 2, scale: 1, rotation: 0, opacity: 0.55 };
        hint.card.runs[0]!.size = Math.max(Math.min(c.w * p.width, c.h * p.height) * 0.28, 24);
        return { ...t, locked: true, items: [hint] } as Track;
      }
      if (!t.items.some((x) => x.type === 'text' && x.placeholder)) return t;
      return {
        ...t,
        items: t.items.map((x) => {
          if (x.type !== 'text' || !x.placeholder) return x;
          const run = { ...x.card.runs[0]!, text: PLACEHOLDER_TEXT };
          return {
            ...x,
            transform: { ...x.transform, opacity: x.transform.opacity * 0.5 },
            card: { ...x.card, runs: [run, ...x.card.runs.slice(1)] },
          } as TextItem;
        }),
      };
    }) as Project['tracks'],
  };
}

/** 專案裡還沒輸入內容的文字有幾個（匯出前提醒） */
export function placeholderCount(p: Project): number {
  let n = 0;
  for (const t of p.tracks) for (const x of t.items) if (x.type === 'text' && x.placeholder) n++;
  return n;
}

/** 版型裡還空著的格子有幾個（匯出會是黑色，匯出前提醒） */
export function emptyCellCount(p: Project): number {
  return emptyCells(p).length;
}
