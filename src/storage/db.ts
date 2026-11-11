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

interface VideoClipDB extends DBSchema {
  projects: { key: string; value: Project };
  /** 沒有 OPFS 可寫入時的退路：把素材 Blob 存在 IndexedDB（key: `${projectId}/${assetId}`） */
  blobs: { key: string; value: Blob };
  meta: { key: string; value: unknown };
  /** 使用者自己匯入的字體 */
  userFonts: { key: string; value: UserFontRecord };
}

let dbPromise: Promise<IDBPDatabase<VideoClipDB>> | null = null;

export function getDB() {
  dbPromise ??= openDB<VideoClipDB>('videoclip', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('blobs');
        db.createObjectStore('meta');
      }
      if (oldVersion < 2) db.createObjectStore('userFonts', { keyPath: 'id' });
    },
  });
  return dbPromise;
}
