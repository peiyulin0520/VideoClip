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

export async function putMedia(projectId: string, assetId: string, blob: Blob): Promise<void> {
  if (opfsUsable()) {
    const dir = await mediaDir(projectId, true);
    const fh = await dir.getFileHandle(assetId, { create: true });
    const w = await fh.createWritable();
    try {
      await w.write(blob);
      await w.close();
    } catch (e) {
      await w.abort().catch(() => {});
      throw e;
    }
    return;
  }
  const db = await getDB();
  await db.put('blobs', blob, `${projectId}/${assetId}`);
}

export async function getMedia(projectId: string, assetId: string, mime: string): Promise<File> {
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
