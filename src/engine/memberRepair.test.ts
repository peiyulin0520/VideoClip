import { describe, expect, it } from 'vitest';
import type { Item, Track } from '../model/types';
import { repairMemberItems } from './memberRepair';

const base = { start: 0, duration: 2, transform: {} };
const frame = { id: 'f', type: 'video', assetId: 'a', ...base, group: 'g' } as unknown as Item;
const text = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, type: 'text', ...base, card: { runs: [] }, ...extra }) as unknown as Item;
const tr = (id: string, kind: Track['kind'], items: Item[], extra: Partial<Track> = {}) =>
  ({ id, kind, name: id, hidden: false, locked: false, items, ...extra }) as Track;

describe('repairMemberItems：版型成員一定在自己版型的成員軌上、帶 group', () => {
  const main = () => tr('main', 'media', [frame]);

  it('成員軌上的文字沒有 group（舊版載入清掉的）→ 補回', () => {
    const t = [main(), tr('m', 'text', [text('t1')], { group: 'g', groupRole: 'member' })];
    const out = repairMemberItems(t);
    expect((out[1]!.items[0] as { group?: string }).group).toBe('g');
  });

  it('有 group 的文字在一般字卡軌 → 搬回版型的成員軌（有空位用原本的成員軌、沒有就新開）', () => {
    const t = [
      main(),
      tr('m', 'text', [text('t1', { group: 'g', start: 0 })], { group: 'g', groupRole: 'member' }),
      tr('plain', 'text', [
        text('t2', { group: 'g', start: 5 }),
        text('t3', { group: 'g', start: 0 }),
        text('free'),
      ]),
    ];
    const out = repairMemberItems(t);
    const plain = out.find((x) => x.id === 'plain')!;
    expect(plain.items.map((i) => i.id)).toEqual(['free']); // 自己加的文字（沒有 group）不動
    const members = out.filter((x) => x.groupRole === 'member');
    const ids = members.flatMap((x) => x.items.map((i) => i.id)).sort();
    expect(ids).toEqual(['t1', 't2', 't3']);
    // t3 跟 t1 同一時間：不能在同一條 → 新開一條成員軌
    expect(members.length).toBeGreaterThanOrEqual(2);
    expect(members.every((x) => x.group === 'g')).toBe(true);
  });

  it('版型已經不在（孤兒）就不動；已經正確回傳同一個陣列', () => {
    const orphan = [tr('plain', 'text', [text('t1', { group: 'gone' })])];
    expect(repairMemberItems(orphan)).toBe(orphan);
    const ok = [main(), tr('m', 'text', [text('t1', { group: 'g' })], { group: 'g', groupRole: 'member' })];
    expect(repairMemberItems(ok)).toBe(ok);
  });
});
