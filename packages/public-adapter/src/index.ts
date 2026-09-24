import {
  publicAnimeResponseSchema,
  publicTimelineResponseSchema,
  type PublicAnimeResponse,
  type PublicTimelineResponse,
} from "@life-ledger/contracts";
import type { ZodType } from "zod";

export interface PublicProjectionResult<T> {
  data: T;
  source: "remote" | "static-fallback";
  degraded: boolean;
}

export interface PublicProjectionOptions<T> {
  endpoint: string;
  fallback: T;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

async function loadProjection<T>(
  schema: ZodType<T>,
  options: PublicProjectionOptions<T>,
): Promise<PublicProjectionResult<T>> {
  const fallback = schema.parse(options.fallback);
  try {
    const response = await (options.fetcher ?? fetch)(options.endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (!response.ok) {
      return { data: fallback, source: "static-fallback", degraded: true };
    }
    const payload: unknown = await response.json();
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return { data: fallback, source: "static-fallback", degraded: true };
    }
    return { data: parsed.data, source: "remote", degraded: false };
  } catch {
    return { data: fallback, source: "static-fallback", degraded: true };
  }
}

export function loadPublicAnime(
  options: PublicProjectionOptions<PublicAnimeResponse>,
): Promise<PublicProjectionResult<PublicAnimeResponse>> {
  return loadProjection(publicAnimeResponseSchema, options);
}

export function loadPublicTimeline(
  options: PublicProjectionOptions<PublicTimelineResponse>,
): Promise<PublicProjectionResult<PublicTimelineResponse>> {
  return loadProjection(publicTimelineResponseSchema, options);
}
