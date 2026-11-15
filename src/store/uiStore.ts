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
  /** 特效分頁／時間軸上目前選的是哪一塊（進場、出場、跟前一段的轉場）：時間軸的圓圈用它顯示「選取中」的顏色 */
  fxFocus: { id: string; role: 'in' | 'out' | 'seam' | 'style' } | null;
  /** 播放列的 👁：暫時看原色（整個專案不套調色；不改專案資料） */
  gradePeek: boolean;
  /** 時間軸目前每秒幾 px：決定「播放線碰到菱形」的範圍 */
  timelinePps: number;
  /** 色調分頁的「套用到」：整段素材／這個定格（只記使用者手動選的，沒選就由有沒有定格決定） */
  gradeScope: { id: string; scope: 'item' | 'key' } | null;
  /** 自訂比例：預覽上正在拖版面的框（fx、fy＝框占 9:16 底的寬、高比例）；沒有＝沒在調 */
  frameEdit: { fx: number; fy: number; fill: boolean } | null;
  /** 選到版型（或版型裡的東西）時，新增文字／貼圖／音效預設加進那個版型；使用者在各分頁關掉＝這個旗標 true */
  addToGroupOff: boolean;
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
  fxFocus: null,
  gradePeek: false,
  timelinePps: 40,
  gradeScope: null,
  frameEdit: null,
  addToGroupOff: false,
}));

export const toast = (text: string, ms?: number) => useUI.getState().toast(text, ms);
