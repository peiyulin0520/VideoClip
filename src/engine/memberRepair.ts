import { createTrack } from '../model/defaults';
import type { Item, Track, TrackKind } from '../model/types';
import { frameOfGroup, isMemberItem } from './layoutTracks';
import { canPlace } from './timeline';

/**
 * 版型裡的文字、貼圖、音效（成員）一定要待在自己版型的成員軌上、而且帶著版型的 group：
 * ①成員軌上的文字沒有 group（舊版載入時被清掉過）→ 補回軌道的 group；
 * ②有 group 的成員卻在一般軌道上（跑出播放軸的版型分組）→ 搬回那個版型的成員軌（時間不變；成員軌放不下就新開一條）。
 * 版型已經不在了（孤兒）就不動。已經正確就回傳同一個陣列。
 */
export function repairMemberItems(tracks: Track[]): Track[] {
  let out = tracks;
  // ①
  if (
    out.some((t) => t.groupRole === 'member' && t.group && t.items.some((x) => x.type === 'text' && !x.group))
  ) {
    out = out.map((t) =>
      t.groupRole === 'member' && t.group && t.items.some((x) => x.type === 'text' && !x.group)
        ? ({
            ...t,
            items: t.items.map((x) => (x.type === 'text' && !x.group ? { ...x, group: t.group } : x)),
          } as Track)
        : t,
    );
  }
  // ②
  const stray: { item: Item; from: string }[] = [];
  for (const t of out) {
    if (t.groupRole || t.kind === 'audio') continue; // 一般的影像／貼圖／字卡軌；音效成員在音訊軌上不算
    for (const it of t.items)
      if (isMemberItem(it) && it.group && frameOfGroup(out, it.group)) stray.push({ item: it, from: t.id });
  }
  for (const { item, from } of stray) {
    const group = item.group!;
    const kind: TrackKind = item.type === 'text' ? 'text' : 'sticker';
    const fr = frameOfGroup(out, group);
    if (!fr) continue;
    out = out.map((t) =>
      t.id === from ? ({ ...t, items: t.items.filter((x) => x.id !== item.id) } as Track) : t,
    );
    const home = out.find(
      (t) =>
        t.group === group &&
        t.groupRole === 'member' &&
        t.kind === kind &&
        !t.locked &&
        canPlace(t.items, item.start, item.duration),
    );
    if (home) {
      out = out.map((t) => (t.id === home.id ? ({ ...t, items: [...t.items, item] } as Track) : t));
    } else {
      const tr = createTrack(kind, out);
      tr.group = group;
      tr.groupRole = 'member';
      tr.items = [item] as never;
      let at = out.findIndex((t) => t.id === fr.track.id) + 1;
      while (at < out.length && out[at]!.groupRole === 'member' && out[at]!.kind !== 'audio') at++;
      out = [...out.slice(0, at), tr, ...out.slice(at)];
    }
  }
  return out;
}
