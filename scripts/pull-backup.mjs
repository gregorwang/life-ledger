#!/usr/bin/env node
// Pull a complete, readable copy of Life Ledger onto this computer.
//
//   LIFE_LEDGER_URL=https://… LIFE_LEDGER_PASSWORD=… node scripts/pull-backup.mjs <folder>
//
// The folder has the same layout as the zip from the web page. Markdown and
// data files are refreshed every run; photos and videos are only downloaded
// when new, and are never deleted locally. Each run also keeps a dated copy of
// data/ledger.json and data/restore.sql under _snapshots/.
// Zero dependencies; Node 18+.

import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, writeFile, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const baseUrl = (process.env.LIFE_LEDGER_URL ?? "").replace(/\/+$/, "");
const password = process.env.LIFE_LEDGER_PASSWORD ?? "";
const target = resolve(process.argv[2] ?? "LifeLedgerBackup");
const CONCURRENCY = 4;

if (!baseUrl || !password) {
  console.error(
    "需要环境变量 LIFE_LEDGER_URL 和 LIFE_LEDGER_PASSWORD。\n" +
      "例：LIFE_LEDGER_URL=https://example.workers.dev LIFE_LEDGER_PASSWORD=*** node scripts/pull-backup.mjs ~/LifeLedgerBackup",
  );
  process.exit(2);
}

/** Resolve a manifest path inside the target folder, refusing anything that escapes it. */
function inside(relative) {
  const full = resolve(target, relative);
  if (full !== target && !full.startsWith(target + sep)) {
    throw new Error(`拒绝写到备份目录之外：${relative}`);
  }
  return full;
}

async function login() {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password, next: "/" }),
  });
  const cookies = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  const session = cookies
    .map((cookie) => cookie.split(";", 1)[0])
    .find((cookie) => cookie.includes("life_ledger_session="));
  if (response.status !== 303 || !session) {
    throw new Error(`登录失败（HTTP ${response.status}），检查网址和密码。`);
  }
  return session;
}

async function exists(path, size) {
  try {
    const info = await stat(path);
    return info.isFile() && info.size === size;
  } catch {
    return false;
  }
}

async function download(cookie, media) {
  const path = inside(media.path);
  if (await exists(path, media.size)) return "skipped";
  const url = `${baseUrl}/api/v1/archive/media/${media.key.split("/").map(encodeURIComponent).join("/")}`;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Cookie: cookie } });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      await mkdir(dirname(path), { recursive: true });
      const partial = `${path}.part`;
      await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
      if (!(await exists(partial, media.size))) throw new Error("大小不符");
      await rename(partial, path);
      return "downloaded";
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${media.path}: ${lastError instanceof Error ? lastError.message : lastError}`);
}

async function main() {
  const started = Date.now();
  const cookie = await login();
  const response = await fetch(`${baseUrl}/api/v1/archive/manifest`, { headers: { Cookie: cookie } });
  if (!response.ok) throw new Error(`读取备份清单失败（HTTP ${response.status}）`);
  const manifest = await response.json();
  if (manifest.format !== "life-ledger-archive") throw new Error("清单格式不对，确认网址指向 Life Ledger。");

  await mkdir(target, { recursive: true });
  // Rebuild the readable text each run so edits and deletions are reflected.
  for (const folder of ["日常", "data", "README.md", "书架.md", "音乐.md", "游戏库.md", "动漫与影视.md", "足迹.md"]) {
    await rm(inside(folder), { recursive: true, force: true });
  }
  for (const file of manifest.files) {
    const path = inside(file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.content, "utf8");
  }

  const stamp = manifest.generatedAt.replace(/[:T]/g, "-").slice(0, 16);
  const snapshot = inside(join("_snapshots", stamp));
  await mkdir(snapshot, { recursive: true });
  for (const file of manifest.files.filter((item) => item.path.startsWith("data/"))) {
    await writeFile(join(snapshot, file.path.slice("data/".length)), file.content, "utf8");
  }

  const queue = [...manifest.media];
  const counts = { downloaded: 0, skipped: 0 };
  const failures = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let media = queue.shift(); media; media = queue.shift()) {
        try {
          counts[await download(cookie, media)] += 1;
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error));
        }
      }
    }),
  );

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `完成：${manifest.files.length} 个文本文件，照片/视频新下载 ${counts.downloaded} 个，已存在 ${counts.skipped} 个，用时 ${seconds}s。\n备份位置：${target}`,
  );
  if (failures.length) {
    console.error(`有 ${failures.length} 个文件没下载成功，下次运行会重试：\n${failures.join("\n")}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
