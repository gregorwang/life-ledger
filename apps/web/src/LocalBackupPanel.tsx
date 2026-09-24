import { Check, Download, HardDrive, LoaderCircle, Terminal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ZipWriter, type ZipSink } from "./zip-writer";
import "./local-backup.css";

interface ManifestFile {
  path: string;
  content: string;
}

interface ManifestMedia {
  path: string;
  key: string;
  size: number;
}

interface Manifest {
  generatedAt: string;
  files: ManifestFile[];
  media: ManifestMedia[];
  totalBytes: number;
}

interface Progress {
  done: number;
  total: number;
  current: string;
}

type Outcome =
  | { kind: "idle" }
  | { kind: "running"; progress: Progress }
  | { kind: "done"; files: number; bytes: number; failed: string[] }
  | { kind: "error"; message: string };

const LAST_BACKUP_KEY = "life-ledger:last-local-backup";

function readLastBackup(): string | null {
  try {
    return window.localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}

interface SaveFileHandle {
  createWritable(): Promise<{
    write(data: Uint8Array): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}

type SavePicker = (options: {
  suggestedName: string;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<SaveFileHandle>;

/** Streams to disk where the browser allows it, otherwise to a Blob. */
async function openSink(fileName: string): Promise<{
  sink: ZipSink;
  finish: () => Promise<void>;
  abort: () => Promise<void>;
}> {
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    const handle = await picker({
      suggestedName: fileName,
      types: [{ description: "ZIP 备份", accept: { "application/zip": [".zip"] } }],
    });
    const writable = await handle.createWritable();
    return {
      sink: { write: (chunk) => writable.write(chunk) },
      finish: () => writable.close(),
      abort: () => writable.abort(),
    };
  }
  const parts: BlobPart[] = [];
  return {
    sink: {
      write: async (chunk) => {
        parts.push(chunk.slice().buffer);
      },
    },
    finish: async () => {
      const url = URL.createObjectURL(new Blob(parts, { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    abort: async () => {
      parts.length = 0;
    },
  };
}

async function fetchMedia(key: string, signal: AbortSignal): Promise<Uint8Array> {
  const path = key.split("/").map(encodeURIComponent).join("/");
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`/api/v1/archive/media/${path}`, { signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    } catch (error: unknown) {
      if (signal.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

export function LocalBackupPanel() {
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [lastBackup, setLastBackup] = useState<string | null>(readLastBackup);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const start = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const controller = new AbortController();
    controllerRef.current = controller;
    let target: Awaited<ReturnType<typeof openSink>>;
    try {
      // The save dialog must open straight from the click.
      target = await openSink(`life-ledger-备份-${today}.zip`);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setOutcome({ kind: "error", message: error instanceof Error ? error.message : "无法创建文件。" });
      return;
    }
    const progress: Progress = { done: 0, total: 0, current: "读取清单…" };
    setOutcome({ kind: "running", progress: { ...progress } });
    try {
      const response = await fetch("/api/v1/archive/manifest", { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`读取备份清单失败（${response.status}）`);
      }
      const manifest = (await response.json()) as Manifest;
      progress.total = manifest.totalBytes;
      const zip = new ZipWriter(target.sink);
      const stamp = new Date(manifest.generatedAt);
      const encoder = new TextEncoder();
      for (const file of manifest.files) {
        const bytes = encoder.encode(file.content);
        progress.current = file.path;
        await zip.addFile(file.path, bytes, stamp);
        progress.done += bytes.length;
        setOutcome({ kind: "running", progress: { ...progress } });
      }
      const failed: string[] = [];
      for (const media of manifest.media) {
        progress.current = media.path;
        setOutcome({ kind: "running", progress: { ...progress } });
        try {
          await zip.addFile(media.path, await fetchMedia(media.key, controller.signal), stamp);
        } catch (error: unknown) {
          if (controller.signal.aborted) throw error;
          failed.push(media.path);
        }
        progress.done += media.size;
      }
      if (failed.length) {
        await zip.addFile(
          "备份时未能下载的文件.txt",
          encoder.encode(`以下文件下载失败，请稍后重新备份：\n${failed.join("\n")}\n`),
          stamp,
        );
      }
      await zip.finish();
      await target.finish();
      const finishedAt = new Date().toISOString();
      try {
        window.localStorage.setItem(LAST_BACKUP_KEY, finishedAt);
      } catch {
        // Private mode: the backup still succeeded.
      }
      setLastBackup(finishedAt);
      setOutcome({
        kind: "done",
        files: manifest.files.length + manifest.media.length,
        bytes: zip.bytesWritten,
        failed,
      });
    } catch (error: unknown) {
      await target.abort().catch(() => undefined);
      if (controller.signal.aborted) {
        setOutcome({ kind: "idle" });
        return;
      }
      setOutcome({ kind: "error", message: error instanceof Error ? error.message : "备份中断。" });
    } finally {
      controllerRef.current = null;
    }
  };

  const running = outcome.kind === "running";
  const stale = lastBackup === null || daysSince(lastBackup) > 30;
  const percent =
    running && outcome.progress.total > 0
      ? Math.min(100, Math.round((outcome.progress.done / outcome.progress.total) * 100))
      : 0;

  return (
    <section className="local-backup" aria-labelledby="local-backup-title">
      <div className="local-backup-main">
        <span className="local-backup-icon" aria-hidden="true">
          <HardDrive size={24} />
        </span>
        <div className="local-backup-copy">
          <p className="eyebrow">YOUR DATA, ON YOUR DISK</p>
          <h2 id="local-backup-title">把全部数据下载到自己的硬盘</h2>
          <p>
            一个 zip：每条动态、书架、音乐、游戏、足迹的可读 Markdown，所有照片和视频原文件，
            数据库完整数据和恢复脚本。不依赖 Cloudflare，也不依赖这个网站就能打开。
          </p>
          <p className={stale ? "local-backup-last is-stale" : "local-backup-last"}>
            {lastBackup
              ? `这台设备上次下载：${new Date(lastBackup).toLocaleString("zh-CN")}（${daysSince(lastBackup)} 天前）${stale ? "，该再备份一次了" : ""}`
              : "这台设备还没有下载过本地备份。"}
          </p>
        </div>
        {running ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() => controllerRef.current?.abort()}
          >
            <X aria-hidden="true" size={16} />
            取消
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={() => void start()}>
            <Download aria-hidden="true" size={17} />
            下载完整备份
          </button>
        )}
      </div>

      {running ? (
        <div className="local-backup-progress" role="status" aria-live="polite">
          <div className="local-backup-bar">
            <i style={{ width: `${percent}%` }} />
          </div>
          <span>
            <LoaderCircle className="local-backup-spin" aria-hidden="true" size={14} />
            {percent}% · {formatBytes(outcome.progress.done)} / {formatBytes(outcome.progress.total)} ·{" "}
            {outcome.progress.current}
          </span>
        </div>
      ) : null}
      {outcome.kind === "done" ? (
        <p className={outcome.failed.length ? "local-backup-result is-warning" : "local-backup-result"} role="status">
          <Check aria-hidden="true" size={15} />
          已保存 {outcome.files} 个文件，共 {formatBytes(outcome.bytes)}。
          {outcome.failed.length
            ? ` 有 ${outcome.failed.length} 个文件没下载成功，清单在 zip 里的「备份时未能下载的文件.txt」。`
            : " 建议再复制一份到移动硬盘或 NAS。"}
        </p>
      ) : null}
      {outcome.kind === "error" ? (
        <p className="local-backup-result is-error" role="alert">
          备份没有完成：{outcome.message}
        </p>
      ) : null}

      <details className="local-backup-auto">
        <summary>
          <Terminal aria-hidden="true" size={15} />
          每周自动备份到电脑（增量，只下载新文件）
        </summary>
        <p>在仓库里运行一次试试，之后交给系统的定时任务：</p>
        <pre>
          <code>{`LIFE_LEDGER_URL=https://你的网址 LIFE_LEDGER_PASSWORD=登录密码 \\
  node scripts/pull-backup.mjs ~/LifeLedgerBackup`}</code>
        </pre>
        <p>
          Windows 用「任务计划程序」每周运行一次，macOS / Linux 用 cron，具体写法见仓库 README 的「本地备份」一节。
          照片和视频只会下载新增的，每次还会保留一份带日期的数据快照。
        </p>
      </details>
    </section>
  );
}
