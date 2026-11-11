import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Project } from '../model/types';

interface VideoClipDB extends DBSchema {
  projects: { key: string; value: Project };
  /** 沒有 OPFS 可寫入時的退路：把素材 Blob 存在 IndexedDB（key: `${projectId}/${assetId}`） */
  blobs: { key: string; value: Blob };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<VideoClipDB>> | null = null;

export function getDB() {
  dbPromise ??= openDB<VideoClipDB>('videoclip', 1, {
    upgrade(db) {
      db.createObjectStore('projects', { keyPath: 'id' });
      db.createObjectStore('blobs');
      db.createObjectStore('meta');
    },
  });
  return dbPromise;
}
