import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import type { Item, Project, VideoItem } from '../model/types';

const HISTORY_LIMIT = 100;
const COALESCE_MS = 800;

type ApplyOpts = {
  /** 同一個 key 在短時間內連續的修改（拖滑桿、拖修剪把手）合併成一步復原 */
  coalesce?: string;
  /** 套用後要選取的物件（undefined = 不變，null = 取消選取） */
  select?: string | null;
};

type State = {
  project: Project | null;
  past: Project[];
  future: Project[];
  selectedId: string | null;
  lastEdit: { key: string; at: number } | null;
  /** 每次內容變更 +1，自動儲存用來判斷是否有未存的修改 */
  revision: number;
  load: (p: Project) => void;
  close: () => void;
  apply: (recipe: (draft: Draft<Project>) => void, opts?: ApplyOpts) => void;
  undo: () => boolean;
  redo: () => boolean;
  select: (id: string | null) => void;
};

export const useProjectStore = create<State>((set, get) => ({
  project: null,
  past: [],
  future: [],
  selectedId: null,
  lastEdit: null,
  revision: 0,

  load: (p) => set({ project: p, past: [], future: [], selectedId: null, lastEdit: null, revision: 0 }),
  close: () => set({ project: null, past: [], future: [], selectedId: null, lastEdit: null, revision: 0 }),

  apply: (recipe, opts = {}) => {
    const { project, past, lastEdit, revision } = get();
    if (!project) return;
    const next = produce(project, (d) => {
      recipe(d);
    });
    if (next === project) return;
    const stamped = { ...next, updatedAt: Date.now() };
    const now = Date.now();
    const coalesced =
      !!opts.coalesce &&
      lastEdit?.key === opts.coalesce &&
      now - lastEdit.at < COALESCE_MS &&
      past.length > 0;
    const newPast = coalesced ? past : [...past, project].slice(-HISTORY_LIMIT);
    set({
      project: stamped,
      past: newPast,
      future: [],
      lastEdit: opts.coalesce ? { key: opts.coalesce, at: now } : null,
      revision: revision + 1,
      ...(opts.select !== undefined ? { selectedId: opts.select } : {}),
    });
  },

  undo: () => {
    const { project, past, future, revision } = get();
    if (!project || past.length === 0) return false;
    const prev = past[past.length - 1]!;
    set({
      project: { ...prev, updatedAt: Date.now() },
      past: past.slice(0, -1),
      future: [project, ...future],
      lastEdit: null,
      revision: revision + 1,
    });
    return true;
  },

  redo: () => {
    const { project, past, future, revision } = get();
    if (!project || future.length === 0) return false;
    const [nxt, ...rest] = future;
    set({
      project: { ...nxt!, updatedAt: Date.now() },
      past: [...past, project],
      future: rest,
      lastEdit: null,
      revision: revision + 1,
    });
    return true;
  },

  select: (id) => set({ selectedId: id }),
}));

/** 取代主軌的片段清單（呼叫端要先用 timeline.ts 的函式算好、包含 relayout） */
export function setMainItems(items: VideoItem[], opts?: ApplyOpts) {
  useProjectStore.getState().apply((d) => {
    const tr = d.tracks.find((t) => t.kind === 'main');
    if (tr) tr.items = items;
  }, opts);
}

/** 取代某條軌道的物件清單（疊加/文字軌：呼叫端用 timeline.ts 的 *Free 函式算好） */
export function setTrackItems(trackId: string, items: Item[], opts?: ApplyOpts) {
  useProjectStore.getState().apply((d) => {
    const tr = d.tracks.find((t) => t.id === trackId);
    if (tr) tr.items = items;
  }, opts);
}
