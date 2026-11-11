import { create } from 'zustand';
import { newId } from '../model/defaults';
import { getDB, type UserFontRecord } from '../storage/db';
import { CATALOG, fontUrl, findFont, type CatalogFont } from './catalog';
import { readFontFamilyName } from './sfnt';

// 字體的下載、快取（Cache Storage）與載入（FontFace）。
// - 官方字體：從網站（同網域 public/fonts/）下載，存在 Cache Storage；之後從快取讀，不再問。
// - 使用者自己匯入的字體：存在這台裝置的 IndexedDB（只在這台裝置，不上傳）。
// fontId：官方字體用目錄 key（例如 pop-gothic），匯入的用 u:<id>。

const CACHE_NAME = 'vc-fonts-v1';
export const FALLBACK_STACK =
  '"vc-noto-sans-tc", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif';

export type UserFont = { id: string; name: string; bytes: number; createdAt: number };
type State = {
  ready: boolean;
  installed: Set<string>; // 已下載到這台裝置的官方字體
  loaded: Set<string>; // 已經註冊到 document.fonts、可以畫的字體
  userFonts: UserFont[];
  /** 每有字體載入完成 +1：字卡圖要重畫 */
  epoch: number;
};

export const useFonts = create<State>(() => ({
  ready: false,
  installed: new Set(),
  loaded: new Set(),
  userFonts: [],
  epoch: 0,
}));

const set = useFonts.setState;
const get = useFonts.getState;

export async function initFonts(): Promise<void> {
  if (get().ready) return;
  const db = await getDB();
  const installed = new Set(((await db.get('meta', 'installedFonts')) as string[] | undefined) ?? []);
  const users = (await db.getAll('userFonts')).map(({ id, name, bytes, createdAt }) => ({ id, name, bytes, createdAt }));
  set({ ready: true, installed, userFonts: users.sort((a, b) => a.createdAt - b.createdAt) });
}

async function persistInstalled(installed: Set<string>) {
  const db = await getDB();
  await db.put('meta', [...installed], 'installedFonts');
}

async function openCache(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null; // 無痕模式等沒有 Cache Storage：每次都從網路抓，功能不受影響
  }
}

async function readBody(res: Response, onBytes?: (n: number) => void): Promise<ArrayBuffer> {
  if (!res.body || !onBytes) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    onBytes(value.length);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out.buffer;
}

