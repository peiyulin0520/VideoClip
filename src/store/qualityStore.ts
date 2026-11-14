import { create } from 'zustand';
import { readQuality, writeQuality, type PreviewQuality } from '../engine/previewQuality';

/** 預覽畫質：頂列、設定頁、預覽三個地方共用（存在這台手機） */
export const useQuality = create<{ q: PreviewQuality; set: (q: PreviewQuality) => void }>((set) => ({
  q: readQuality(),
  set: (q) => {
    writeQuality(q);
    set({ q });
  },
}));
