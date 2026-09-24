import type {
  ShelfExcerpt,
  ShelfFormat,
  ShelfItem,
  ShelfKind,
  ShelfStatus,
} from "@life-ledger/contracts";
import {
  BookOpen,
  Camera,
  ExternalLink,
  LoaderCircle,
  Music2,
  Pencil,
  Plus,
  Quote,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  createShelfItem,
  deleteShelfItem,
  loadShelf,
  updateShelfItem,
  uploadEntryMedia,
} from "./api";
import { prepareMediaFile } from "./media-prep";
import { RelatedEntries } from "./RelatedEntries";
import { Select } from "./Select";
import type { ToastMessage } from "./models";
import type { NewPost } from "./TimelineFeed";
import "./shelf.css";

type PushToast = (tone: ToastMessage["tone"], title: string, detail: string) => void;

interface KindCopy {
  title: string;
  eyebrow: string;
  lede: string;
  icon: typeof BookOpen;
  creator: string;
  add: string;
  status: Record<ShelfStatus, string>;
  formats: ReadonlyArray<readonly [ShelfFormat, string]>;
  excerpt: string;
  excerptPlaceholder: string;
  locationPlaceholder: string;
  empty: string;
  feedTag: string;
}

const COPY: Record<ShelfKind, KindCopy> = {
  book: {
    title: "书架",
    eyebrow: "READING SHELF",
    lede: "读过的、正在读的、想读的书，和当时划下的句子。",
    icon: BookOpen,
    creator: "作者",
    add: "添加一本书",
    status: { in_progress: "在读", done: "读完", planned: "想读", dropped: "弃读" },
    formats: [
      ["paper", "纸质书"],
      ["ebook", "电子书"],
      ["audiobook", "有声书"],
    ],
    excerpt: "摘抄",
    excerptPlaceholder: "划下来的那句话…",
    locationPlaceholder: "页码 / 章节",
    empty: "书架还是空的。添加第一本书，或者让 Agent 用 save_shelf_item 帮你录入。",
    feedTag: "读书",
  },
  music: {
    title: "音乐",
    eyebrow: "LISTENING LOG",
    lede: "反复听的专辑、单曲循环的歌，和戳中你的那句歌词。",
    icon: Music2,
    creator: "歌手 / 乐队",
    add: "添加音乐",
    status: { in_progress: "在循环", done: "听过", planned: "想听", dropped: "不听了" },
    formats: [
      ["album", "专辑"],
      ["track", "单曲"],
      ["playlist", "歌单"],
    ],
    excerpt: "歌词",
    excerptPlaceholder: "戳中你的那句歌词…",
    locationPlaceholder: "哪首歌 / 哪一段",
    empty: "还没有音乐记录。添加一张专辑或一首歌，或者让 Agent 帮你录入。",
    feedTag: "音乐",
  },
};

const STATUS_ORDER: readonly ShelfStatus[] = ["in_progress", "done", "planned", "dropped"];

type SortKey = "recent" | "rating" | "title";

const SORT_OPTIONS: readonly (readonly [SortKey, string])[] = [
  ["recent", "最近"],
  ["rating", "评分最高"],
  ["title", "按名称"],
];

function itemDate(item: ShelfItem): string {
  return item.finishedOn ?? item.startedOn ?? item.createdAt.slice(0, 10);
}

function hueOf(text: string): number {
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.codePointAt(0)!) % 360;
  }
  return hash;
}

function formatLabel(kind: ShelfKind, format: ShelfFormat | null): string | null {
  return COPY[kind].formats.find(([value]) => value === format)?.[1] ?? null;
}

