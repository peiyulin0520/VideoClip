import { create } from 'zustand';

// 播放軸上哪些版型是展開的、展開後哪些分類（文字、貼圖、影像、音效）收起來：記在這台手機（跟「四類各自收合」一樣）。
// 沒記過的版型預設收合；新加的版型由 addLayout 呼叫 openGroup 讓它預設展開。

const KEY = 'vc-tl-groups';
type Saved = { open: string[]; closed: Record<string, string[]> };
const read = (): Saved => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>;
    return {
      open: Array.isArray(v.open) ? v.open : [],
      closed: v.closed && typeof v.closed === 'object' ? v.closed : {},
    };
  } catch {
    return { open: [], closed: {} };
  }
};
const write = (s: Saved) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 存不了就算了 */
  }
};

type State = Saved & {
  openGroup: (g: string) => void;
  toggleGroup: (g: string) => void;
  toggleKind: (g: string, kind: string) => void;
};

export const useGroupOpen = create<State>((set, get) => ({
  ...read(),
  openGroup: (g) => {
    const open = get().open.includes(g) ? get().open : [...get().open, g];
    set({ open });
    write({ open, closed: get().closed });
  },
  toggleGroup: (g) => {
    const open = get().open.includes(g) ? get().open.filter((x) => x !== g) : [...get().open, g];
    set({ open });
    write({ open, closed: get().closed });
  },
  toggleKind: (g, kind) => {
    const cur = get().closed[g] ?? [];
    const closed = {
      ...get().closed,
      [g]: cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind],
    };
    set({ closed });
    write({ open: get().open, closed });
  },
}));
