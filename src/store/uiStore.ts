import { create } from 'zustand';
import type { Player } from '../engine/player';

type Toast = { id: number; text: string };
let nextId = 1;

type UI = {
  toasts: Toast[];
  toast: (text: string, ms?: number) => void;
  busy: string | null;
  setBusy: (text: string | null) => void;
  player: Player | null;
  /** 全螢幕預覽：隱藏時間軸與底部面板 */
  previewFull: boolean;
  /** 要求底部工具列切到某個分頁（例如點時間軸上的轉場小圓圈 → 特效）；工具列切完會清掉 */
  requestTab: string | null;
};

export const useUI = create<UI>((set, get) => ({
  toasts: [],
  toast: (text, ms = 2600) => {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-2), { id, text }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), ms);
  },
  busy: null,
  setBusy: (busy) => set({ busy }),
  player: null,
  previewFull: false,
  requestTab: null,
}));

export const toast = (text: string, ms?: number) => useUI.getState().toast(text, ms);
