import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { initFonts } from '../fonts/fontStore';
import { useApp } from '../store/appStore';
import { Toasts } from '../ui/Toasts';
import { UpdateBanner } from '../ui/UpdateBanner';
import { Editor } from './pages/Editor';
import { Home } from './pages/Home';
import { Settings } from './pages/Settings';
import { Welcome } from './Welcome';
import { Placeholder } from './pages/Placeholder';

// HashRouter：GitHub Pages 是子路徑（/VideoClip/），用 #/ 路由才不會 404。
export function App() {
  const loaded = useApp((s) => s.loaded);
  const onboarded = useApp((s) => s.state.onboarded);
  useEffect(() => {
    void useApp.getState().init();
    void initFonts();
  }, []);
  return (
    <HashRouter>
      <Toasts />
      <UpdateBanner />
      {loaded && !onboarded && <Welcome />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/p/:projectId" element={<Editor />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Placeholder title="找不到頁面" note="" />} />
      </Routes>
    </HashRouter>
  );
}
