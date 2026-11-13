import { registerSW } from 'virtual:pwa-register';
import { useUpdate } from '../store/updateStore';

// 網站更新：GitHub Pages 部署新版後，iPhone 上的 Service Worker 可能還一直給舊版。
// 做法：建置時另外寫 version.json（不進快取），開網頁、回到前景、設定頁按「檢查更新」時拿它跟自己的版本比對；
// 不一樣就叫 Service Worker 更新，等它接手（autoUpdate 會自動重新整理）；10 秒內沒接手就在畫面底下出現
// 「有新版本，點一下更新」，點了還是不行就清掉我們自己的快取、解除 Service Worker 再重新整理。
// 專案資料在 IndexedDB／OPFS，不受影響；編輯中的專案有自動儲存＋離開頁面前存檔。

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/** 「2026-11-13 23:24（abc1234）」→「11/13 23:24」（編輯器頂列用小字顯示，截圖時看得出是哪一版） */
export function shortVersion(v: string = APP_VERSION): string {
  const m = /^\d{4}-(\d{2})-(\d{2}) (\d{2}:\d{2})/.exec(v);
  return m ? `${m[1]}/${m[2]} ${m[3]}` : v;
}

export type UpdateResult = 'latest' | 'updating' | 'prompt' | 'offline' | 'dev';

let regRef: ServiceWorkerRegistration | undefined;
let updateSW: ((reload?: boolean) => Promise<void>) | undefined;

/** 伺服器上目前的版本號；連不上回傳 null */
export async function fetchRemoteVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string };
    return typeof body.version === 'string' ? body.version : null;
  } catch {
    return null;
  }
}

/** 檢查有沒有新版，有就更新。回傳結果給設定頁顯示；自動檢查時忽略回傳值 */
export async function checkForUpdate(): Promise<UpdateResult> {
  if (APP_VERSION === 'dev') return 'dev';
  const remote = await fetchRemoteVersion();
  if (!remote) return 'offline';
  if (remote === APP_VERSION) {
    useUpdate.setState({ available: null });
    return 'latest';
  }
  void regRef?.update().catch(() => {});
  // 等新的 Service Worker 接手（接手後頁面會自動重新整理，這個 Promise 就不會回來）
  const took = await new Promise<boolean>((ok) => {
    const sw = navigator.serviceWorker;
    if (!sw) return ok(false);
    const done = (v: boolean) => {
      sw.removeEventListener('controllerchange', onChange);
      clearTimeout(timer);
      ok(v);
    };
    const onChange = () => done(true);
    const timer = setTimeout(() => done(false), 10_000);
    sw.addEventListener('controllerchange', onChange);
  });
  if (took) return 'updating';
  useUpdate.setState({ available: remote });
  return 'prompt';
}

/** 使用者按了「點一下更新」：先請等著的新版接手；不行就清快取、解除 Service Worker 再重新整理 */
export async function applyUpdate(): Promise<void> {
  void updateSW?.(true).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  try {
    for (const k of await caches.keys()) if (/^(workbox|sw-)/.test(k)) await caches.delete(k);
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  } catch {
    /* 清不掉也照樣重新整理 */
  }
  location.reload();
}

export function setupPwa() {
  if (!('serviceWorker' in navigator)) return;
  updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      regRef = reg;
      const check = () => {
        void reg.update().catch(() => {});
        void checkForUpdate();
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      setInterval(check, 30 * 60 * 1000);
      setTimeout(() => void checkForUpdate(), 1500); // 開網頁後馬上檢查一次
    },
  });
}
