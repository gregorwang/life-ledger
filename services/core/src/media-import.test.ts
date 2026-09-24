import { describe, expect, it } from "vitest";

import { mediaWatchStatusFromLegacyStatus } from "./media-import";

describe("mediaWatchStatusFromLegacyStatus", () => {
  it.each([
    "planned",
    "watching",
    "completed",
    "watched",
    "paused",
    "dropped",
  ] as const)("keeps the valid legacy status %s", (status) => {
    expect(mediaWatchStatusFromLegacyStatus(status)).toBe(status);
  });

  it.each(["finished", "第三季 · 第 4 集", "", null, undefined, 1])(
    "does not manufacture a watch status from %s",
    (status) => {
      expect(mediaWatchStatusFromLegacyStatus(status)).toBeNull();
    },
  );
});
