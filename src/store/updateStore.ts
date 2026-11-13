import { create } from 'zustand';

/** 有新版但自動換不上（iPhone 的 Service Worker 常常不肯換）：記下新版的版本號，畫面底下出現「點一下更新」 */
export const useUpdate = create<{ available: string | null }>(() => ({ available: null }));
