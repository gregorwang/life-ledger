import {
  uploadMediaImageInputSchema,
  type MediaImageMimeType,
  type MediaImageUploadResult,
  type UploadMediaImageInput,
} from "@life-ledger/contracts";

import {
  MediaImageError,
  assertSafeOriginalFileName,
  buildPublicMediaUrl,
  createMediaObjectKey,
  sha256Hex,
  validateMediaImage,
} from "./media-image";

export interface MediaUploadEnvironment {
  DB?: D1Database;
  MEDIA?: R2Bucket;
  MEDIA_PUBLIC_BASE_URL?: string;
}

interface MediaAssetRow {
  id: string;
  object_key: string;
  public_url: string;
  sha256: string;
  mime_type: MediaImageMimeType;
  size_bytes: number;
  width: number;
  height: number;
  etag: string;
  created_at: string;
}

interface MediaUploadRequestRow extends MediaAssetRow {
  request_hash: string;
}

function createUploadId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function toUploadResult(row: MediaAssetRow): MediaImageUploadResult {
  return {
    objectKey: row.object_key,
    publicUrl: row.public_url,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    sha256: row.sha256,
    etag: row.etag,
    createdAt: row.created_at,
  };
}

async function findUploadRequest(
  database: D1Database,
  userId: string,
  idempotencyKey: string,
): Promise<MediaUploadRequestRow | null> {
  return database
    .prepare(`
      SELECT
        mur.request_hash,
        ma.id,
        ma.object_key,
        ma.public_url,
        ma.sha256,
        ma.mime_type,
        ma.size_bytes,
        ma.width,
        ma.height,
        ma.etag,
        ma.created_at
      FROM media_upload_requests mur
      INNER JOIN media_assets ma ON ma.id = mur.asset_id
      WHERE mur.user_id = ? AND mur.idempotency_key = ?
    `)
    .bind(userId, idempotencyKey)
    .first<MediaUploadRequestRow>();
}

async function findAssetByHash(
  database: D1Database,
  userId: string,
  contentSha256: string,
): Promise<MediaAssetRow | null> {
  return database
    .prepare(`
      SELECT
        id,
        object_key,
        public_url,
        sha256,
        mime_type,
        size_bytes,
        width,
        height,
        etag,
        created_at
      FROM media_assets
      WHERE user_id = ? AND sha256 = ?
    `)
    .bind(userId, contentSha256)
    .first<MediaAssetRow>();
}

async function assertMediaWorkExists(
  database: D1Database,
  userId: string,
  mediaWorkId: string | null,
): Promise<void> {
  if (mediaWorkId === null) {
    return;
  }
  const work = await database
    .prepare("SELECT id FROM media_works WHERE id = ? AND user_id = ?")
    .bind(mediaWorkId, userId)
    .first<{ id: string }>();
  if (!work) {
    throw new MediaImageError(
      "MEDIA_WORK_NOT_FOUND",
      "mediaWorkId 对应的作品不存在。",
      404,
    );
  }
}

function requestFingerprintSource(input: {
  fileName: string;
  mimeType: MediaImageMimeType;
  contentSha256: string;
  purpose: UploadMediaImageInput["purpose"];
  mediaWorkId: string | null;
}): string {
  return JSON.stringify({
    fileName: input.fileName,
    mimeType: input.mimeType,
    contentSha256: input.contentSha256,
    purpose: input.purpose,
    mediaWorkId: input.mediaWorkId,
  });
}

function assertMatchingIdempotentRequest(
  row: MediaUploadRequestRow,
  requestHash: string,
): MediaImageUploadResult {
  if (row.request_hash !== requestHash) {
    throw new MediaImageError(
      "IDEMPOTENCY_CONFLICT",
      "该 idempotencyKey 已用于不同的上传请求。",
      409,
    );
  }
  return toUploadResult(row);
}

