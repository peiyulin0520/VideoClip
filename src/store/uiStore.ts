import { create } from 'zustand';
import type { Player } from '../engine/player';

type Toast = { id: number; text: string };
let nextId = 1;

type UI = {
  toasts: Toast[];
  toast: (text: string) => void;
  busy: string | null;
  setBusy: (text: string | null) => void;
  player: Player | null;
};

export const useUI = create<UI>((set, get) => ({
  toasts: [],
  toast: (text) => {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-2), { id, text }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 2600);
  },
  busy: null,
  setBusy: (busy) => set({ busy }),
  player: null,
}));

export const toast = (text: string) => useUI.getState().toast(text);
