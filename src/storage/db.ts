import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Project } from '../model/types';

export type UserFontRecord = {
  id: string;
  name: string;
  /** 原始字型檔（.ttf/.otf/.woff/.woff2）。只存在這台裝置。 */
  file: Blob;
  bytes: number;
  createdAt: number;
};

/** 我的素材庫：自己上傳的貼圖（之後畫好的圖也放這裡）。存在這台裝置，所有專案共用 */
export type LibraryRecord = {
  id: string;
  kind: 'sticker' | 'drawing';
  name: string;
  file: Blob;
  mime: string; // 另外存：有些瀏覽器的 IndexedDB 存 Blob 會掉 type
  bytes: number;
  createdAt: number;
};

interface VideoClipDB extends DBSchema {
  projects: { key: string; value: Project };
  /** 沒有 OPFS 可寫入時的退路：把素材 Blob 存在 IndexedDB（key: `${projectId}/${assetId}`） */
  blobs: { key: string; value: Blob };
  meta: { key: string; value: unknown };
  /** 使用者自己匯入的字體 */
  userFonts: { key: string; value: UserFontRecord };
  library: { key: string; value: LibraryRecord };
}

let dbPromise: Promise<IDBPDatabase<VideoClipDB>> | null = null;

export function getDB() {
  dbPromise ??= openDB<VideoClipDB>('videoclip', 3, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('blobs');
        db.createObjectStore('meta');
      }
      if (oldVersion < 2) db.createObjectStore('userFonts', { keyPath: 'id' });
      if (oldVersion < 3) db.createObjectStore('library', { keyPath: 'id' });
    },
  });
  return dbPromise;
}
