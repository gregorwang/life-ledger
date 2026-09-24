import type { Place, PlaceCategory } from "@life-ledger/contracts";
import {
  Camera,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";

import { createPlace, deletePlace, loadPlaces, updatePlace } from "./api";
import type { ToastMessage } from "./models";
import { RelatedEntries } from "./RelatedEntries";
import { ShelfDialog, splitTags, uploadCoverImage } from "./ShelfPage";
import type { NewPost } from "./TimelineFeed";
import "./shelf.css";
import "./places.css";

type PushToast = (tone: ToastMessage["tone"], title: string, detail: string) => void;

const CATEGORIES: ReadonlyArray<readonly [PlaceCategory, string]> = [
  ["city", "城市"],
  ["sight", "景点"],
  ["food", "吃喝"],
  ["stay", "住宿"],
  ["nature", "自然"],
  ["event", "活动"],
  ["other", "其他"],
];

function categoryLabel(category: PlaceCategory): string {
  return CATEGORIES.find(([value]) => value === category)?.[1] ?? "其他";
}

function dateRange(place: Place): string {
  const start = place.visitedOn.replaceAll("-", ".");
  if (!place.leftOn || place.leftOn === place.visitedOn) return start;
  const end =
    place.leftOn.slice(0, 4) === place.visitedOn.slice(0, 4)
      ? place.leftOn.slice(5).replace("-", ".")
      : place.leftOn.replaceAll("-", ".");
  return `${start} – ${end}`;
}

interface TripGroup {
  key: string;
  trip: string | null;
  places: Place[];
}

/** Years newest first; consecutive places of the same trip share a block. */
function groupPlaces(places: Place[]): Array<{ year: string; groups: TripGroup[] }> {
  const years: Array<{ year: string; groups: TripGroup[] }> = [];
  for (const place of places) {
    const year = place.visitedOn.slice(0, 4);
    let bucket = years.at(-1);
    if (!bucket || bucket.year !== year) {
      bucket = { year, groups: [] };
      years.push(bucket);
    }
    const last = bucket.groups.at(-1);
    if (last && place.trip && last.trip === place.trip) {
      last.places.push(place);
    } else {
      bucket.groups.push({ key: place.id, trip: place.trip, places: [place] });
    }
  }
  return years;
}

export function PlacesPage({
  focusId,
  onOpenEntry,
  onCreatePost,
  pushToast,
}: {
  focusId: string | null;
  onOpenEntry: (entryId: string) => void;
  onCreatePost: (post: NewPost) => Promise<boolean>;
  pushToast: PushToast;
}) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Place | "new" | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const focusedRef = useRef<string | null>(null);

  useEffect(() => {
    if (focusId && focusedRef.current !== focusId && places.some((place) => place.id === focusId)) {
      focusedRef.current = focusId;
      setExpanded(focusId);
      requestAnimationFrame(() =>
        document.getElementById(`place-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
    }
  }, [focusId, places]);
  const searchId = useId();

  useEffect(() => {
    const controller = new AbortController();
    void loadPlaces(controller.signal)
      .then((items) => {
        setPlaces(items);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState("error");
      });
    return () => controller.abort();
  }, []);

  const sorted = useMemo(
    () =>
      [...places].sort(
        (left, right) =>
          right.visitedOn.localeCompare(left.visitedOn) ||
          right.createdAt.localeCompare(left.createdAt),
      ),
    [places],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? sorted.filter((place) =>
          [place.name, place.city, place.country, place.trip, ...place.tags]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(needle)),
        )
      : sorted;
  }, [query, sorted]);
  const cities = new Set(places.map((place) => place.city).filter(Boolean)).size;
  const countries = new Set(places.map((place) => place.country).filter(Boolean)).size;
  const trips = new Set(places.map((place) => place.trip).filter(Boolean));

  const replace = (next: Place) =>
    setPlaces((current) =>
      current.some((place) => place.id === next.id)
        ? current.map((place) => (place.id === next.id ? next : place))
        : [next, ...current],
    );

  const remove = async (place: Place) => {
    if (!window.confirm(`把「${place.name}」移到回收站？之后可以通过 MCP 的 restore_place 恢复。`)) return;
    try {
      await deletePlace(place);
      setPlaces((current) => current.filter((item) => item.id !== place.id));
    } catch (error: unknown) {
      pushToast("danger", "删除失败", error instanceof Error ? error.message : "请稍后再试。");
    }
  };

  return (
    <div className="page sh-page pl-page">
      <header className="sh-head">
        <div className="sh-title">
          <p className="sh-eyebrow">
            <MapPin aria-hidden="true" size={14} />
            FOOTPRINTS
          </p>
          <h1>足迹</h1>
          <p className="sh-lede">去过的地方不用多，每一个都值得记住当时的样子。</p>
        </div>
        <div className="sh-head-side">
          <dl className="sh-stats">
            <div>
              <dt>个地方</dt>
              <dd>{places.length}</dd>
            </div>
            <div>
              <dt>座城市</dt>
              <dd>{cities}</dd>
            </div>
            <div>
              <dt>国家/地区</dt>
              <dd>{countries}</dd>
            </div>
            <div>
              <dt>次旅行</dt>
              <dd>{trips.size}</dd>
            </div>
          </dl>
          <button type="button" className="sh-primary" onClick={() => setEditing("new")}>
            <Plus aria-hidden="true" size={17} />
            记一个地方
          </button>
        </div>
      </header>

      {places.length > 4 ? (
        <div className="sh-toolbar">
          <span />
          <label className="sh-search" htmlFor={searchId}>
            <Search aria-hidden="true" size={15} />
            <span className="sr-only">搜索</span>
            <input
              id={searchId}
              type="search"
              value={query}
              placeholder="搜索地名、城市或旅行"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      ) : null}

      {state === "loading" ? (
        <div className="sh-state" role="status">
          <LoaderCircle className="sh-spin" aria-hidden="true" />
          正在读取…
        </div>
      ) : state === "error" ? (
        <div className="sh-state is-error" role="alert">
          暂时读不出来，请稍后刷新重试。
        </div>
      ) : visible.length === 0 ? (
        <div className="sh-state">
          {places.length
            ? "没有符合条件的地方。"
            : "还没有足迹。去过的城市、吃过的店、住过的旅馆，都可以记下来。"}
          {places.length ? null : (
            <button type="button" className="sh-primary" onClick={() => setEditing("new")}>
              <Plus aria-hidden="true" size={17} />
              记第一个地方
            </button>
          )}
        </div>
      ) : (
        <div className="pl-timeline">
          {groupPlaces(visible).map(({ year, groups }) => (
            <section key={year} className="pl-year" aria-label={`${year} 年`}>
              <h2>{year}</h2>
              {groups.map((group) => (
                <div key={group.key} className={group.trip ? "pl-trip" : "pl-trip is-single"}>
                  {group.trip ? (
                    <h3>
                      {group.trip}
                      <span>{group.places.length} 个地方</span>
                    </h3>
                  ) : null}
                  <ul>
                    {group.places.map((place) => (
                      <li
                        key={place.id}
                        id={`place-${place.id}`}
                        className={place.id === focusId ? "pl-card is-focused" : "pl-card"}
                      >
                        {place.coverUrl ? (
                          <img className="pl-cover" src={place.coverUrl} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <span className="pl-pin" aria-hidden="true">
                            <MapPin size={18} />
                          </span>
                        )}
                        <div className="pl-body">
                          <div className="pl-title">
                            <strong>{place.name}</strong>
                            {place.rating !== null ? (
                              <span className="sh-rating">
                                <Star aria-hidden="true" size={12} />
                                {place.rating.toFixed(1)}
                              </span>
                            ) : null}
                          </div>
                          <p className="pl-meta">
                            <time dateTime={place.visitedOn}>{dateRange(place)}</time>
                            {place.city || place.country ? (
                              <span>{[place.city, place.country].filter(Boolean).join("，")}</span>
                            ) : null}
                            <span className="pl-chip">{categoryLabel(place.category)}</span>
                          </p>
                          {place.note ? <p className="pl-note">{place.note}</p> : null}
                          {place.tags.length ? (
                            <p className="pl-tags">{place.tags.map((tag) => `#${tag}`).join(" ")}</p>
                          ) : null}
                          <button
                            type="button"
                            className="pl-related-toggle"
                            aria-expanded={expanded === place.id}
                            onClick={() => setExpanded((current) => (current === place.id ? null : place.id))}
                          >
                            {expanded === place.id ? "收起相关动态" : "相关动态"}
                          </button>
                          {expanded === place.id ? (
                            <RelatedEntries kind="place" id={place.id} onOpenEntry={onOpenEntry} />
                          ) : null}
                        </div>
                        <div className="pl-actions">
                          <button type="button" aria-label={`编辑「${place.name}」`} onClick={() => setEditing(place)}>
                            <Pencil aria-hidden="true" size={15} />
                          </button>
                          <button type="button" aria-label={`删除「${place.name}」`} onClick={() => void remove(place)}>
                            <Trash2 aria-hidden="true" size={15} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      {editing ? (
        <PlaceEditor
          place={editing === "new" ? null : editing}
          trips={[...trips] as string[]}
          onClose={() => setEditing(null)}
          onSaved={async (saved, share) => {
            replace(saved);
            setEditing(null);
            pushToast("success", "已记下", `「${saved.name}」放进了足迹。`);
            if (share) {
              const where = [saved.city, saved.country].filter(Boolean).join("，");
              await onCreatePost({
                type: "thought",
                bodyRaw: `去了${saved.name}${where ? `（${where}）` : ""}${saved.rating !== null ? ` ★${saved.rating.toFixed(1)}` : ""}${saved.note ? `\n${saved.note}` : ""}`,
                mediaIds: [],
                tags: ["足迹"],
                links: [{ kind: "place", id: saved.id }],
              });
            }
          }}
          pushToast={pushToast}
        />
      ) : null}
    </div>
  );
}

function PlaceEditor({
  place,
  trips,
  onClose,
  onSaved,
  pushToast,
}: {
  place: Place | null;
  trips: string[];
  onClose: () => void;
  onSaved: (place: Place, share: boolean) => Promise<void>;
  pushToast: PushToast;
}) {
  const [name, setName] = useState(place?.name ?? "");
  const [city, setCity] = useState(place?.city ?? "");
  const [country, setCountry] = useState(place?.country ?? "");
  const [category, setCategory] = useState<PlaceCategory>(place?.category ?? "sight");
  const [trip, setTrip] = useState(place?.trip ?? "");
  const [visitedOn, setVisitedOn] = useState(place?.visitedOn ?? new Date().toISOString().slice(0, 10));
  const [leftOn, setLeftOn] = useState(place?.leftOn ?? "");
  const [rated, setRated] = useState(place ? place.rating !== null : false);
  const [rating, setRating] = useState(place?.rating ?? 8);
  const [note, setNote] = useState(place?.note ?? "");
  const [tags, setTags] = useState(place?.tags.join(" ") ?? "");
  const [coverUrl, setCoverUrl] = useState(place?.coverUrl ?? "");
  const [latitude, setLatitude] = useState(place?.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(place?.longitude?.toString() ?? "");
  const [share, setShare] = useState(place === null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tripListId = useId();
  const ids = {
    name: useId(),
    city: useId(),
    country: useId(),
    category: useId(),
    trip: useId(),
    visited: useId(),
    left: useId(),
    rating: useId(),
    note: useId(),
    tags: useId(),
    lat: useId(),
    lng: useId(),
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !visitedOn || saving || uploading) return;
    const lat = latitude.trim() ? Number(latitude) : null;
    const lng = longitude.trim() ? Number(longitude) : null;
    if ((lat === null) !== (lng === null) || Number.isNaN(lat) || Number.isNaN(lng)) {
      pushToast("info", "坐标不完整", "纬度和经度要一起填，或者都留空。");
      return;
    }
    const fields = {
      name: name.trim(),
      city: city.trim() || null,
      country: country.trim() || null,
      category,
      trip: trip.trim() || null,
      visitedOn,
      leftOn: leftOn || null,
      rating: rated ? Math.round(rating * 10) / 10 : null,
      note: note.trim(),
      tags: splitTags(tags),
      coverUrl: coverUrl.trim() || null,
      latitude: lat,
      longitude: lng,
    };
    setSaving(true);
    try {
      await onSaved(place ? await updatePlace(place, fields) : await createPlace(fields), share);
    } catch (error: unknown) {
      pushToast("danger", "没有保存", error instanceof Error ? error.message : "请检查填写内容。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ShelfDialog label={place ? `编辑「${place.name}」` : "记一个地方"} className="sh-editor is-places" onClose={onClose}>
      <form onSubmit={submit}>
        <header className="sh-editor-header">
          <button type="button" className="sh-text-button" onClick={onClose}>
            取消
          </button>
          <strong>{place ? "编辑足迹" : "记一个地方"}</strong>
          <button type="submit" className="sh-primary is-small" disabled={!name.trim() || saving || uploading}>
            {saving ? "保存中…" : "保存"}
          </button>
        </header>
        <div className="sh-editor-body">
          <div className="sh-editor-cover">
            <span className="sh-cover is-music">
              {coverUrl ? (
                <img src={coverUrl} alt="" />
              ) : (
                <span className="sh-cover-fallback is-empty">
                  <Camera aria-hidden="true" size={22} />
                </span>
              )}
            </span>
            <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <LoaderCircle className="sh-spin" aria-hidden="true" size={14} /> : <Camera aria-hidden="true" size={14} />}
              {uploading ? "上传中…" : coverUrl ? "换照片" : "加一张照片"}
            </button>
            {coverUrl ? (
              <button type="button" onClick={() => setCoverUrl("")}>
                去掉照片
              </button>
            ) : null}
            <input
              ref={fileRef}
              className="sr-only"
              type="file"
              accept="image/*,.heic,.heif"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setUploading(true);
                void uploadCoverImage(file)
                  .then(setCoverUrl)
                  .catch((error: unknown) =>
                    pushToast("danger", "照片没有上传", error instanceof Error ? error.message : "请稍后再试。"),
                  )
                  .finally(() => setUploading(false));
              }}
            />
          </div>

          <div className="sh-fields">
            <label htmlFor={ids.name}>地方 *</label>
            <input
              id={ids.name}
              value={name}
              maxLength={200}
              required
              autoFocus
              placeholder="例如：伏见稻荷大社、楼下那家拉面店"
              onChange={(event) => setName(event.target.value)}
            />
            <div className="sh-field-row">
              <div>
                <label htmlFor={ids.city}>城市</label>
                <input id={ids.city} value={city} maxLength={100} onChange={(event) => setCity(event.target.value)} />
              </div>
              <div>
                <label htmlFor={ids.country}>国家 / 地区</label>
                <input id={ids.country} value={country} maxLength={100} onChange={(event) => setCountry(event.target.value)} />
              </div>
            </div>
            <div className="sh-field-row">
              <div>
                <label htmlFor={ids.category}>类型</label>
                <select
                  id={ids.category}
                  value={category}
                  onChange={(event) => setCategory(event.target.value as PlaceCategory)}
                >
                  {CATEGORIES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={ids.trip}>属于哪次旅行</label>
                <input
                  id={ids.trip}
                  value={trip}
                  maxLength={120}
                  list={tripListId}
                  placeholder="可不填"
                  onChange={(event) => setTrip(event.target.value)}
                />
                <datalist id={tripListId}>
                  {trips.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="sh-field-row">
              <div>
                <label htmlFor={ids.visited}>到达 *</label>
                <input id={ids.visited} type="date" required value={visitedOn} onChange={(event) => setVisitedOn(event.target.value)} />
              </div>
              <div>
                <label htmlFor={ids.left}>离开</label>
                <input id={ids.left} type="date" value={leftOn} min={visitedOn || undefined} onChange={(event) => setLeftOn(event.target.value)} />
              </div>
            </div>
            <div className="sh-rating-field">
              <label htmlFor={ids.rating}>
                评分 {rated ? <strong>{rating.toFixed(1)}</strong> : <span>不评分</span>}
              </label>
              <label className="sh-check">
                <input type="checkbox" checked={rated} onChange={(event) => setRated(event.target.checked)} />
                打分
              </label>
            </div>
            {rated ? (
              <input
                id={ids.rating}
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={rating}
                onChange={(event) => setRating(Number(event.target.value))}
              />
            ) : null}
            <label htmlFor={ids.note}>当时的感受</label>
            <textarea
              id={ids.note}
              rows={4}
              value={note}
              placeholder="看到了什么、吃了什么、和谁一起…"
              onChange={(event) => setNote(event.target.value)}
            />
            <label htmlFor={ids.tags}>标签</label>
            <input id={ids.tags} value={tags} placeholder="用空格分开" onChange={(event) => setTags(event.target.value)} />
            <details className="sh-more">
              <summary>坐标（可选，以后画地图用）</summary>
              <div className="sh-field-row">
                <div>
                  <label htmlFor={ids.lat}>纬度</label>
                  <input id={ids.lat} inputMode="decimal" value={latitude} placeholder="34.9671" onChange={(event) => setLatitude(event.target.value)} />
                </div>
                <div>
                  <label htmlFor={ids.lng}>经度</label>
                  <input id={ids.lng} inputMode="decimal" value={longitude} placeholder="135.7727" onChange={(event) => setLongitude(event.target.value)} />
                </div>
              </div>
            </details>
            {place === null ? (
              <label className="sh-check sh-share">
                <input type="checkbox" checked={share} onChange={(event) => setShare(event.target.checked)} />
                同时发一条到「日常」（仅自己可见）
              </label>
            ) : null}
          </div>
        </div>
      </form>
    </ShelfDialog>
  );
}
