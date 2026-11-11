import { Link } from 'react-router-dom';

export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <main className="page">
      <header className="topbar">
        <Link className="icon-btn" to="/" aria-label="回首頁">
          ←
        </Link>
        <h1>{title}</h1>
      </header>
      {note && <p className="empty-note">{note}</p>}
    </main>
  );
}
