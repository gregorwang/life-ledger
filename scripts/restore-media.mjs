#!/usr/bin/env node
// Upload every file under <backup>/media back into an R2 bucket, keeping the
// same object keys, so a restored database finds its photos and videos again.
//
//   node scripts/restore-media.mjs <backup folder> <bucket name> [--local]
//
// Uses the wrangler CLI already installed in this repository.

import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const [folder, bucket, ...flags] = process.argv.slice(2);
if (!folder || !bucket) {
  console.error("用法：node scripts/restore-media.mjs <备份文件夹> <R2 桶名> [--local]");
  process.exit(2);
}

const CONTENT_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile() && !entry.name.endsWith(".part")) yield path;
  }
}

const root = resolve(folder, "media");
let uploaded = 0;
for await (const path of walk(root)) {
  const key = relative(root, path).split(sep).join("/");
  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  const args = [
    "wrangler",
    "r2",
    "object",
    "put",
    `${bucket}/${key}`,
    "--file",
    path,
    flags.includes("--local") ? "--local" : "--remote",
    ...(CONTENT_TYPES[extension] ? ["--content-type", CONTENT_TYPES[extension]] : []),
  ];
  const result = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`上传失败：${key}`);
    process.exit(1);
  }
  uploaded += 1;
}
console.log(`已上传 ${uploaded} 个文件到 ${bucket}。`);
