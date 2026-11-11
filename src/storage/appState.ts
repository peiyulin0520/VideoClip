import { getDB } from './db';

/** 備份位置：手機檔案（匯出 .zip）、Google 雲端（Phase 6 開放）、先不要備份 */
export type BackupMode = 'files' | 'cloud' | 'none';

export type AppState = {
  /** 已完成首次使用精靈（或舊資料的裝置直接略過） */
  onboarded: boolean;
  backup: { mode: BackupMode; driveFolderUrl?: string; driveFolderId?: string };
  /** 使用者已經看過「還沒下載字體」的提示 */
  fontsBannerDismissed?: boolean;
};

export const DEFAULT_APP_STATE: AppState = { onboarded: false, backup: { mode: 'files' } };

const KEY = 'appState';

export async function loadAppState(): Promise<AppState | null> {
  const db = await getDB();
  return ((await db.get('meta', KEY)) as AppState | undefined) ?? null;
}

export async function saveAppState(s: AppState): Promise<void> {
  const db = await getDB();
  await db.put('meta', s, KEY);
}

/** 從 Google Drive 資料夾網址抓出資料夾 ID。支援 /drive/folders/<id>、/drive/u/0/folders/<id>?usp=sharing、?id=<id> */
export function parseDriveFolderId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/) ?? s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1]!;
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : null; // 直接貼 ID
}
