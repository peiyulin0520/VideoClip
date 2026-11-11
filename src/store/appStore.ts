import { create } from 'zustand';
import { DEFAULT_APP_STATE, loadAppState, saveAppState, type AppState } from '../storage/appState';
import { listProjects } from '../storage/projects';

type Store = {
  loaded: boolean;
  state: AppState;
  init: () => Promise<void>;
  update: (patch: Partial<AppState>) => Promise<void>;
};

/** 測試用：localStorage 的 vc-skip-onboarding 設成 1 就不顯示首次使用精靈（見 CLAUDE.md） */
function skipFlag(): boolean {
  try {
    return localStorage.getItem('vc-skip-onboarding') === '1';
  } catch {
    return false;
  }
}

export const useApp = create<Store>((set, get) => ({
  loaded: false,
  state: DEFAULT_APP_STATE,
  init: async () => {
    if (get().loaded) return;
    let st = await loadAppState();
    if (!st) {
      // 這台裝置已經有專案（精靈上線前就在用）：視為不是第一次，不跳精靈
      const hasData = (await listProjects()).length > 0;
      st = { ...DEFAULT_APP_STATE, onboarded: hasData || skipFlag() };
      if (st.onboarded && !skipFlag()) await saveAppState(st);
    }
    set({ loaded: true, state: st });
  },
  update: async (patch) => {
    const next = { ...get().state, ...patch };
    set({ state: next });
    await saveAppState(next);
  },
}));
