import { createProject } from '../model/defaults';
import type { Item, Track, VideoItem } from '../model/types';
import { setTransition, setTransitionAll, setTransitionMode } from './actions';
import { useProjectStore } from './projectStore';

const s = () => useProjectStore.getState();
const vid = (id: string, start: number, duration: number): VideoItem =>
  ({
    id,
    type: 'video',
    assetId: 'a',
    start,
    duration,
    trimIn: 0,
    speed: 1,
    volume: 1,
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
  }) as unknown as VideoItem;
const starts = () =>
  s()
    .project!.tracks.find((t: Track) => t.id === 'tm')!
    .items.map((i) => [i.id, i.start]);

describe('停格轉場：開關與改長度會把後面的片段挪動', () => {
  beforeEach(() => {
    s().load(createProject('測試'));
    s().apply((d) => {
      d.tracks = [
        { id: 'tm', kind: 'media', name: '影像 1', items: [vid('A', 0, 4), vid('B', 4, 4), vid('C', 8, 4)] },
      ] as never;
    });
    setTransition('B', 'dissolve', 1);
  });
  it('切到停格轉場：B 和後面的 C 往後挪一個轉場長度；切回來挪回去；各一步復原', () => {
    expect(starts()).toEqual([
      ['A', 0],
      ['B', 4],
      ['C', 8],
    ]);
    expect(setTransitionMode('B', 'hold')).toBe(true);
    expect(starts()).toEqual([
      ['A', 0],
      ['B', 5],
      ['C', 9],
    ]);
    const b = s().project!.tracks[0]!.items[1] as Item & { transitionIn?: { mode?: string } };
    expect(b.transitionIn?.mode).toBe('hold');
    expect(setTransitionMode('B', 'overlap')).toBe(true);
    expect(starts()).toEqual([
      ['A', 0],
      ['B', 4],
      ['C', 8],
    ]);
    s().undo();
    expect(starts()).toEqual([
      ['A', 0],
      ['B', 5],
      ['C', 9],
    ]);
  });
  it('停格轉場改長度：空白跟著變、後面的片段跟著挪；換轉場種類保留停格；取消轉場挪回去', () => {
    setTransitionMode('B', 'hold');
    setTransition('B', 'dissolve', 2);
    expect(starts()).toEqual([
      ['A', 0],
      ['B', 6],
      ['C', 10],
    ]);
    setTransition('B', 'moveL'); // 只換種類
    const b = s().project!.tracks[0]!.items[1] as Item & { transitionIn?: { mode?: string; kind: string } };
    expect(b.transitionIn).toMatchObject({ kind: 'moveL', mode: 'hold', duration: 2 });
    expect(starts()).toEqual([
      ['A', 0],
      ['B', 6],
      ['C', 10],
    ]);
    setTransition('B', null);
    expect(starts()).toEqual([
      ['A', 0],
      ['B', 4],
      ['C', 8],
    ]);
  });
  it('邊轉邊播改長度不挪片段（重疊）', () => {
    setTransition('B', 'dissolve', 2);
    expect(starts()).toEqual([
      ['A', 0],
      ['B', 4],
      ['C', 8],
    ]);
  });
  it('全部套用：每個銜接處照時間順序套，停格的跟著挪', () => {
    setTransition('C', 'dissolve', 1);
    setTransitionMode('B', 'hold'); // B→5、C→9：A–B 隔 1 秒空白，B–C 緊接
    expect(starts()).toEqual([
      ['A', 0],
      ['B', 5],
      ['C', 9],
    ]);
    setTransitionAll('tm', 'moveR', 2);
    // B 的停格轉場長度 1→2：B→6、C→10；C 是邊轉邊播，長度 2 不挪
    expect(starts()).toEqual([
      ['A', 0],
      ['B', 6],
      ['C', 10],
    ]);
  });
  it('沒有前面緊接的片段時不能切', () => {
    expect(setTransitionMode('A', 'hold')).toBe(false);
  });
});
