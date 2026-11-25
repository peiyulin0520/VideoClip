import { describe, expect, it } from 'vitest';
import type { Item, VideoItem } from '../model/types';
import { sourceTimeClamped } from './timeline';
import { activeTransition, transitionSpan } from './transitions';

// 轉場的後一段（B）從「提早出現」到「轉場結束」：每一格算出的素材秒數要連續（只前進、不倒退、不跳），
// 不管前後分配（全在前段、各一半、全在後段、不對稱）、轉場長度、B 的入點前面有沒有畫面。
const vid = (id: string, start: number, duration: number, trimIn = 0): VideoItem =>
  ({
    id,
    type: 'video',
    assetId: 'a',
    start,
    duration,
    trimIn,
    speed: 1,
    volume: 1,
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
  }) as unknown as VideoItem;
const asset = { duration: 60 };

type Tr = { duration: number; before?: number; after?: number };
const CASES: [string, Tr][] = [
  ['各一半', { duration: 1 }],
  ['全在前段', { duration: 1, before: 1, after: 0 }],
  ['全在後段', { duration: 1, before: 0, after: 1 }],
  ['前 1 後 3', { duration: 4, before: 1, after: 3 }],
  ['很短 0.3', { duration: 0.3 }],
  ['很長 2（比片段長）', { duration: 2, before: 2, after: 2 }],
];

describe('轉場後一段的素材秒數連續', () => {
  for (const [name, tr] of CASES)
    for (const trimIn of [0, 5]) {
      it(`${name}、B 入點 ${trimIn} 秒`, () => {
        const A = vid('A', 0, 1.5);
        const B = {
          ...vid('B', 1.5, 6, trimIn),
          transitionIn: { kind: 'dissolve', ...tr },
        } as unknown as Item;
        const items = [A, B] as Item[];
        const span = transitionSpan(items, B)!;
        expect(span).toBeTruthy();
        let prev: number | null = null;
        for (let t = span.cut - span.before - 0.5; t < span.cut + span.after + 1; t += 1 / 60) {
          const at = activeTransition(items, t);
          const b = at?.b ?? (t >= B.start ? B : null);
          if (!b || b.type === 'audio' || b.type === 'text') {
            prev = null;
            continue;
          }
          const s = sourceTimeClamped(b as VideoItem, t, asset);
          if (prev !== null) {
            expect(s, `t=${t.toFixed(3)}`).toBeGreaterThanOrEqual(prev - 1e-6); // 不倒退
            expect(s - prev, `t=${t.toFixed(3)}`).toBeLessThan(0.05); // 不跳
          }
          prev = s;
        }
      });
    }
});