function ShelfCover({ item, large = false }: { item: ShelfItem; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (item.coverUrl && !failed) {
    return (
      <img
        src={item.coverUrl}
        alt=""
        loading={large ? "eager" : "lazy"}
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }
  const hue = hueOf(item.title);
  return (
    <span
      className="sh-cover-fallback"
      style={{
        background: `linear-gradient(160deg, hsl(${hue} 38% 36%), hsl(${(hue + 30) % 360} 45% 20%))`,
      }}
      aria-hidden="true"
    >
      <strong>{item.title}</strong>
      {item.creator ? <small>{item.creator}</small> : null}
    </span>
  );
}

function Rating({ value, large = false }: { value: number | null; large?: boolean }) {
  if (value === null) {
    return null;
  }
  return (
    <span className={large ? "sh-rating is-large" : "sh-rating"} aria-label={`评分 ${value.toFixed(1)}`}>
      <Star aria-hidden="true" size={large ? 15 : 12} />
      {value.toFixed(1)}
      {large ? <small>/ 10</small> : null}
    </span>
  );
}

/** Uploads a photo through the private media path and returns its URL. */
export async function uploadCoverImage(file: File): Promise<string> {
  const prepared = await prepareMediaFile(file);
  URL.revokeObjectURL(prepared.previewUrl);
  if (prepared.kind !== "image") {
    throw new Error("封面只支持图片。");
  }
  const media = await uploadEntryMedia(
    prepared.blob,
    prepared.mimeType,
    prepared.metadata,
    () => undefined,
  ).promise;
  return media.url;
}

export interface ShelfPageProps {
  kind: ShelfKind;
  focusId: string | null;
  onOpenEntry: (entryId: string) => void;
  onCreatePost: (post: NewPost) => Promise<boolean>;
  pushToast: PushToast;
}

export function ShelfPage({ kind, focusId, onOpenEntry, onCreatePost, pushToast }: ShelfPageProps) {
  const copy = COPY[kind];
  const Icon = copy.icon;
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [filter, setFilter] = useState<ShelfStatus | "all">("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ShelfItem | "new" | null>(null);
  const searchId = useId();

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    void loadShelf(kind, controller.signal)
      .then((result) => {
        setItems(result);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadState("error");
      });
    return () => controller.abort();
  }, [kind]);

  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (focusId && focusedRef.current !== focusId && items.some((item) => item.id === focusId)) {
      focusedRef.current = focusId;
      setOpenId(focusId);
    }
  }, [focusId, items]);

  const counts = useMemo(() => {
    const result: Record<ShelfStatus | "all", number> = {
      all: items.length,
      in_progress: 0,
      done: 0,
      planned: 0,
      dropped: 0,
    };
    for (const item of items) {
      result[item.shelfStatus] += 1;
    }
    return result;
  }, [items]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter((item) => filter === "all" || item.shelfStatus === filter)
      .filter(
        (item) =>
          !needle ||
          item.title.toLowerCase().includes(needle) ||
          (item.creator ?? "").toLowerCase().includes(needle) ||
          item.tags.some((tag) => tag.toLowerCase().includes(needle)),
      )
      .sort((left, right) => {
        if (sort === "rating") {
          return (right.rating ?? -1) - (left.rating ?? -1) || itemDate(right).localeCompare(itemDate(left));
        }
        if (sort === "title") {
          return left.title.localeCompare(right.title, "zh-CN");
        }
        return itemDate(right).localeCompare(itemDate(left));
      });
  }, [filter, items, query, sort]);

  const thisYear = String(new Date().getFullYear());
  const doneThisYear = items.filter(
    (item) => item.shelfStatus === "done" && item.finishedOn?.startsWith(thisYear),
  ).length;
  const excerptCount = items.reduce((total, item) => total + item.excerpts.length, 0);
  const openItem = openId ? items.find((item) => item.id === openId) ?? null : null;

  const replace = (next: ShelfItem) =>
    setItems((current) =>
      current.some((item) => item.id === next.id)
        ? current.map((item) => (item.id === next.id ? next : item))
        : [next, ...current],
    );

  const remove = async (item: ShelfItem) => {
    if (!window.confirm(`把《${item.title}》移到回收站？之后可以通过 MCP 的 restore_shelf_item 恢复。`)) {
      return;
    }
    try {
      await deleteShelfItem(item);
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setOpenId(null);
      pushToast("info", "已移到回收站", `《${item.title}》不再显示在${copy.title}里。`);
    } catch (error: unknown) {
      pushToast("danger", "删除失败", error instanceof Error ? error.message : "请稍后再试。");
    }
  };

  return (
    <div className={`page sh-page is-${kind}`}>
      <header className="sh-head">
        <div className="sh-title">
          <p className="sh-eyebrow">
            <Icon aria-hidden="true" size={14} />
            {copy.eyebrow}
          </p>
          <h1>{copy.title}</h1>
          <p className="sh-lede">{copy.lede}</p>
        </div>
        <div className="sh-head-side">
          <dl className="sh-stats">
            <div>
              <dt>{copy.status.done}</dt>
              <dd>{counts.done}</dd>
            </div>
            <div>
              <dt>{copy.status.in_progress}</dt>
              <dd>{counts.in_progress}</dd>
            </div>
            <div>
              <dt>今年{copy.status.done}</dt>
              <dd>{doneThisYear}</dd>
            </div>
            <div>
              <dt>{copy.excerpt}</dt>
              <dd>{excerptCount}</dd>
            </div>
          </dl>
          <button type="button" className="sh-primary" onClick={() => setEditing("new")}>
            <Plus aria-hidden="true" size={17} />
            {copy.add}
          </button>
        </div>
      </header>

      <div className="sh-toolbar">
        <div className="sh-filter" role="group" aria-label="按状态筛选">
          {(["all", ...STATUS_ORDER] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "is-active" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? "全部" : copy.status[value]}
              <span>{counts[value]}</span>
            </button>
          ))}
        </div>
        <div className="sh-tools">
          <label className="sh-search" htmlFor={searchId}>
            <Search aria-hidden="true" size={15} />
            <span className="sr-only">搜索</span>
            <input
              id={searchId}
              type="search"
              value={query}
              placeholder={`搜索名字、${copy.creator}或标签`}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <Select
            className="sh-sort"
            label="排序"
            hideLabel
            variant="soft"
            shape="pill"
            value={sort}
            options={SORT_OPTIONS}
            onChange={(value) => setSort(value as SortKey)}
          />
        </div>
      </div>

      {loadState === "loading" ? (
        <div className="sh-state" role="status">
          <LoaderCircle className="sh-spin" aria-hidden="true" />
          正在读取…
        </div>
      ) : loadState === "error" ? (
        <div className="sh-state is-error" role="alert">
          暂时读不出来，请稍后刷新重试。
        </div>
      ) : visible.length === 0 ? (
        <div className="sh-state">
          {items.length ? "没有符合条件的条目。" : copy.empty}
          {items.length ? null : (
            <button type="button" className="sh-primary" onClick={() => setEditing("new")}>
              <Plus aria-hidden="true" size={17} />
              {copy.add}
            </button>
          )}
        </div>
      ) : (
        <ul className="sh-grid">
          {visible.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="sh-card"
                aria-haspopup="dialog"
                onClick={() => setOpenId(item.id)}
              >
                <span className="sh-cover">
                  <ShelfCover item={item} />
                  {item.shelfStatus !== "done" ? (
                    <span className={`sh-status is-${item.shelfStatus}`}>
                      {copy.status[item.shelfStatus]}
                      {item.kind === "book" &&
                      item.shelfStatus === "in_progress" &&
                      item.progress !== null
                        ? ` ${item.progress}%`
                        : ""}
                    </span>
                  ) : null}
                </span>
                <span className="sh-card-title">{item.title}</span>
                <span className="sh-card-meta">
                  <span className="sh-card-creator">{item.creator ?? " "}</span>
                  <Rating value={item.rating} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openItem ? (
        <ShelfDetail
          item={openItem}
          copy={copy}
          onClose={() => setOpenId(null)}
          onEdit={() => setEditing(openItem)}
          onDelete={() => void remove(openItem)}
          onUpdated={replace}
          onOpenEntry={onOpenEntry}
          pushToast={pushToast}
        />
      ) : null}

      {editing ? (
        <ShelfEditor
          kind={kind}
          copy={copy}
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (saved, shareToFeed) => {
            replace(saved);
            setEditing(null);
            pushToast("success", "已保存", `《${saved.title}》已放进${copy.title}。`);
            if (shareToFeed) {
              await onCreatePost({
                type: "thought",
                bodyRaw: feedText(saved, copy),
                mediaIds: [],
                tags: [copy.feedTag],
                links: [{ kind: "shelf", id: saved.id }],
              });
            }
          }}
          pushToast={pushToast}
        />
      ) : null}
    </div>
  );
}

