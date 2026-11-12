import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';
import { setupPwa } from './app/pwa';
import { cleanupExportTemp } from './engine/exporter';

setupPwa();
void cleanupExportTemp(); // 上次匯出到一半關掉網頁留下的暫存檔

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
