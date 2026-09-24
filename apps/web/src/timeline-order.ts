export interface TimelineOrderEntry {
  id: string;
  occurredAt: string;
  status: "active" | "deleted";
}

export function compareEntriesByOccurredAtDesc(
  left: TimelineOrderEntry,
  right: TimelineOrderEntry,
): number {
  return (
    right.occurredAt.localeCompare(left.occurredAt) ||
    right.id.localeCompare(left.id)
  );
}

export function activeEntriesByOccurredAtDesc<T extends TimelineOrderEntry>(
  entries: readonly T[],
): T[] {
  return entries
    .filter((entry) => entry.status === "active")
    .sort(compareEntriesByOccurredAtDesc);
}
