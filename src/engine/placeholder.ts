import type { Project, TextItem } from '../model/types';

// 「點兩下編輯文字」提示字：新文字一開始是空的（placeholder: true），預覽上用半透明的提示字畫出來讓人看得到、點得到；
// 一打字就拿掉旗標。匯出、單格輸出直接用專案資料（空字串，不畫），所以提示字不會出現在影片裡。

export const PLACEHOLDER_TEXT = '點兩下編輯文字';

/** 預覽用：把還沒輸入的文字換成半透明提示字。沒有任何提示字就原樣回傳同一個專案 */
export function showPlaceholders(p: Project): Project {
  if (!p.tracks.some((t) => t.items.some((x) => x.type === 'text' && x.placeholder))) return p;
  return {
    ...p,
    tracks: p.tracks.map((t) =>
      t.items.some((x) => x.type === 'text' && x.placeholder)
        ? {
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
          }
        : t,
    ) as Project['tracks'],
  };
}

/** 專案裡還沒輸入內容的文字有幾個（匯出前提醒） */
export function placeholderCount(p: Project): number {
  let n = 0;
  for (const t of p.tracks) for (const x of t.items) if (x.type === 'text' && x.placeholder) n++;
  return n;
}