function feedText(item: ShelfItem, copy: KindCopy): string {
  const name = `《${item.title}》${item.creator ? ` — ${item.creator}` : ""}`;
  const verb =
    item.kind === "book"
      ? { done: "读完了", in_progress: "开始读", planned: "想读", dropped: "放下了" }[item.shelfStatus]
      : { done: "听了", in_progress: "最近在循环", planned: "想听", dropped: "不再听" }[item.shelfStatus];
  const rating = item.rating !== null ? ` ★${item.rating.toFixed(1)}` : "";
  const review = item.review ? `\n${item.review}` : "";
  return `${verb}${name}${rating}${review}`.slice(0, 50_000) || copy.title;
}

export function ShelfDialog({
  label,
  className,
  onClose,
  children,
}: {
  label: string;
  className: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div className="sh-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`sh-dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}

function ShelfDetail({
  item,
  copy,
  onClose,
  onEdit,
  onDelete,
  onUpdated,
  onOpenEntry,
  pushToast,
}: {
  item: ShelfItem;
  copy: KindCopy;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpdated: (item: ShelfItem) => void;
  onOpenEntry: (entryId: string) => void;
  pushToast: PushToast;
}) {
  const [excerpt, setExcerpt] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const format = formatLabel(item.kind, item.format);
  const dates = [
    item.startedOn ? `${item.startedOn} 开始` : null,
    item.finishedOn ? `${item.finishedOn} ${copy.status.done}` : null,
  ].filter(Boolean);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const addExcerpt = async (event: FormEvent) => {
    event.preventDefault();
    if (!excerpt.trim() || saving) return;
    setSaving(true);
    try {
      const next: ShelfExcerpt = {
        text: excerpt.trim(),
        location: location.trim() || null,
        note: null,
      };
      onUpdated(await updateShelfItem(item, { excerpts: [...item.excerpts, next] }));
      setExcerpt("");
      setLocation("");
    } catch (error: unknown) {
      pushToast("danger", `${copy.excerpt}没有保存`, error instanceof Error ? error.message : "请稍后再试。");
    } finally {
      setSaving(false);
    }
  };

  const removeExcerpt = async (index: number) => {
    try {
      onUpdated(
        await updateShelfItem(item, {
          excerpts: item.excerpts.filter((_, position) => position !== index),
        }),
      );
    } catch (error: unknown) {
      pushToast("danger", "删除失败", error instanceof Error ? error.message : "请稍后再试。");
    }
  };

  return (
    <ShelfDialog label={item.title} className={`sh-detail is-${item.kind}`} onClose={onClose}>
      <button ref={closeRef} type="button" className="sh-close" aria-label="关闭" onClick={onClose}>
        <X aria-hidden="true" size={18} />
      </button>
      <div className="sh-detail-top">
        <span className="sh-cover is-large">
          <ShelfCover item={item} large />
        </span>
        <div className="sh-detail-info">
          <p className="sh-eyebrow">
            {copy.status[item.shelfStatus]}
            {format ? ` · ${format}` : ""}
          </p>
          <h2>{item.title}</h2>
          {item.creator ? <p className="sh-detail-creator">{item.creator}</p> : null}
          <Rating value={item.rating} large />
          {item.shelfStatus === "in_progress" && item.progress !== null ? (
            <span className="sh-progress">
              <i style={{ width: `${item.progress}%` }} />
              <small>{item.progress}%</small>
            </span>
          ) : null}
          {dates.length ? <p className="sh-detail-dates">{dates.join(" · ")}</p> : null}
          <div className="sh-detail-actions">
            <button type="button" onClick={onEdit}>
              <Pencil aria-hidden="true" size={14} />
              编辑
            </button>
            <button type="button" className="is-danger" onClick={onDelete}>
              <Trash2 aria-hidden="true" size={14} />
              删除
            </button>
          </div>
        </div>
      </div>

      {item.review ? <p className="sh-review">{item.review}</p> : null}

      <section className="sh-excerpts" aria-label={copy.excerpt}>
        <h3>
          <Quote aria-hidden="true" size={15} />
          {copy.excerpt}
          <span>{item.excerpts.length || ""}</span>
        </h3>
        {item.excerpts.length ? (
          <ol>
            {item.excerpts.map((entry, index) => (
              <li key={`${index}-${entry.text.slice(0, 12)}`}>
                <blockquote>{entry.text}</blockquote>
                {entry.location || entry.note ? (
                  <p>
                    {entry.location ? <span>{entry.location}</span> : null}
                    {entry.note ? <span>{entry.note}</span> : null}
                  </p>
                ) : null}
                <button
                  type="button"
                  aria-label={`删除这条${copy.excerpt}`}
                  onClick={() => {
                    if (window.confirm(`删除这条${copy.excerpt}？`)) void removeExcerpt(index);
                  }}
                >
                  <X aria-hidden="true" size={13} />
                </button>
              </li>
            ))}
          </ol>
        ) : null}
        <form className="sh-excerpt-form" onSubmit={addExcerpt}>
          <textarea
            rows={2}
            value={excerpt}
            placeholder={copy.excerptPlaceholder}
            aria-label={`新${copy.excerpt}`}
            onChange={(event) => setExcerpt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                void addExcerpt(event);
              }
            }}
          />
          <div>
            <input
              value={location}
              placeholder={copy.locationPlaceholder}
              aria-label="位置"
              maxLength={80}
              onChange={(event) => setLocation(event.target.value)}
            />
            <button type="submit" className="sh-primary is-small" disabled={!excerpt.trim() || saving}>
              {saving ? "保存中…" : `记下${copy.excerpt}`}
            </button>
          </div>
        </form>
      </section>

      <RelatedEntries kind="shelf" id={item.id} onOpenEntry={onOpenEntry} />

      {item.tags.length ? (
        <div className="sh-tags">
          {item.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      ) : null}
      {item.sourceUrl ? (
        <a className="sh-source" href={item.sourceUrl} target="_blank" rel="noreferrer">
          <ExternalLink aria-hidden="true" size={13} />
          打开链接
        </a>
      ) : null}
    </ShelfDialog>
  );
}

export function splitTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,，、#]+/u)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ].slice(0, 30);
}

