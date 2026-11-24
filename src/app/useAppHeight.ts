import { useEffect } from 'react';

/**
 * 加到主畫面（獨立 App）時，iPhone 的 100svh 會比實際螢幕矮一截（功能列下面多一塊空白）；
 * 這時改用 window.innerHeight 當整個畫面的高度（寫進 --app-h）。在 Safari 網頁裡不這樣做
 * （網址列伸縮時 innerHeight 會一直變、畫面會抖），照舊用 svh。
 */
export function useAppHeight() {
  useEffect(() => {
    const standalone =
      (navigator as unknown as { standalone?: boolean }).standalone === true ||
      !!window.matchMedia?.('(display-mode: standalone)').matches;
    if (!standalone) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty('--app-h', `${window.innerHeight}px`);
    set();
    window.addEventListener('resize', set);
    window.addEventListener('orientationchange', set);
    window.visualViewport?.addEventListener('resize', set);
    return () => {
      window.removeEventListener('resize', set);
      window.removeEventListener('orientationchange', set);
      window.visualViewport?.removeEventListener('resize', set);
      root.style.removeProperty('--app-h');
    };
  }, []);
}
