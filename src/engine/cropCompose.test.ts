import { describe, expect, it } from 'vitest';
import { baseKind } from './cropCompose';
import type { CropStroke } from '../model/types';

const NO = { l: 0, t: 0, r: 0, b: 0 };
const keep: CropStroke = { mode: 'keep', w: 0.05, pts: [[0.5, 0.5]] };
const erase: CropStroke = { mode: 'erase', w: 0.05, pts: [[0.5, 0.5]] };

describe('baseKind：四個裁切工具各自獨立，底是什麼', () => {
  it('什麼都沒用＝整張', () => expect(baseKind(NO, null, [])).toBe('full'));
  it('只用橡皮擦＝整張扣掉擦的（底還是整張）', () => expect(baseKind(NO, null, [erase])).toBe('full'));
  it('只用筆刷＝底是空的，只留刷到的', () => expect(baseKind(NO, null, [keep])).toBe('empty'));
  it('先擦後刷、沒有別的形狀＝底是空的（有筆刷就是只留刷到的）', () =>
    expect(baseKind(NO, null, [erase, keep])).toBe('empty'));
  it('有一般裁切的框＝形狀，筆刷再補回框外的', () =>
    expect(baseKind({ ...NO, l: 0.2 }, null, [keep])).toBe('shape'));
  it('有自由裁切的多邊形＝形狀', () =>
    expect(
      baseKind(
        NO,
        [
          [0.1, 0.1],
          [0.9, 0.1],
          [0.5, 0.9],
        ],
        [],
      ),
    ).toBe('shape'));
  it('舊版的點陣圖遮罩當成形狀（底）', () => expect(baseKind(NO, null, [], true)).toBe('shape'));
});
