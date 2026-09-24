import type { Place } from "@life-ledger/contracts";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { describe, expect, it } from "vitest";

import {
  createPlaceResolver,
  footprintLevel,
  summarizeFootprints,
  type FootprintData,
  type RegionFeature,
} from "./footprint-geo";
import mapData from "./geo/footprint-map.json";

const data = mapData as unknown as FootprintData;
const topology = data.topology as Topology<{ world: GeometryCollection; china: GeometryCollection }>;
const features = (name: "world" | "china") =>
  (feature(topology, topology.objects[name]) as unknown as { features: RegionFeature[] }).features;
const resolve = createPlaceResolver(data, features("world"), features("china"));

function place(fields: Partial<Place>): Place {
  return {
    id: `place_${Math.random().toString(36).slice(2)}`,
    name: "某个地方",
    city: null,
    country: null,
    category: "sight",
    trip: null,
    visitedOn: "2026-09-01",
    leftOn: null,
    rating: null,
    note: "",
    coverUrl: null,
    latitude: null,
    longitude: null,
    tags: [],
    status: "active",
    versionNo: 1,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    deletedAt: null,
    ...fields,
  };
}

describe("footprint place resolver", () => {
  it("lights a province from a Chinese city, with or without the country", () => {
    expect(resolve(place({ country: "中国", city: "杭州" }))).toMatchObject({ worldId: "CHN", provinceCode: "33" });
    const bare = resolve(place({ city: "杭州市" }));
    expect(bare).toMatchObject({ worldId: "CHN", provinceCode: "33" });
    expect(bare.point![0]).toBeCloseTo(120.2, 0);
  });

  it("uses counties and provinces written in any box", () => {
    expect(resolve(place({ country: "中国", city: "阳朔" }))).toMatchObject({ provinceCode: "45", point: null });
    expect(resolve(place({ country: "浙江", name: "西湖" }))).toMatchObject({ worldId: "CHN", provinceCode: "33" });
    expect(resolve(place({ city: "广东省深圳市" }))).toMatchObject({ provinceCode: "44" });
  });

  it("puts Taiwan, Hong Kong and Macao on the China map", () => {
    expect(resolve(place({ country: "台湾", city: "台北" }))).toMatchObject({ worldId: "CHN", provinceCode: "71" });
    expect(resolve(place({ country: "香港" }))).toMatchObject({ worldId: "HKG", provinceCode: "81" });
    expect(resolve(place({ country: "中国澳门" }))).toMatchObject({ worldId: "MAC", provinceCode: "82" });
  });

  it("resolves other countries by Chinese or English name", () => {
    const kyoto = resolve(place({ country: "日本", city: "京都" }));
    expect(kyoto).toMatchObject({ worldId: "JPN", provinceCode: null });
    expect(kyoto.point![1]).toBeCloseTo(35, 0);
    expect(resolve(place({ country: "France", city: "Paris" }))).toMatchObject({ worldId: "FRA" });
    expect(resolve(place({ city: "首尔" }))).toMatchObject({ worldId: "KOR" });
  });

  it("prefers coordinates and ignores a same-named city in another country", () => {
    expect(resolve(place({ latitude: 30.25, longitude: 120.15 }))).toMatchObject({ worldId: "CHN", provinceCode: "33" });
    expect(resolve(place({ latitude: 48.86, longitude: 2.35 }))).toMatchObject({ worldId: "FRA" });
    expect(resolve(place({ country: "美国", city: "大理" }))).toMatchObject({ worldId: "USA", point: null });
  });

  it("summarises regions, shared dots and places it cannot place", () => {
    const summary = summarizeFootprints(
      [
        place({ city: "杭州", name: "西湖" }),
        place({ city: "杭州", name: "灵隐寺" }),
        place({ city: "京都" }),
        place({ name: "家门口的咖啡店" }),
      ],
      resolve,
    );
    expect(summary.byProvince.get("33")).toHaveLength(2);
    expect(summary.byWorld.get("JPN")).toHaveLength(1);
    expect(summary.dots.find((dot) => dot.inChina)?.places).toHaveLength(2);
    expect(summary.unresolved.map((item) => item.name)).toEqual(["家门口的咖啡店"]);
  });

  it("maps counts to fill levels", () => {
    expect([0, 1, 2, 3, 4, 9].map(footprintLevel)).toEqual([0, 1, 2, 2, 3, 3]);
  });
});
