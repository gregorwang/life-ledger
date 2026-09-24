import type { Place } from "@life-ledger/contracts";
import { geoConicEqualArea, geoNaturalEarth1, geoPath, type GeoProjection } from "d3-geo";
import { LoaderCircle, MapPinned, X } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

import {
  createPlaceResolver,
  footprintLevel,
  summarizeFootprints,
  type FootprintData,
  type RegionFeature,
} from "./footprint-geo";
import mapUrl from "./geo/footprint-map.json?url";
import "./footprint-map.css";

export type MapView = "china" | "world";

export interface FootprintFilter {
  view: MapView;
  regionId: string;
  label: string;
  placeIds: ReadonlySet<string>;
}

interface LoadedMap {
  data: FootprintData;
  world: RegionFeature[];
  china: RegionFeature[];
}

const VIEW_KEY = "life-ledger:footprints-view";
const WIDTH = 960;
const LEVEL_LABELS = ["", "1 个地方", "2–3 个", "4 个以上"] as const;

let mapRequest: Promise<LoadedMap> | null = null;

/** Fetched once per page load; the file is a hashed static asset. */
function loadMap(): Promise<LoadedMap> {
  mapRequest ??= fetch(mapUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`map ${response.status}`);
      return response.json() as Promise<FootprintData>;
    })
    .then((data) => {
      const topology = data.topology as Topology<{ world: GeometryCollection; china: GeometryCollection }>;
      const features = (name: "world" | "china") =>
        (feature(topology, topology.objects[name]) as unknown as { features: RegionFeature[] }).features;
      return { data, world: features("world"), china: features("china") };
    })
    .catch((error: unknown) => {
      mapRequest = null;
      throw error;
    });
  return mapRequest;
}

function readView(): MapView | null {
  try {
    const value = window.localStorage.getItem(VIEW_KEY);
    return value === "china" || value === "world" ? value : null;
  } catch {
    return null;
  }
}

function saveView(view: MapView) {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Private mode: the tab just won't be remembered.
  }
}

function fitted(projection: GeoProjection, features: RegionFeature[]) {
  const collection = { type: "FeatureCollection" as const, features };
  projection.fitWidth(WIDTH, collection);
  const path = geoPath(projection);
  const [[, top], [, bottom]] = path.bounds(collection);
  return { path, projection, height: Math.ceil(bottom - Math.min(0, top)) };
}

interface Tooltip {
  x: number;
  y: number;
  name: string;
  places: Place[];
}

