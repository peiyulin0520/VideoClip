import { HashRouter, Route, Routes } from 'react-router-dom';
import { Toasts } from '../ui/Toasts';
import { Editor } from './pages/Editor';
import { Home } from './pages/Home';
import { Placeholder } from './pages/Placeholder';

// HashRouter：GitHub Pages 是子路徑（/VideoClip/），用 #/ 路由才不會 404。
export function App() {
  return (
    <HashRouter>
      <Toasts />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/p/:projectId" element={<Editor />} />
        <Route path="/settings" element={<Placeholder title="設定" note="Phase 3 會做" />} />
        <Route path="*" element={<Placeholder title="找不到頁面" note="" />} />
      </Routes>
    </HashRouter>
  );
}
