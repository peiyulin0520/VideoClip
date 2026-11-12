import { registerSW } from 'virtual:pwa-register';

// 網站更新：GitHub Pages 部署新版後，iPhone 上的 Service Worker 可能還一直給舊版。
// 這裡在開網頁時與「回到前景」時都檢查新版；新版接手（autoUpdate）後 vite-plugin-pwa 會自動重新整理頁面。
// 編輯中的專案有自動儲存＋離開頁面前存檔（autosave.ts），重新整理不會掉資料。
export function setupPwa() {
  if (!('serviceWorker' in navigator)) return;
  const update = registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => void reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      setInterval(check, 30 * 60 * 1000);
    },
  });
  void update;
}

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