export default function FootprintMap({
  places,
  filter,
  onFilter,
}: {
  places: readonly Place[];
  filter: FootprintFilter | null;
  onFilter: (filter: FootprintFilter | null) => void;
}) {
  const [map, setMap] = useState<LoadedMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosenView, setChosenView] = useState<MapView | null>(readView);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void loadMap()
      .then((loaded) => alive && setMap(loaded))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const resolver = useMemo(() => (map ? createPlaceResolver(map.data, map.world, map.china) : null), [map]);
  const summary = useMemo(() => (resolver ? summarizeFootprints(places, resolver) : null), [places, resolver]);
  const geometry = useMemo(
    () =>
      map
        ? {
            china: fitted(geoConicEqualArea().parallels([25, 47]).rotate([-105, 0]), map.china),
            world: fitted(geoNaturalEarth1(), map.world),
          }
        : null,
    [map],
  );

  // Editing or deleting a place can move it out of the selected region.
  useEffect(() => {
    if (!filter || !summary) return;
    const counts = filter.view === "china" ? summary.byProvince : summary.byWorld;
    const ids = (counts.get(filter.regionId) ?? []).map((place) => place.id);
    const unchanged = ids.length === filter.placeIds.size && ids.every((id) => filter.placeIds.has(id));
    if (!unchanged) onFilter(ids.length ? { ...filter, placeIds: new Set(ids) } : null);
  }, [filter, onFilter, summary]);

  const hasChina = (summary?.byProvince.size ?? 0) > 0;
  const view: MapView = chosenView ?? (summary && !hasChina && summary.byWorld.size > 0 ? "world" : "china");

  const switchView = (next: MapView) => {
    setChosenView(next);
    saveView(next);
    setTooltip(null);
    if (filter && filter.view !== next) onFilter(null);
  };

  if (failed) {
    return (
      <section className="fp-map is-message" aria-label="足迹地图">
        地图数据没读出来，刷新一下再试。
      </section>
    );
  }
  if (!map || !summary || !geometry) {
    return (
      <section className="fp-map is-message" aria-label="足迹地图" role="status">
        <LoaderCircle className="sh-spin" aria-hidden="true" size={18} />
        正在展开地图…
      </section>
    );
  }

  const { path, projection, height } = geometry[view];
  const features = view === "china" ? map.china : map.world;
  const counts = view === "china" ? summary.byProvince : summary.byWorld;
  const dots = summary.dots.filter((dot) => (view === "china" ? dot.inChina : true));
  const litCountries = summary.byWorld.size;
  const litProvinces = summary.byProvince.size;

  const select = (region: RegionFeature) => {
    const matched = counts.get(region.properties.id);
    if (!matched?.length) return;
    if (filter?.view === view && filter.regionId === region.properties.id) {
      onFilter(null);
      return;
    }
    onFilter({
      view,
      regionId: region.properties.id,
      label: region.properties.n,
      placeIds: new Set(matched.map((place) => place.id)),
    });
  };

  const showTooltip = (event: PointerEvent<SVGElement>, name: string, list: Place[]) => {
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box || event.pointerType === "touch") return;
    setTooltip({ x: event.clientX - box.left, y: event.clientY - box.top, name, places: list });
  };

  const onRegionKey = (event: KeyboardEvent<SVGPathElement>, region: RegionFeature) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(region);
    }
  };

  return (
    <section className="fp-map" aria-label="足迹地图">
      <header className="fp-head">
        <p className="fp-lit">
          <MapPinned aria-hidden="true" size={16} />
          {view === "china" ? (
            <>
              点亮了 <strong>{litProvinces}</strong> / 34 个省级地区
            </>
          ) : (
            <>
              点亮了 <strong>{litCountries}</strong> 个国家和地区
            </>
          )}
        </p>
        <div className="fp-tabs" role="group" aria-label="地图范围">
          {(
            [
              ["china", "中国"],
              ["world", "世界"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={view === value ? "is-active" : ""}
              aria-pressed={view === value}
              onClick={() => switchView(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="fp-canvas" ref={canvasRef} onPointerLeave={() => setTooltip(null)}>
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          role="img"
          aria-label={
            view === "china"
              ? `中国地图，点亮了 ${litProvinces} 个省级地区`
              : `世界地图，点亮了 ${litCountries} 个国家和地区`
          }
        >
          <g className="fp-regions">
            {features.map((region) => {
              const list = counts.get(region.properties.id) ?? [];
              const level = footprintLevel(list.length);
              const selected = filter?.view === view && filter.regionId === region.properties.id;
              const d = path(region);
              if (!d) return null;
              return (
                <path
                  key={region.properties.id}
                  d={d}
                  className={`fp-region is-lv${level}${selected ? " is-selected" : ""}`}
                  tabIndex={level ? 0 : -1}
                  role={level ? "button" : undefined}
                  aria-label={level ? `${region.properties.n}，${list.length} 个地方` : undefined}
                  aria-pressed={level ? selected : undefined}
                  onClick={() => select(region)}
                  onKeyDown={(event) => onRegionKey(event, region)}
                  onPointerMove={(event) => showTooltip(event, region.properties.n, list)}
                />
              );
            })}
          </g>
          <g className="fp-dots" aria-hidden="true">
            {dots.map((dot) => {
              const xy = projection(dot.point);
              if (!xy) return null;
              return (
                <circle
                  key={dot.point.join(",")}
                  cx={xy[0]}
                  cy={xy[1]}
                  r={dot.places.length > 1 ? 5 : 3.6}
                  onPointerMove={(event) =>
                    showTooltip(event, dot.places[0]!.city ?? dot.places[0]!.name, dot.places)
                  }
                />
              );
            })}
          </g>
        </svg>

        {tooltip ? (
          <div
            className="fp-tooltip"
            style={{ left: tooltip.x, top: tooltip.y }}
            role="presentation"
          >
            <strong>{tooltip.name}</strong>
            {tooltip.places.length ? (
              <span>
                {tooltip.places
                  .slice(0, 3)
                  .map((place) => place.name)
                  .join("、")}
                {tooltip.places.length > 3 ? ` 等 ${tooltip.places.length} 个地方` : ""}
              </span>
            ) : (
              <span className="is-empty">还没去过</span>
            )}
          </div>
        ) : null}
      </div>

      <footer className="fp-foot">
        <ul className="fp-legend" aria-label="图例">
          {([1, 2, 3] as const).map((level) => (
            <li key={level}>
              <span className={`fp-swatch is-lv${level}`} aria-hidden="true" />
              {LEVEL_LABELS[level]}
            </li>
          ))}
        </ul>
        {filter ? (
          <button type="button" className="fp-filter" onClick={() => onFilter(null)}>
            只看 {filter.label} · {filter.placeIds.size} 个地方
            <X aria-hidden="true" size={14} />
          </button>
        ) : places.length ? (
          <span className="fp-hint">点亮的区域可以点，下面只列那里的地方</span>
        ) : null}
      </footer>

      {summary.unresolved.length ? (
        <p className="fp-unresolved">
          还有 {summary.unresolved.length} 个地方没认出在哪（
          {summary.unresolved
            .slice(0, 3)
            .map((place) => place.name)
            .join("、")}
          {summary.unresolved.length > 3 ? " 等" : ""}），补上城市、国家或坐标就会点亮。
        </p>
      ) : null}
    </section>
  );
}
