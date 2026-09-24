export type AnimeLibrarySort =
  | "recent_desc"
  | "recent_asc"
  | "updated_desc"
  | "title_asc";

export interface AnimeOrderWork {
  id: string;
  title: string;
  lastLoggedAt: string | null;
  updatedAt: string;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "zh-CN");
}

export function compareAnimeWorks(
  left: AnimeOrderWork,
  right: AnimeOrderWork,
  sort: AnimeLibrarySort,
): number {
  const leftMissing = left.lastLoggedAt === null ? 1 : 0;
  const rightMissing = right.lastLoggedAt === null ? 1 : 0;
  const missingOrder = leftMissing - rightMissing;
  if (missingOrder !== 0) {
    return missingOrder;
  }

  let primaryOrder = 0;
  switch (sort) {
    case "recent_desc":
      primaryOrder = (right.lastLoggedAt ?? "").localeCompare(
        left.lastLoggedAt ?? "",
      );
      break;
    case "recent_asc":
      primaryOrder = (left.lastLoggedAt ?? "").localeCompare(
        right.lastLoggedAt ?? "",
      );
      break;
    case "updated_desc":
      primaryOrder = right.updatedAt.localeCompare(left.updatedAt);
      break;
    case "title_asc":
      primaryOrder = compareText(left.title, right.title);
      break;
  }
  return (
    primaryOrder ||
    compareText(left.title, right.title) ||
    compareText(left.id, right.id)
  );
}

export function sortAnimeWorks<T extends AnimeOrderWork>(
  works: readonly T[],
  sort: AnimeLibrarySort,
): T[] {
  return [...works].sort((left, right) =>
    compareAnimeWorks(left, right, sort),
  );
}

