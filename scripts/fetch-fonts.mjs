// 依 fonts/manifest.json 把要放進網站的字體原檔準備到 .font-cache/（不進 git）。
// 順序：已快取且 sha256 相符 → .font-cache/user/ 裡使用者提供的檔案 → 從 url 下載。
// 檔案和清單的大小/雜湊對不上時不會覆蓋，只回報（上游可能更新了，請人確認後再改清單）。
// 用法：NODE_USE_ENV_PROXY=1 node scripts/fetch-fonts.mjs   （沙盒要走代理；一般電腦不需要）
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.font-cache');
const USER = path.join(CACHE, 'user');
const manifest = JSON.parse(await readFile(path.join(ROOT, 'fonts/manifest.json'), 'utf8'));
const CONCURRENCY = 4;

const sha256 = (file) =>
  new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
const exists = (f) =>
  stat(f).then(
    (s) => s.size,
    () => -1,
  );

async function verify(file, e) {
  const size = await exists(file);
  if (size < 0) return 'missing';
  if (e.bytes && size !== e.bytes) return `大小不符（要 ${e.bytes}，實際 ${size}）`;
  if (e.sha256 && (await sha256(file)) !== e.sha256) return 'sha256 不符';
  return null;
}

async function download(url, dest) {
  const part = `${dest}.part`;
  let lastErr;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
      await rename(part, dest);
      return;
    } catch (err) {
      lastErr = err;
      await rm(part, { force: true });
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

const todo = manifest.fonts.filter((e) => e.build);
const result = { ok: [], downloaded: [], fromUser: [], missing: [], problems: [] };

async function one(e) {
  const dest = path.join(CACHE, e.file);
  await mkdir(path.dirname(dest), { recursive: true });
  if ((await verify(dest, e)) === null) return result.ok.push(e.file);

  for (const cand of [path.join(USER, e.file), path.join(USER, path.basename(e.file))]) {
    if ((await exists(cand)) >= 0) {
      const bad = await verify(cand, e);
      if (bad) return result.problems.push(`${e.file}：使用者提供的檔案${bad}`);
      await copyFile(cand, dest);
      return result.fromUser.push(e.file);
    }
  }
  if (e.url && !e.url.includes('drive.google.com') && !e.needsUserFile) {
    try {
      await download(e.url, dest);
      const bad = await verify(dest, e);
      if (bad) {
        await rm(dest, { force: true });
        return result.problems.push(`${e.file}：下載後${bad}（上游可能更新了）`);
      }
      return result.downloaded.push(e.file);
    } catch (err) {
      return result.problems.push(`${e.file}：下載失敗 ${err.message}`);
    }
  }
  result.missing.push(e.file);
}

let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < todo.length) {
      const e = todo[next++];
      await one(e);
      process.stdout.write('.');
    }
  }),
);
console.log(
  `\n已有 ${result.ok.length}、新下載 ${result.downloaded.length}、用使用者提供的 ${result.fromUser.length}`,
);
if (result.missing.length)
  console.log(`\n缺檔（需要使用者放到 .font-cache/user/）：\n  ${result.missing.join('\n  ')}`);
if (result.problems.length) console.log(`\n有問題：\n  ${result.problems.join('\n  ')}`);
process.exit(result.problems.length ? 1 : 0);
