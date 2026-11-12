import { createProject } from '../model/defaults';
import type { TextItem } from '../model/types';
import { addText, applyTextStyleToAll, editText, pickTextStyle } from './actions';
import { useProjectStore } from './projectStore';

const s = () => useProjectStore.getState();
const texts = () =>
  s()
    .project!.tracks.flatMap((t) => t.items)
    .filter((i): i is TextItem => i.type === 'text');

describe('文字樣式：透明度、沿用上一次的樣式、套用到所有文字', () => {
  beforeEach(() => s().load(createProject('測試')));

  it('pickTextStyle 只拿樣式欄位，不含文字內容', () => {
    const id = addText(0);
    const run = texts().find((t) => t.id === id)!.card.runs[0]!;
    const st = pickTextStyle(run);
    expect(st).not.toHaveProperty('text');
    expect(st.color).toBe(run.color);
    expect(st.fontId).toBe(run.fontId);
  });

  it('編輯一個文字後，新增的文字沿用同樣的樣式（顏色、透明度、描邊），內容還是預設', () => {
    const a = addText(0);
    editText(a, (c) => {
      c.runs[0]!.text = '第一個';
      c.runs[0]!.color = '#00ffcc';
      c.runs[0]!.opacity = 0.6;
      c.runs[0]!.strokes = [{ color: '#112233', width: 9 }];
    });
    const b = addText(1);
    const run = texts().find((t) => t.id === b)!.card.runs[0]!;
    expect(run.color).toBe('#00ffcc');
    expect(run.opacity).toBe(0.6);
    expect(run.strokes).toEqual([{ color: '#112233', width: 9 }]);
    expect(run.text).not.toBe('第一個');
  });

  it('套用樣式到所有文字：其他字卡的樣式一樣，內容與位置不動；獨立圖形不算；一步復原', () => {
    const a = addText(0);
    const b = addText(0.5);
    const shape = addText(1, true);
    editText(b, (c) => {
      c.runs[0]!.text = '乙';
      c.runs[0]!.color = '#ff0000';
    });
    editText(a, (c) => {
      c.runs[0]!.text = '甲';
      c.runs[0]!.color = '#00ff00';
      c.runs[0]!.opacity = 0.5;
      c.runs[0]!.weight = 'bold';
    });
    const bx = texts().find((t) => t.id === b)!.transform.x;
    expect(applyTextStyleToAll(a)).toBe(1); // 只有 b（獨立圖形 shape 沒有文字，不算）
    const rb = texts().find((t) => t.id === b)!.card.runs[0]!;
    expect(rb.color).toBe('#00ff00');
    expect(rb.opacity).toBe(0.5);
    expect(rb.weight).toBe('bold');
    expect(rb.text).toBe('乙');
    expect(texts().find((t) => t.id === b)!.transform.x).toBe(bx);
    const rs = texts().find((t) => t.id === shape)!.card.runs[0]!;
    expect(rs.color).not.toBe('#00ff00');
    s().undo();
    expect(texts().find((t) => t.id === b)!.card.runs[0]!.color).toBe('#ff0000');
  });

  it('透明度沒設＝完全不透明', () => {
    const id = addText(0);
    expect(texts().find((t) => t.id === id)!.card.runs[0]!.opacity).toBeUndefined();
  });
});
