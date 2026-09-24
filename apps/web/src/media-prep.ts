import type { MediaUploadMetadata } from "./api";

export const MAX_IMAGE_EDGE = 2560;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 95 * 1024 * 1024;

const DIRECT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export interface PreparedMedia {
  kind: "image" | "video";
  blob: Blob;
  mimeType: string;
  metadata: MediaUploadMetadata;
  previewUrl: string;
}

export class MediaPrepError extends Error {}

function videoMimeType(file: File): string | null {
  if (VIDEO_TYPES.has(file.type)) {
    return file.type;
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "mov") return "video/quicktime";
  if (extension === "mp4" || extension === "m4v") return "video/mp4";
  if (extension === "webm") return "video/webm";
  return null;
}

async function readVideoMetadata(url: string): Promise<MediaUploadMetadata> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const done = (metadata: MediaUploadMetadata) => {
      video.removeAttribute("src");
      video.load();
      resolve(metadata);
    };
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () =>
      done({
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        durationMs: Number.isFinite(video.duration)
          ? Math.round(video.duration * 1000)
          : null,
      });
    // Codecs the browser cannot decode (e.g. HEVC on some desktops) still
    // upload; they simply play on devices that support them.
    video.onerror = () => done({ width: null, height: null, durationMs: null });
    video.src = url;
  });
}

async function decodeImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new MediaPrepError(
      file.type === "image/heic" || file.type === "image/heif"
        ? "这个浏览器无法读取 HEIC 照片。可在 iPhone「设置 › 相机 › 格式」里选「兼容性最佳」，或用 Safari 上传。"
        : `无法读取图片「${file.name}」。`,
    );
  }
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new MediaPrepError("图片压缩失败。"))),
      type,
      quality,
    );
  });
}

/**
 * Photos are re-encoded like a chat app would: long edge ≤ 2560px, JPEG, EXIF
 * orientation applied (which also strips location metadata). GIFs and small
 * images that need no resizing are uploaded untouched so animation survives.
 */
async function prepareImage(file: File): Promise<PreparedMedia> {
  if (file.type === "image/gif") {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new MediaPrepError("GIF 不能超过 20 MB。");
    }
    const bitmap = await decodeImage(file);
    const metadata = { width: bitmap.width, height: bitmap.height, durationMs: null };
    bitmap.close();
    return {
      kind: "image",
      blob: file,
      mimeType: file.type,
      metadata,
      previewUrl: URL.createObjectURL(file),
    };
  }

  const bitmap = await decodeImage(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const keepOriginal =
    scale === 1 &&
    DIRECT_IMAGE_TYPES.has(file.type) &&
    file.type !== "image/jpeg" &&
    file.size <= 4 * 1024 * 1024;
  if (keepOriginal) {
    bitmap.close();
    return {
      kind: "image",
      blob: file,
      mimeType: file.type,
      metadata: { width, height, durationMs: null },
      previewUrl: URL.createObjectURL(file),
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new MediaPrepError("浏览器无法处理这张图片。");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.86);
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new MediaPrepError("图片压缩后仍超过 20 MB。");
  }
  return {
    kind: "image",
    blob,
    mimeType: "image/jpeg",
    metadata: { width, height, durationMs: null },
    previewUrl: URL.createObjectURL(blob),
  };
}

async function prepareVideo(file: File, mimeType: string): Promise<PreparedMedia> {
  if (file.size > MAX_VIDEO_BYTES) {
    throw new MediaPrepError(
      `视频「${file.name}」超过 95 MB。可以先在手机上剪短或用“较小”画质导出。`,
    );
  }
  const previewUrl = URL.createObjectURL(file);
  return {
    kind: "video",
    blob: file,
    mimeType,
    metadata: await readVideoMetadata(previewUrl),
    previewUrl,
  };
}

export async function prepareMediaFile(file: File): Promise<PreparedMedia> {
  const video = file.type.startsWith("video/") || videoMimeType(file) !== null;
  if (video) {
    const mimeType = videoMimeType(file);
    if (!mimeType) {
      throw new MediaPrepError(`不支持的视频格式「${file.name}」，请使用 MP4、MOV 或 WebM。`);
    }
    return prepareVideo(file, mimeType);
  }
  if (file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name)) {
    return prepareImage(file);
  }
  throw new MediaPrepError(`「${file.name}」不是图片或视频。`);
}
