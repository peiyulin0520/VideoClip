import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';
import { setupPwa } from './app/pwa';
import { cleanupExportTemp } from './engine/exporter';
import { applyTheme, getTheme } from './ui/theme';

applyTheme(getTheme());
setupPwa();
void cleanupExportTemp(); // 上次匯出到一半關掉網頁留下的暫存檔

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// iPhone Safari 要有 touchstart 監聽，按鈕的 :active（按下去的顏色回饋）才會生效
document.addEventListener('touchstart', () => {}, { passive: true });
