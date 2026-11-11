import { useRef, useState } from 'react';
import { packFonts } from '../../fonts/catalog';
import { installFonts, type InstallProgress } from '../../fonts/fontStore';

/** 下載一個或多個字體包，回報進度；可中止 */
export function usePackInstall() {
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const run = async (packs: string[]) => {
    const keys = packs.flatMap((p) => packFonts(p).map((f) => f.key));
    abort.current = new AbortController();
    setRunning(true);
    try {
      return await installFonts(keys, setProgress, abort.current.signal);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };
  const cancel = () => abort.current?.abort();
  return { progress, running, run, cancel };
}

export const percent = (p: InstallProgress | null) => (p && p.totalBytes > 0 ? Math.min(100, Math.round((p.doneBytes / p.totalBytes) * 100)) : 0);