function ShelfEditor({
  kind,
  copy,
  item,
  onClose,
  onSaved,
  pushToast,
}: {
  kind: ShelfKind;
  copy: KindCopy;
  item: ShelfItem | null;
  onClose: () => void;
  onSaved: (item: ShelfItem, shareToFeed: boolean) => Promise<void>;
  pushToast: PushToast;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [creator, setCreator] = useState(item?.creator ?? "");
  const [format, setFormat] = useState<ShelfFormat | "">(item?.format ?? "");
  const [status, setStatus] = useState<ShelfStatus>(item?.shelfStatus ?? "done");
  const [rated, setRated] = useState(item ? item.rating !== null : true);
  const [rating, setRating] = useState(item?.rating ?? 8);
  const [progress, setProgress] = useState(item?.progress ?? 0);
  const [startedOn, setStartedOn] = useState(item?.startedOn ?? "");
  const [finishedOn, setFinishedOn] = useState(
    item?.finishedOn ?? (item ? "" : new Date().toISOString().slice(0, 10)),
  );
  const [tags, setTags] = useState(item?.tags.join(" ") ?? "");
  const [review, setReview] = useState(item?.review ?? "");
  const [coverUrl, setCoverUrl] = useState(item?.coverUrl ?? "");
  const [sourceUrl, setSourceUrl] = useState(item?.sourceUrl ?? "");
  const [share, setShare] = useState(item === null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = {
    title: useId(),
    creator: useId(),
    format: useId(),
    rating: useId(),
    progress: useId(),
    started: useId(),
    finished: useId(),
    tags: useId(),
    review: useId(),
    cover: useId(),
    source: useId(),
  };

  const uploadCover = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      setCoverUrl(await uploadCoverImage(file));
    } catch (error: unknown) {
      pushToast("danger", "封面没有上传", error instanceof Error ? error.message : "请稍后再试。");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || saving || uploading) return;
    const fields = {
      title: title.trim(),
      creator: creator.trim() || null,
      format: format || null,
      shelfStatus: status,
      rating: rated && status !== "planned" ? Math.round(rating * 10) / 10 : null,
      progress: status === "in_progress" && kind === "book" ? progress : null,
      startedOn: startedOn || null,
      finishedOn: status === "done" || status === "dropped" ? finishedOn || null : null,
      tags: splitTags(tags),
      review: review.trim(),
      coverUrl: coverUrl.trim() || null,
      sourceUrl: sourceUrl.trim() || null,
    };
    setSaving(true);
    try {
      const saved = item
        ? await updateShelfItem(item, fields)
        : await createShelfItem({ kind, ...fields });
      await onSaved(saved, share);
    } catch (error: unknown) {
      pushToast("danger", "没有保存", error instanceof Error ? error.message : "请检查填写内容。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ShelfDialog label={item ? `编辑《${item.title}》` : copy.add} className="sh-editor" onClose={onClose}>
      <form onSubmit={submit}>
        <header className="sh-editor-header">
          <button type="button" className="sh-text-button" onClick={onClose}>
            取消
          </button>
          <strong>{item ? "编辑" : copy.add}</strong>
          <button type="submit" className="sh-primary is-small" disabled={!title.trim() || saving || uploading}>
            {saving ? "保存中…" : "保存"}
          </button>
        </header>

        <div className="sh-editor-body">
          <div className="sh-editor-cover">
            <span className={`sh-cover is-${kind}`}>
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
              {uploading ? "上传中…" : coverUrl ? "换封面" : "上传封面"}
            </button>
            {coverUrl ? (
              <button type="button" onClick={() => setCoverUrl("")}>
                去掉封面
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
                void uploadCover(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>

          <div className="sh-fields">
            <label htmlFor={ids.title}>名字 *</label>
            <input
              id={ids.title}
              value={title}
              maxLength={300}
              required
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
            />

            <div className="sh-field-row">
              <div>
                <label htmlFor={ids.creator}>{copy.creator}</label>
                <input
                  id={ids.creator}
                  value={creator}
                  maxLength={300}
                  onChange={(event) => setCreator(event.target.value)}
                />
              </div>
              <Select
                className="sh-field-select"
                label="形式"
                variant="soft"
                value={format}
                options={[["", "不填"], ...copy.formats]}
                onChange={(value) => setFormat(value as ShelfFormat | "")}
              />
            </div>

            <span className="sh-label">状态</span>
            <div className="sh-segment" role="group" aria-label="状态">
              {STATUS_ORDER.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={status === value ? "is-active" : ""}
                  aria-pressed={status === value}
                  onClick={() => setStatus(value)}
                >
                  {copy.status[value]}
                </button>
              ))}
            </div>

            {status === "in_progress" && kind === "book" ? (
              <>
                <label htmlFor={ids.progress}>读到 {progress}%</label>
                <input
                  id={ids.progress}
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={progress}
                  onChange={(event) => setProgress(Number(event.target.value))}
                />
              </>
            ) : null}

            {status === "planned" ? null : (
              <>
                <div className="sh-rating-field">
                  <label htmlFor={ids.rating}>
                    评分 {rated ? <strong>{rating.toFixed(1)}</strong> : <span>不评分</span>}
                  </label>
                  <label className="sh-check">
                    <input type="checkbox" checked={!rated} onChange={(event) => setRated(!event.target.checked)} />
                    不评分
                  </label>
                </div>
                <input
                  id={ids.rating}
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={rating}
                  disabled={!rated}
                  onChange={(event) => setRating(Number(event.target.value))}
                />
              </>
            )}

            <div className="sh-field-row">
              <div>
                <label htmlFor={ids.started}>开始于</label>
                <input
                  id={ids.started}
                  type="date"
                  value={startedOn}
                  onChange={(event) => setStartedOn(event.target.value)}
                />
              </div>
              {status === "done" || status === "dropped" ? (
                <div>
                  <label htmlFor={ids.finished}>{copy.status[status]}于</label>
                  <input
                    id={ids.finished}
                    type="date"
                    value={finishedOn}
                    min={startedOn || undefined}
                    onChange={(event) => setFinishedOn(event.target.value)}
                  />
                </div>
              ) : null}
            </div>

            <label htmlFor={ids.review}>感受</label>
            <textarea
              id={ids.review}
              rows={4}
              value={review}
              placeholder={kind === "book" ? "读完是什么感觉？" : "这张专辑/这首歌让你想到什么？"}
              onChange={(event) => setReview(event.target.value)}
            />

            <label htmlFor={ids.tags}>标签</label>
            <input
              id={ids.tags}
              value={tags}
              placeholder="用空格分开，例如：科幻 重读"
              onChange={(event) => setTags(event.target.value)}
            />

            <details className="sh-more">
              <summary>封面地址和链接</summary>
              <label htmlFor={ids.cover}>封面图片地址（只显示本站上传的图片）</label>
              <input
                id={ids.cover}
                value={coverUrl}
                placeholder="https://…"
                onChange={(event) => setCoverUrl(event.target.value)}
              />
              <label htmlFor={ids.source}>{kind === "book" ? "豆瓣 / 购买链接" : "网易云 / 其他平台链接"}</label>
              <input
                id={ids.source}
                value={sourceUrl}
                placeholder="https://…"
                onChange={(event) => setSourceUrl(event.target.value)}
              />
            </details>

            {item === null ? (
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
