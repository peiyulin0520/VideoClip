import { HashRouter, Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home';
import { Placeholder } from './pages/Placeholder';

// HashRouter：GitHub Pages 是子路徑（/VideoClip/），用 #/ 路由才不會 404。
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/p/:projectId" element={<Placeholder title="編輯器" note="Phase 1 會做" />} />
        <Route path="/settings" element={<Placeholder title="設定" note="Phase 3 會做" />} />
        <Route path="*" element={<Placeholder title="找不到頁面" note="" />} />
      </Routes>
    </HashRouter>
  );
}
