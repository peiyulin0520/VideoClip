import { createProject } from '../model/defaults';
import { useProjectStore } from './projectStore';

const s = () => useProjectStore.getState();

describe('projectStore 復原/重做', () => {
  beforeEach(() => s().load(createProject('測試')));

  it('apply → undo → redo', () => {
    s().apply((d) => {
      d.name = 'A';
    });
    s().apply((d) => {
      d.name = 'B';
    });
    expect(s().project!.name).toBe('B');
    expect(s().undo()).toBe(true);
    expect(s().project!.name).toBe('A');
    expect(s().redo()).toBe(true);
    expect(s().project!.name).toBe('B');
    expect(s().redo()).toBe(false);
  });

  it('新的修改會清掉重做堆疊', () => {
    s().apply((d) => {
      d.name = 'A';
    });
    s().undo();
    s().apply((d) => {
      d.name = 'C';
    });
    expect(s().future).toHaveLength(0);
  });

  it('同一個 coalesce key 的連續修改合併成一步', () => {
    for (const n of ['1', '2', '3']) {
      s().apply(
        (d) => {
          d.name = n;
        },
        { coalesce: 'name' },
      );
    }
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(s().project!.name).toBe('測試');
  });

  it('歷史上限 100 步', () => {
    for (let i = 0; i < 120; i++)
      s().apply((d) => {
        d.name = String(i);
      });
    expect(s().past).toHaveLength(100);
  });

  it('沒有實際變更就不記錄', () => {
    s().apply(() => {});
    expect(s().past).toHaveLength(0);
    expect(s().revision).toBe(0);
  });
});
