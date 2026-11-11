import { Link } from 'react-router-dom';

export function Home() {
  return (
    <main className="page">
      <header className="topbar">
        <h1>VideoClip 剪輯</h1>
        <Link className="icon-btn" to="/settings" aria-label="設定">
          ⚙
        </Link>
      </header>
      <section className="empty">
        <p className="empty-title">還沒有專案</p>
        <p className="empty-note">專案管理與影片匯入會在 Phase 1 加入。</p>
      </section>
    </main>
  );
}