export async function uploadMediaImageToR2(
  env: MediaUploadEnvironment,
  input: UploadMediaImageInput,
  userId: string,
): Promise<MediaImageUploadResult> {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    throw new MediaImageError(
      "MEDIA_DATABASE_NOT_CONFIGURED",
      "图片元数据 D1 Binding 未配置。",
      500,
    );
  }
  if (
    !env.MEDIA ||
    typeof env.MEDIA.put !== "function" ||
    typeof env.MEDIA.head !== "function"
  ) {
    throw new MediaImageError(
      "MEDIA_BUCKET_NOT_CONFIGURED",
      "图片 R2 Binding 未配置。",
      500,
    );
  }

  const parsed = uploadMediaImageInputSchema.parse(input);
  const safeFileName = assertSafeOriginalFileName(parsed.fileName);
  const image = validateMediaImage(parsed.base64Data, parsed.mimeType);
  const contentSha256 = await sha256Hex(image.bytes);
  const candidateObjectKey = await createMediaObjectKey(
    parsed.purpose,
    parsed.mediaWorkId,
    contentSha256,
    image.extension,
  );
  const candidatePublicUrl = buildPublicMediaUrl(
    env.MEDIA_PUBLIC_BASE_URL,
    candidateObjectKey,
  );
  const requestHash = await sha256Hex(
    requestFingerprintSource({
      fileName: safeFileName,
      mimeType: image.mimeType,
      contentSha256,
      purpose: parsed.purpose,
      mediaWorkId: parsed.mediaWorkId,
    }),
  );

  const priorRequest = await findUploadRequest(
    env.DB,
    userId,
    parsed.idempotencyKey,
  );
  if (priorRequest) {
    return assertMatchingIdempotentRequest(priorRequest, requestHash);
  }

  await assertMediaWorkExists(env.DB, userId, parsed.mediaWorkId);
  let asset = await findAssetByHash(env.DB, userId, contentSha256);
  const reusedExistingAsset = asset !== null;

  if (!asset) {
    const existingObject = await env.MEDIA.head(candidateObjectKey);
    let etag: string;
    if (existingObject) {
      if (
        existingObject.customMetadata?.sha256 !== contentSha256 ||
        existingObject.httpMetadata?.contentType !== image.mimeType
      ) {
        throw new MediaImageError(
          "MEDIA_OBJECT_CONFLICT",
          "目标 R2 object key 已存在，但内容元数据不匹配。",
          409,
        );
      }
      etag = existingObject.etag;
    } else {
      const uploaded = await env.MEDIA.put(
        candidateObjectKey,
        image.bytes,
        {
          httpMetadata: {
            contentType: image.mimeType,
            cacheControl: "public, max-age=31536000, immutable",
            contentDisposition: "inline",
          },
          customMetadata: {
            sha256: contentSha256,
            width: String(image.width),
            height: String(image.height),
            purpose: parsed.purpose,
            source: "mcp",
          },
        },
      );
      if (!uploaded) {
        throw new MediaImageError(
          "MEDIA_UPLOAD_FAILED",
          "R2 未返回上传结果，未生成公开 URL。",
          502,
        );
      }
      etag = uploaded.etag;
    }

    const createdAt = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO media_assets (
        id,
        user_id,
        object_key,
        public_url,
        sha256,
        mime_type,
        size_bytes,
        width,
        height,
        etag,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, sha256) DO NOTHING
    `)
      .bind(
        createUploadId("asset"),
        userId,
        candidateObjectKey,
        candidatePublicUrl,
        contentSha256,
        image.mimeType,
        image.bytes.byteLength,
        image.width,
        image.height,
        etag,
        createdAt,
      )
      .run();

    asset = await findAssetByHash(env.DB, userId, contentSha256);
    if (!asset) {
      throw new MediaImageError(
        "MEDIA_METADATA_WRITE_FAILED",
        "R2 上传完成，但图片元数据未能持久化；使用同一幂等键重试即可恢复。",
        500,
      );
    }
  }

  const requestCreatedAt = new Date().toISOString();
  const insertRequest = await env.DB.prepare(`
    INSERT INTO media_upload_requests (
      id,
      user_id,
      idempotency_key,
      request_hash,
      asset_id,
      purpose,
      media_work_id,
      source_channel,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'mcp', ?)
    ON CONFLICT(user_id, idempotency_key) DO NOTHING
  `)
    .bind(
      createUploadId("upload"),
      userId,
      parsed.idempotencyKey,
      requestHash,
      asset.id,
      parsed.purpose,
      parsed.mediaWorkId,
      requestCreatedAt,
    )
    .run();

  const storedRequest = await findUploadRequest(
    env.DB,
    userId,
    parsed.idempotencyKey,
  );
  if (!storedRequest) {
    throw new MediaImageError(
      "MEDIA_METADATA_WRITE_FAILED",
      "图片上传幂等记录未能持久化。",
      500,
    );
  }
  const result = assertMatchingIdempotentRequest(storedRequest, requestHash);

  if ((insertRequest.meta.changes ?? 0) > 0) {
    await env.DB.prepare(`
      INSERT INTO audit_events (
        id,
        request_id,
        user_id,
        actor_type,
        actor_id,
        action,
        target_type,
        target_id,
        detail,
        metadata_json,
        created_at
      )
      VALUES (
        ?, ?, ?, 'agent', 'mcp_client', ?, 'media_asset', ?,
        'Validated MCP image upload persisted to R2.', ?, ?
      )
    `)
      .bind(
        createUploadId("audit"),
        createUploadId("req"),
        userId,
        reusedExistingAsset
          ? "media_image.deduplicated"
          : "media_image.uploaded",
        asset.id,
        JSON.stringify({
          objectKey: asset.object_key,
          publicUrl: asset.public_url,
          sha256: asset.sha256,
          mimeType: asset.mime_type,
          sizeBytes: asset.size_bytes,
          width: asset.width,
          height: asset.height,
          purpose: parsed.purpose,
          mediaWorkId: parsed.mediaWorkId,
          idempotencyKey: parsed.idempotencyKey,
          source: "mcp",
        }),
        requestCreatedAt,
      )
      .run();
  }

  return result;
}
