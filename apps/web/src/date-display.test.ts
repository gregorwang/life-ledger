import { describe, expect, it } from "vitest";

import { formatOccurredAt } from "./date-display";

describe("occurred date precision", () => {
  it("does not present month and year anchors as exact dates", () => {
    expect(
      formatOccurredAt(
        "2026-02-15T03:00:00.000Z",
        "month",
        "Asia/Tokyo",
      ),
    ).toBe("约2026年2月");
    expect(
      formatOccurredAt(
        "2024-07-01T03:00:00.000Z",
        "year",
        "Asia/Tokyo",
      ),
    ).toBe("2024年，具体日期不确定");
  });
});

