import type { Place } from "@life-ledger/contracts";
import { geoContains } from "d3-geo";
import type { Feature, Geometry } from "geojson";

/** Shape of geo/footprint-map.json (built by scripts/build-footprint-map.mjs). */
export interface FootprintData {
  topology: unknown;
  /** Lower-cased country alias → world feature id (ISO alpha-3). */
  countries: Record<string, string>;
  /** Province alias (浙江 / 浙江省 / zhejiang) → 国家统计局 code (33). */
  provinces: Record<string, string>;
  /** [name, lon, lat, world id, province code or ""], biggest city first. */
  cities: Array<[string, number, number, string, string]>;
  /** Chinese prefecture / county name → province code. */
  divisions: Record<string, string>;
}

export type RegionFeature = Feature<Geometry, { id: string; n: string }>;

export interface PlaceLocation {
  /** World map region (CHN, JPN, HKG…). */
  worldId: string | null;
  /** China map region (33 浙江, 71 台湾, 81 香港…). */
  provinceCode: string | null;
  /** [lon, lat] for a dot: the place's own coordinates, else its city's. */
  point: [number, number] | null;
}

const SAR_WORLD: Record<string, string> = { "81": "HKG", "82": "MAC" };
const CHINA_WORLD = new Set(["CHN", "HKG", "MAC"]);

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/gu, " ");
}

/** 杭州市 → 杭州, 阳朔县 → 阳朔, 阿勒泰地区 → 阿勒泰. */
function stripSuffix(value: string): string {
  const stripped = value.replace(/(市|县|区|地区|盟|自治州|自治县|特别行政区)$/u, "");
  return stripped.length >= 2 ? stripped : value;
}

export function provinceWorldId(code: string): string {
  return SAR_WORLD[code] ?? "CHN";
}

export function createPlaceResolver(
  data: FootprintData,
  worldFeatures: readonly RegionFeature[],
  chinaFeatures: readonly RegionFeature[],
) {
  const cityIndex = new Map<string, FootprintData["cities"][number]>();
  for (const city of data.cities) {
    const key = city[0].toLowerCase();
    if (!cityIndex.has(key)) cityIndex.set(key, city);
  }
  // Longest first, so 内蒙古 wins over a shorter alias that is its prefix.
  const provinceAliases = Object.keys(data.provinces)
    .filter((alias) => alias.length >= 2)
    .sort((left, right) => right.length - left.length);

  const lookupCity = (value: string | null | undefined) => {
    const key = normalize(value);
    if (!key) return null;
    return cityIndex.get(key) ?? cityIndex.get(stripSuffix(key)) ?? null;
  };

  const lookupDivision = (value: string | null | undefined): string | null => {
    const key = normalize(value);
    if (!key) return null;
    return data.divisions[key] ?? data.divisions[stripSuffix(key)] ?? null;
  };

  /** "浙江" / "浙江省杭州市" / "Zhejiang" → 33. */
  const matchProvince = (value: string | null | undefined): string | null => {
    const key = normalize(value);
    if (!key) return null;
    const exact = data.provinces[key];
    if (exact) return exact;
    const prefix = provinceAliases.find((alias) => key.startsWith(alias));
    return prefix ? data.provinces[prefix]! : null;
  };

  const containing = (features: readonly RegionFeature[], point: [number, number]) =>
    features.find((feature) => geoContains(feature, point))?.properties.id ?? null;

  return (place: Place): PlaceLocation => {
    let point: [number, number] | null =
      place.latitude !== null && place.longitude !== null ? [place.longitude, place.latitude] : null;
    let worldId = data.countries[normalize(place.country)] ?? null;
    let provinceCode: string | null = null;

    // A province written in the country box ("浙江") still means China.
    if (!worldId && place.country) {
      provinceCode = matchProvince(place.country) ?? lookupDivision(place.country);
      if (provinceCode) worldId = provinceWorldId(provinceCode);
    }
    // Taiwan and the SARs name a region on the China map directly.
    if (worldId && CHINA_WORLD.has(worldId) && !provinceCode) {
      provinceCode = matchProvince(place.country);
    }

    if (point && (!worldId || CHINA_WORLD.has(worldId)) && !provinceCode) {
      provinceCode = containing(chinaFeatures, point);
      if (provinceCode && !worldId) worldId = provinceWorldId(provinceCode);
    }
    if (point && !worldId) {
      worldId = containing(worldFeatures, point);
    }

    const city = [lookupCity(place.city), lookupCity(place.name)].find(
      (hit) => hit && (!worldId || hit[3] === worldId || (CHINA_WORLD.has(worldId) && CHINA_WORLD.has(hit[3]))),
    );

    if (!provinceCode && (!worldId || CHINA_WORLD.has(worldId))) {
      provinceCode =
        matchProvince(place.city) ??
        lookupDivision(place.city) ??
        (city?.[4] || null) ??
        matchProvince(place.name) ??
        lookupDivision(place.name);
      if (provinceCode && !worldId) worldId = provinceWorldId(provinceCode);
    }
    if (!worldId && city) worldId = city[3];
    if (!provinceCode && worldId === "HKG") provinceCode = "81";
    if (!provinceCode && worldId === "MAC") provinceCode = "82";
    if (!point && city) point = [city[1], city[2]];

    return { worldId, provinceCode, point };
  };
}

export interface FootprintSummary {
  byWorld: Map<string, Place[]>;
  byProvince: Map<string, Place[]>;
  /** Places sharing a spot share one dot. */
  dots: Array<{ point: [number, number]; inChina: boolean; places: Place[] }>;
  unresolved: Place[];
}

export function summarizeFootprints(
  places: readonly Place[],
  resolve: (place: Place) => PlaceLocation,
): FootprintSummary {
  const byWorld = new Map<string, Place[]>();
  const byProvince = new Map<string, Place[]>();
  const dots = new Map<string, FootprintSummary["dots"][number]>();
  const unresolved: Place[] = [];
  const push = (map: Map<string, Place[]>, key: string, place: Place) => {
    const list = map.get(key);
    if (list) list.push(place);
    else map.set(key, [place]);
  };
  for (const place of places) {
    const location = resolve(place);
    if (!location.worldId && !location.provinceCode) {
      unresolved.push(place);
      continue;
    }
    if (location.worldId) push(byWorld, location.worldId, place);
    if (location.provinceCode) push(byProvince, location.provinceCode, place);
    if (location.point) {
      const key = location.point.map((value) => value.toFixed(2)).join(",");
      const dot = dots.get(key);
      if (dot) dot.places.push(place);
      else dots.set(key, { point: location.point, inChina: location.provinceCode !== null, places: [place] });
    }
  }
  return { byWorld, byProvince, dots: [...dots.values()], unresolved };
}

/** 1 place → 1, 2–3 → 2, 4+ → 3; drives the fill strength. */
export function footprintLevel(count: number): 0 | 1 | 2 | 3 {
  return count <= 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : 3;
}
