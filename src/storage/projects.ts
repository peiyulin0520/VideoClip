import { createProject, newId } from '../model/defaults';
import { migrateProject, type Migrated } from '../model/migrate';
import type { Project } from '../model/types';
import { getDB } from './db';
import { copyProjectMedia, deleteProjectMedia } from './media';

// 寫入排成一條佇列，讀取一律等前面的寫入完成：
// 否則離開編輯器時剛送出的存檔，可能比首頁的讀取晚到，首頁就會顯示舊資料。
let writes: Promise<unknown> = Promise.resolve();
function queued<T>(fn: () => Promise<T>): Promise<T> {
  const p = writes.then(fn, fn);
  writes = p.catch(() => {});
  return p;
}

export async function listProjects(): Promise<Project[]> {
  await writes;
  const db = await getDB();
  const all = await db.getAll('projects');
  // 舊格式（v1）讀進來時在記憶體裡轉成 v2；首頁只用來顯示，不寫回去
  return all.map((p) => migrateProject(p).project).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 讀專案並轉成最新格式；changed／reordered 讓編輯器決定要不要存回去、要不要提醒使用者 */
export async function getProjectMigrated(id: string): Promise<Migrated | undefined> {
  await writes;
  const db = await getDB();
  const p = await db.get('projects', id);
  return p ? migrateProject(p) : undefined;
}

export async function getProject(id: string): Promise<Project | undefined> {
  return (await getProjectMigrated(id))?.project;
}

export function saveProject(p: Project): Promise<void> {
  return queued(async () => {
    const db = await getDB();
    await db.put('projects', p);
  });
}

export function deleteProject(id: string): Promise<void> {
  return queued(async () => {
    const db = await getDB();
    await db.delete('projects', id);
    await deleteProjectMedia(id);
  });
}

/** 複製專案：素材檔也會複製一份（兩個專案互不影響） */
export async function duplicateProject(id: string): Promise<Project | undefined> {
  const src = await getProject(id);
  if (!src) return undefined;
  const now = Date.now();
  const base = createProject(`${src.name} 副本`, src.aspect, now);
  const copy: Project = {
    ...structuredClone(src),
    id: base.id,
    name: base.name,
    createdAt: now,
    updatedAt: now,
    tracks: structuredClone(src.tracks).map((t) => ({ ...t, id: newId('t_') })),
  };
  await copyProjectMedia(
    src.id,
    copy.id,
    src.assets.map((a) => ({ id: a.id, mime: a.mime })),
  );
  await saveProject(copy);
  return copy;
}

/** 換封面（undefined＝恢復預設）；會更新「最近修改」時間 */
export async function setProjectCover(p: Project, cover: string | undefined): Promise<void> {
  const next: Project = { ...p, updatedAt: Date.now() };
  if (cover) next.cover = cover;
  else delete next.cover;
  await saveProject(next);
}

export async function renameProject(id: string, name: string): Promise<void> {
  const p = await getProject(id);
  if (!p) return;
  await saveProject({ ...p, name, updatedAt: Date.now() });
}
