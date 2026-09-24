import {
  mediaWatchStatusSchema,
  type MediaWatchStatus,
} from "@life-ledger/contracts";

export function mediaWatchStatusFromLegacyStatus(
  value: unknown,
): MediaWatchStatus | null {
  const parsed = mediaWatchStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
