import type { DatePrecision } from "./models";

function dateParts(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone,
  }).formatToParts(new Date(value));
  const number = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: number("year"),
    month: number("month"),
    day: number("day"),
  };
}

export function formatOccurredAt(
  value: string,
  precision: DatePrecision,
  timeZone: string,
): string {
  const { year, month, day } = dateParts(value, timeZone);
  if (precision === "month") {
    return `约${year}年${month}月`;
  }
  if (precision === "year") {
    return `${year}年，具体日期不确定`;
  }
  if (precision === "approximate") {
    return `约${year}年${month}月${day}日`;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(value));
}

