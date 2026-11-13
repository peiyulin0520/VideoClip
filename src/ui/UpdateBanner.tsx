import { useState } from 'react';
import { applyUpdate, shortVersion } from '../app/pwa';
import { useUpdate } from '../store/updateStore';

/** 有新版但自動換不上時，畫面底下的「點一下更新」橫幅 */
export function UpdateBanner() {
  const available = useUpdate((s) => s.available);
  const [busy, setBusy] = useState(false);
  if (!available) return null;
  return (
    <div className="update-banner" role="status" data-testid="update-banner">
      <span>有新版本（{shortVersion(available)}）</span>
      <button
        className="btn primary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void applyUpdate();
        }}
      >
        {busy ? '更新中…' : '點一下更新'}
      </button>
    </div>
  );
}
