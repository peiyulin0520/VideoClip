import { useUI } from '../store/uiStore';

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const busy = useUI((s) => s.busy);
  return (
    <>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>
      {busy && (
        <div className="busy" role="status">
          <div className="spinner" />
          <div>{busy}</div>
        </div>
      )}
    </>
  );
}
