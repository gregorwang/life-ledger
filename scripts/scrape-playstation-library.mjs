import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputPath = path.join(projectRoot, "data", "playstation-library.json");
const sourceBase = "https://xn--cckl9nsb.com/game/playstation";

function decodeTurboStream(html) {
  const matches = [
    ...html.matchAll(
      /streamController\.enqueue\(("(?:\\.|[^"\\])*")\)/gs,
    ),
  ];
  const serializedArgument = matches.at(-1)?.[1];
  if (!serializedArgument) {
    throw new Error("The Remix turbo-stream payload was not found.");
  }
  const flat = JSON.parse(JSON.parse(serializedArgument));
  const memo = new Map();

  function specialReference(index) {
    if (index === -3) return Number.NaN;
    if (index === -4) return Number.POSITIVE_INFINITY;
    if (index === -6) return Number.NEGATIVE_INFINITY;
    return undefined;
  }

  function hydrate(reference) {
    if (typeof reference !== "number") return reference;
    if (reference < 0) return specialReference(reference);
    if (memo.has(reference)) return memo.get(reference);
    const value = flat[reference];
    if (Array.isArray(value)) {
      const result = [];
      memo.set(reference, result);
      for (const child of value) result.push(hydrate(child));
      return result;
    }
    if (value && typeof value === "object") {
      const result = {};
      memo.set(reference, result);
      for (const [encodedKey, child] of Object.entries(value)) {
        const key = encodedKey.startsWith("_")
          ? String(flat[Number(encodedKey.slice(1))])
          : encodedKey;
        result[key] = hydrate(child);
      }
      return result;
    }
    return value;
  }

  return hydrate(0);
}

async function fetchPage(page) {
  const url = `${sourceBase}?page=${page}`;
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/html",
          "User-Agent": "LifeLedgerPrivateImport/1.0",
        },
      });
      const html = await response.text();
      const root = decodeTurboStream(html);
      const routeData = root.loaderData?.["routes/game.$platform"];
      if (!Array.isArray(routeData?.paginatedGames)) {
        throw new Error(`Page ${page} did not include paginatedGames.`);
      }
      return {
        items: routeData.paginatedGames,
        totalGames: Number(routeData.totalGames),
        totalPages: Number(routeData.totalPages),
      };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 350));
    }
  }
  throw lastError;
}

const pages = [];
for (let page = 1; page <= 4; page += 1) {
  pages.push(await fetchPage(page));
}

const byId = new Map();
for (const page of pages) {
  for (const game of page.items) {
    byId.set(game.id, {
      id: `game_ps_${String(game.id).padStart(3, "0")}`,
      sourceId: game.id,
      platform: "PlayStation",
      title: game.name,
      playTime: game.playTime,
      progress: game.progress,
      trophies: game.trophies,
      achievementsCurrent: game.achievementsCurrent,
      achievementsTotal: game.achievementsTotal,
      rating: game.rating,
      review: game.review,
      tags: game.tags,
      sourceCoverUrl: game.cover,
      coverUrl: `/media/covers/game/game-${String(game.id).padStart(3, "0")}-v1.webp`,
      sourceUrl: sourceBase,
    });
  }
}

const items = [...byId.values()].sort(
  (left, right) =>
    right.progress - left.progress ||
    right.rating - left.rating ||
    left.sourceId - right.sourceId,
);

if (items.length !== 25) {
  throw new Error(`Expected 25 PlayStation games, received ${items.length}.`);
}

await fs.mkdir(path.dirname(outputPath), {recursive: true});
await fs.writeFile(
  outputPath,
  `${JSON.stringify(
    {
      schemaVersion: "1.0",
      source: sourceBase,
      importedAt: new Date().toISOString(),
      itemCount: items.length,
      items,
    },
    null,
    2,
  )}\n`,
);

console.log(`Saved ${items.length} PlayStation games to ${outputPath}`);
