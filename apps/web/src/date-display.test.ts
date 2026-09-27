import { describe, expect, it } from "vitest";

import { formatCompletedOn, formatOccurredAt } from "./date-display";

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


describe("finish dates", () => {
  it("keeps the year and only the precision that was recorded", () => {
    // 13:00 UTC is 22:00 in Tokyo, still the same local day.
    expect(formatCompletedOn("2026-07-05T13:00:00.000Z", "exact", "Asia/Tokyo")).toBe(
      "2026年7月5日",
    );
    expect(formatCompletedOn("2026-07-05T13:00:00.000Z", "approximate", "Asia/Tokyo")).toBe(
      "约2026年7月5日",
    );
    expect(formatCompletedOn("2026-07-05T13:00:00.000Z", "month", "Asia/Tokyo")).toBe(
      "约2026年7月",
    );
    expect(formatCompletedOn("2026-07-05T13:00:00.000Z", "year", "Asia/Tokyo")).toBe("2026年");
  });
});
