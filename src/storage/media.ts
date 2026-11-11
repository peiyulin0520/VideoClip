import { getDB } from './db';

// 素材原檔：優先放 OPFS（projects/<projectId>/media/<assetId>），
// 瀏覽器不支援寫入 OPFS（例如舊版 Safari 沒有 createWritable）就退回 IndexedDB Blob。
// ⚠ iPhone Safari 的實際行為沙盒測不到，列在 docs/PLAN.md §7 待真機驗證。

type DirHandle = FileSystemDirectoryHandle;

function opfsUsable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.storage?.getDirectory &&
    typeof FileSystemFileHandle !== 'undefined' &&
    'createWritable' in FileSystemFileHandle.prototype
  );
}

async function mediaDir(projectId: string, create: boolean): Promise<DirHandle> {
  const root = await navigator.storage.getDirectory();
  const projects = await root.getDirectoryHandle('projects', { create });
  const proj = await projects.getDirectoryHandle(projectId, { create });
  return proj.getDirectoryHandle('media', { create });
}

// 存放位置：OPFS → IndexedDB → 最後退路「只放在記憶體」（關掉網頁就沒了，會提醒使用者）
export type Stored = 'opfs' | 'idb' | 'memory';
const memory = new Map<string, Blob>();
const memKey = (projectId: string, assetId: string) => `${projectId}/${assetId}`;

/** 一次寫 8MB，避免 Safari 把整支大影片一次讀進記憶體（iPhone 4K 影片會 UnknownError / out of memory） */
export const WRITE_CHUNK = 8 * 1024 * 1024;
export function chunkRanges(size: number, chunk = WRITE_CHUNK): [number, number][] {
  const out: [number, number][] = [];
  for (let o = 0; o < size; o += chunk) out.push([o, Math.min(o + chunk, size)]);
  return out;
}

async function putOpfs(projectId: string, assetId: string, blob: Blob, onProgress?: (f: number) => void) {
  const dir = await mediaDir(projectId, true);
  const fh = await dir.getFileHandle(assetId, { create: true });
  const w = await fh.createWritable();
  try {
    let done = 0;
    for (const [from, to] of chunkRanges(blob.size)) {
      await w.write(blob.slice(from, to));
      done = to;
      onProgress?.(done / Math.max(blob.size, 1));
    }
    await w.close();
  } catch (e) {
    await w.abort().catch(() => {});
    await dir.removeEntry(assetId).catch(() => {}); // 不要留下寫一半的檔案
    throw e;
  }
}

/**
 * 存素材原檔，回傳實際存在哪裡。每一層失敗都會往下一層退（失敗原因用 onFallback 回報，給除錯和錯誤訊息用）。
 * persistent=false（已知空間不夠）時直接放記憶體。
 */
export async function putMedia(
  projectId: string,
  assetId: string,
  blob: Blob,
  opts: {
    onProgress?: (fraction: number) => void;
    onFallback?: (from: Stored, e: unknown) => void;
    persistent?: boolean;
  } = {},
): Promise<Stored> {
  if (opts.persistent !== false) {
    if (opfsUsable()) {
      try {
        await putOpfs(projectId, assetId, blob, opts.onProgress);
        return 'opfs';
      } catch (e) {
        opts.onFallback?.('opfs', e);
      }
    }
    try {
      const db = await getDB();
      await db.put('blobs', blob, `${projectId}/${assetId}`);
      return 'idb';
    } catch (e) {
      opts.onFallback?.('idb', e);
    }
  }
  memory.set(memKey(projectId, assetId), blob);
  return 'memory';
}

export async function getMedia(projectId: string, assetId: string, mime: string): Promise<File> {
  const mem = memory.get(memKey(projectId, assetId));
  if (mem) return new File([mem], assetId, { type: mime });
  if (opfsUsable()) {
    try {
      const dir = await mediaDir(projectId, false);
      const fh = await dir.getFileHandle(assetId);
      const f = await fh.getFile();
      return new File([f], assetId, { type: mime });
    } catch {
      /* 找不到就試 IndexedDB */
    }
  }
  const db = await getDB();
  const blob = await db.get('blobs', `${projectId}/${assetId}`);
  if (!blob) throw new Error(`找不到素材檔 ${assetId}`);
  return new File([blob], assetId, { type: mime });
}

export async function deleteProjectMedia(projectId: string): Promise<void> {
  for (const k of [...memory.keys()]) if (k.startsWith(`${projectId}/`)) memory.delete(k);
  if (opfsUsable()) {
    try {
      const root = await navigator.storage.getDirectory();
      const projects = await root.getDirectoryHandle('projects');
      await projects.removeEntry(projectId, { recursive: true });
    } catch {
      /* 沒有就算了 */
    }
  }
  const db = await getDB();
  const keys = await db.getAllKeys('blobs');
  const tx = db.transaction('blobs', 'readwrite');
  for (const k of keys) if (String(k).startsWith(`${projectId}/`)) tx.store.delete(k);
  await tx.done;
}

export async function copyProjectMedia(
  fromId: string,
  toId: string,
  assets: { id: string; mime: string }[],
): Promise<void> {
  for (const a of assets) {
    const f = await getMedia(fromId, a.id, a.mime);
    await putMedia(toId, a.id, f);
  }
}

export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}
