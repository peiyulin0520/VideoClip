import { newId } from '../model/defaults';
import { getDB, type LibraryRecord } from './db';

// 我的素材庫（使用者 2026-11-12）：自己上傳的貼圖、之後畫好的圖，存在這台裝置的瀏覽器裡，
// 所有剪輯專案都能用；不用每次重新匯入。GIPHY 搜尋結果不存在這裡（每次各自搜尋）。

export type LibraryItem = Omit<LibraryRecord, 'file'>;

export async function addToLibrary(file: Blob, name: string, kind: LibraryRecord['kind'] = 'sticker') {
  const rec: LibraryRecord = {
    id: newId('l_'),
    kind,
    name,
    file,
    mime: file.type || 'image/png',
    bytes: file.size,
    createdAt: Date.now(),
  };
  const db = await getDB();
  await db.put('library', rec);
  return rec;
}

export async function listLibrary(kind?: LibraryRecord['kind']): Promise<LibraryRecord[]> {
  const db = await getDB();
  const all = await db.getAll('library');
  return all.filter((r) => !kind || r.kind === kind).sort((a, b) => b.createdAt - a.createdAt);
}

export async function removeFromLibrary(id: string) {
  const db = await getDB();
  await db.delete('library', id);
}

export async function getLibraryFile(id: string): Promise<File | null> {
  const db = await getDB();
  const r = await db.get('library', id);
  if (!r) return null;
  const mime = r.mime || r.file.type || 'image/png';
  const ext =
    mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : 'jpg';
  const base = r.name.replace(/\.[a-z0-9]+$/i, '');
  return new File([r.file], `${base}.${ext}`, { type: mime });
}