/** 先看快取，沒有就下載並存進快取 */
async function fetchCached(url: string, onBytes?: (n: number) => void, signal?: AbortSignal): Promise<ArrayBuffer> {
  const cache = await openCache();
  const hit = await cache?.match(url);
  if (hit) {
    const buf = await hit.arrayBuffer();
    onBytes?.(buf.byteLength);
    return buf;
  }
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    let counted = 0;
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await readBody(res, (n) => {
        counted += n;
        onBytes?.(n);
      });
      await cache?.put(url, new Response(buf, { headers: { 'content-type': res.headers.get('content-type') ?? 'font/woff2' } }));
      return buf;
    } catch (e) {
      lastErr = e;
      if (signal?.aborted) throw e;
      onBytes?.(-counted); // 重試時把算進去的進度扣掉
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

// ---------- 載入（註冊到 document.fonts）----------

const loading = new Map<string, Promise<boolean>>();

export function isLoaded(fontId: string): boolean {
  return get().loaded.has(fontId);
}

/** 這個字體在畫布上要用的 CSS font-family（還沒載入完成就是 null，用備用字體） */
export function cssFamily(fontId: string): string | null {
  if (!isLoaded(fontId)) return null;
  if (fontId.startsWith('u:')) return `vcu-${fontId.slice(2)}`;
  return findFont(fontId)?.family ?? null;
}

function markLoaded(fontId: string) {
  const loaded = new Set(get().loaded);
  loaded.add(fontId);
  set({ loaded, epoch: get().epoch + 1 });
}

async function loadCatalogFont(f: CatalogFont): Promise<boolean> {
  try {
    for (const face of f.faces) {
      const buf = await fetchCached(fontUrl(f.key, face.file));
      const ff = new FontFace(f.family, buf, { weight: String(face.weight), style: 'normal', display: 'swap' });
      await ff.load();
      document.fonts.add(ff);
    }
    const installed = new Set(get().installed);
    if (!installed.has(f.key)) {
      installed.add(f.key);
      set({ installed });
      void persistInstalled(installed);
    }
    markLoaded(f.key);
    return true;
  } catch (e) {
    console.warn('字體載入失敗', f.key, e);
    return false;
  }
}

async function loadUserFont(id: string): Promise<boolean> {
  try {
    const db = await getDB();
    const rec = await db.get('userFonts', id);
    if (!rec) return false;
    const ff = new FontFace(`vcu-${id}`, await rec.file.arrayBuffer(), { display: 'swap' });
    await ff.load();
    document.fonts.add(ff);
    markLoaded(`u:${id}`);
    return true;
  } catch (e) {
    console.warn('匯入的字體載入失敗', id, e);
    return false;
  }
}

/** 確保字體載入完成。沒有下載過會自動下載（快取被清掉也會自動補回來）。 */
export function ensureFont(fontId: string): Promise<boolean> {
  if (isLoaded(fontId)) return Promise.resolve(true);
  let p = loading.get(fontId);
  if (!p) {
    const f = fontId.startsWith('u:') ? null : findFont(fontId);
    if (!fontId.startsWith('u:') && !f) return Promise.resolve(false); // 'system' 或不認識的 id
    p = (fontId.startsWith('u:') ? loadUserFont(fontId.slice(2)) : loadCatalogFont(f!)).finally(() => loading.delete(fontId));
    loading.set(fontId, p);
  }
  return p;
}

/** 畫字卡時呼叫：還沒載入就背景載入，好了會 epoch+1 觸發重畫 */
export function requestFont(fontId: string): void {
  if (!isLoaded(fontId) && !loading.has(fontId)) void ensureFont(fontId);
}

// ---------- 下載 / 移除 ----------

export type InstallProgress = { doneBytes: number; totalBytes: number; current: string; finished: number; total: number };

export async function installFonts(
  keys: string[],
  onProgress?: (p: InstallProgress) => void,
  signal?: AbortSignal,
): Promise<{ ok: string[]; failed: string[] }> {
  const fonts = keys.map(findFont).filter((f): f is CatalogFont => !!f && !get().installed.has(f.key));
  const totalBytes = fonts.reduce((s, f) => s + f.bytes, 0);
  const result = { ok: [] as string[], failed: [] as string[] };
  let doneBytes = 0;
  let finished = 0;
  let current = '';
  const report = () => onProgress?.({ doneBytes: Math.max(doneBytes, 0), totalBytes, current, finished, total: fonts.length });
  report();
  let idx = 0;
  const worker = async () => {
    while (idx < fonts.length && !signal?.aborted) {
      const f = fonts[idx++]!;
      current = f.label;
      try {
        const files = [...f.faces.map((x) => x.file), f.preview];
        for (const file of files) {
          await fetchCached(
            fontUrl(f.key, file),
            (n) => {
              doneBytes += n;
              report();
            },
            signal,
          );
        }
        const installed = new Set(get().installed);
        installed.add(f.key);
        set({ installed });
        result.ok.push(f.key);
      } catch {
        result.failed.push(f.key);
      }
      finished++;
      report();
    }
  };
  await Promise.all([worker(), worker()]);
  await persistInstalled(get().installed);
  return result;
}

export async function removeFont(key: string): Promise<void> {
  const f = findFont(key);
  if (!f) return;
  const cache = await openCache();
  for (const file of [...f.faces.map((x) => x.file), f.preview]) await cache?.delete(fontUrl(key, file));
  const installed = new Set(get().installed);
  installed.delete(key);
  set({ installed });
  await persistInstalled(installed);
  // 已經註冊在 document.fonts 的這個頁面還能用到重新整理（再用到時會自動下載）
}

// ---------- 預覽字樣（下拉選單用，每個字體只有幾 KB）----------

const previews = new Map<string, Promise<string | null>>();

/** 回傳預覽用的 CSS font-family；圖片型預覽回傳 null（用 previewImageUrl） */
export function ensurePreview(f: CatalogFont): Promise<string | null> {
  if (f.previewKind === 'image') return Promise.resolve(null);
  let p = previews.get(f.key);
  if (!p) {
    p = (async () => {
      try {
        const buf = await fetchCached(fontUrl(f.key, f.preview));
        const family = `vcp-${f.key}`;
        const ff = new FontFace(family, buf, { display: 'swap' });
        await ff.load();
        document.fonts.add(ff);
        return family;
      } catch {
        return null;
      }
    })();
    previews.set(f.key, p);
  }
  return p;
}

export const previewImageUrl = (f: CatalogFont) => fontUrl(f.key, f.preview);

// ---------- 使用者匯入的字體 ----------

export async function importUserFont(file: File): Promise<UserFont> {
  const buf = await file.arrayBuffer();
  const id = newId('f_').slice(2);
  // 先確認瀏覽器真的讀得懂，壞檔就不存
  const test = new FontFace(`vcu-${id}`, buf.slice(0), { display: 'swap' });
  await test.load();
  document.fonts.add(test);
  const name = readFontFamilyName(buf) ?? file.name.replace(/\.[^.]+$/, '');
  const rec: UserFontRecord = { id, name, file, bytes: file.size, createdAt: Date.now() };
  const db = await getDB();
  await db.put('userFonts', rec);
  const uf = { id, name, bytes: file.size, createdAt: rec.createdAt };
  set({ userFonts: [...get().userFonts, uf] });
  markLoaded(`u:${id}`);
  return uf;
}

export async function removeUserFont(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('userFonts', id);
  set({ userFonts: get().userFonts.filter((u) => u.id !== id) });
}

export const allCatalogKeys = () => CATALOG.map((f) => f.key);
