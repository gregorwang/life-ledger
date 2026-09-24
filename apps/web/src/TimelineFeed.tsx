import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  CornerDownRight,
  ExternalLink,
  Globe2,
  Hash,
  ImagePlus,
  Lightbulb,
  LoaderCircle,
  LockKeyhole,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Smile,
  Star,
  Trash2,
  Tv,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  discardEntryMedia,
  uploadEntryMedia,
} from "./api";
import {
  FEED_TABS,
  type FeedTabId,
  feedTime,
  formatDuration,
  groupFeedByDay,
  isMediaOnlyBody,
  matchesFeedTab,
  mediaGridLayout,
  mediaOnlyMarker,
  relativeTime,
  visibleTags,
  weekStats,
} from "./feed-model";
import { MediaPrepError, prepareMediaFile } from "./media-prep";
import type {
  AnimeWork,
  CaptureDraftSeed,
  EntryMediaItem,
  EntryType,
  LedgerEntry,
  SourceChannel,
  ToastMessage,
} from "./models";

const OWNER_NAME = "汪家俊";
const OWNER_INITIAL = "汪";
const MAX_ATTACHMENTS = 9;

const SOURCE_LABELS: Record<SourceChannel, string> = {
  wechat: "微信",
  web: "网页",
  import: "历史导入",
  mcp: "MCP Agent",
};

export interface NewPost {
  type: EntryType;
  bodyRaw: string;
  mediaIds: string[];
  tags: string[];
}

export interface TimelineFeedProps {
  entries: LedgerEntry[];
  works: AnimeWork[];
  timeZone: string;
  composerSignal: number;
  onCreatePost: (post: NewPost) => Promise<boolean>;
  onOpenStructuredCapture: (seed: CaptureDraftSeed) => void;
  onOpenCommand: () => void;
  onOpenEntry: (entryId: string) => void;
  onOpenWork: (workId: string) => void;
  onEdit: (entry: LedgerEntry) => void;
  onPublish: (entry: LedgerEntry) => void;
  onUnpublish: (entryId: string) => void;
  onDelete: (entryId: string) => void;
  onAddFollowUp: (entryId: string, body: string) => Promise<boolean>;
  onDeleteFollowUp: (entryId: string, followUpId: string) => void;
  pushToast: (tone: ToastMessage["tone"], title: string, detail: string) => void;
}

export function TimelineFeed(props: TimelineFeedProps) {
  const { entries, works, timeZone } = props;
  const [tab, setTab] = useState<FeedTabId>("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{
    media: EntryMediaItem[];
    index: number;
  } | null>(null);
  const now = useMemo(() => new Date(), [entries]);

  useEffect(() => {
    if (props.composerSignal > 0) {
      setComposerOpen(true);
    }
  }, [props.composerSignal]);

  const active = useMemo(
    () => entries.filter((entry) => entry.status === "active"),
    [entries],
  );
  const days = useMemo(
    () =>
      groupFeedByDay(
        active.filter((entry) => matchesFeedTab(tab, entry)),
        now,
        timeZone,
      ),
    [active, now, tab, timeZone],
  );
  const worksById = useMemo(
    () => new Map(works.map((work) => [work.id, work])),
    [works],
  );

  return (
    <div className="page feed-page">
      <div className="feed-layout">
        <main className="feed-column" aria-label="动态">
          <FeedCover />
          <PostComposer
            open={composerOpen}
            focusSignal={props.composerSignal}
            onClose={() => setComposerOpen(false)}
            onSubmit={async (post) => {
              const saved = await props.onCreatePost(post);
              if (saved) {
                setComposerOpen(false);
                setTab("all");
              }
              return saved;
            }}
            onStructured={(seed) => {
              setComposerOpen(false);
              props.onOpenStructuredCapture(seed);
            }}
            pushToast={props.pushToast}
          />
          <FeedTabs value={tab} onChange={setTab} />
          {days.length ? (
            days.map((day) => (
              <section className="feed-day" key={day.key} aria-label={day.label}>
                <h2 className="feed-day-label">{day.label}</h2>
                {day.entries.map((entry) => (
                  <FeedPost
                    {...props}
                    key={entry.id}
                    entry={entry}
                    work={
                      entry.mediaWorkId
                        ? worksById.get(entry.mediaWorkId)
                        : undefined
                    }
                    now={now}
                    timeZone={timeZone}
                    onOpenMedia={(index) =>
                      setLightbox({ media: entry.media, index })
                    }
                  />
                ))}
              </section>
            ))
          ) : (
            <div className="feed-empty">
              <strong>
                {tab === "all" ? "还没有动态" : "这个分类下还没有动态"}
              </strong>
              <span>
                {tab === "all"
                  ? "在上面写下第一条，默认只有你自己能看到。"
                  : "切回「全部」看看其他记录。"}
              </span>
            </div>
          )}
          {days.length ? (
            <p className="feed-end">已经到底了 · 更早的记录可以在搜索里找到</p>
          ) : null}
        </main>
        <FeedRail
          entries={active}
          works={works}
          now={now}
          onOpenCommand={props.onOpenCommand}
          onOpenWork={props.onOpenWork}
        />
      </div>
      {composerOpen ? null : (
        <button
          className="feed-fab"
          type="button"
          aria-label="写一条动态"
          onClick={() => setComposerOpen(true)}
        >
          <Plus aria-hidden="true" size={26} />
        </button>
      )}
      {lightbox ? (
        <MediaLightbox
          media={lightbox.media}
          index={lightbox.index}
          onIndex={(index) => setLightbox({ ...lightbox, index })}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}

/** Photos, videos and follow-ups for the entry detail page. */
export function EntryAttachments({
  entry,
  timeZone,
}: {
  entry: LedgerEntry;
  timeZone: string;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const now = useMemo(() => new Date(), [entry]);
  if (!entry.media.length && !entry.followUps.length) {
    return null;
  }
  return (
    <div className="feed-scope entry-attachments">
      {entry.media.length ? (
        <PostMediaGrid media={entry.media} onOpen={setLightboxIndex} />
      ) : null}
      {entry.followUps.length ? (
        <ol className="feed-follow-ups" aria-label="补充">
          {entry.followUps.map((followUp) => (
            <li key={followUp.id}>
              <div className="feed-follow-up-meta">
                <CornerDownRight aria-hidden="true" size={13} />
                <span>
                  补充 · {relativeTime(followUp.createdAt, now, timeZone)} · 来自
                  {SOURCE_LABELS[followUp.sourceChannel]}
                </span>
              </div>
              <p>{followUp.body}</p>
            </li>
          ))}
        </ol>
      ) : null}
      {lightboxIndex !== null ? (
        <MediaLightbox
          media={entry.media}
          index={lightboxIndex}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}

function Avatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`feed-avatar feed-avatar-${size}`} aria-hidden="true">
      {OWNER_INITIAL}
    </span>
  );
}

function FeedCover() {
  return (
    <header className="feed-cover">
      <div className="feed-cover-art">
        <img
          src="/assets/anime-ui/mono-panorama.webp"
          alt=""
          decoding="async"
          fetchPriority="high"
          height="2218"
          width="3082"
        />
        <div className="feed-cover-identity">
          <h1>{OWNER_NAME}</h1>
          <span className="feed-cover-avatar" aria-hidden="true">
            {OWNER_INITIAL}
          </span>
        </div>
      </div>
      <p className="feed-cover-signature">原文先于解释 · 默认仅自己可见</p>
    </header>
  );
}

function FeedTabs({
  value,
  onChange,
}: {
  value: FeedTabId;
  onChange: (value: FeedTabId) => void;
}) {
  return (
    <nav className="feed-tabs" aria-label="动态类型">
      {FEED_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={value === tab.id ? "is-active" : ""}
          aria-pressed={value === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

interface Attachment {
  localId: string;
  kind: "image" | "video";
  previewUrl: string;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
  media?: EntryMediaItem;
  abort?: () => void;
}

interface PostComposerProps {
  open: boolean;
  focusSignal: number;
  onClose: () => void;
  onSubmit: (post: NewPost) => Promise<boolean>;
  onStructured: (seed: CaptureDraftSeed) => void;
  pushToast: TimelineFeedProps["pushToast"];
}

function extractHashtags(text: string): string[] {
  const tags = [...text.matchAll(/#([^\s#，。,.!！?？]{1,30})/g)].map(
    (match) => match[1]!,
  );
  return [...new Set(tags)].slice(0, 20);
}

function PostComposer({
  open,
  focusSignal,
  onClose,
  onSubmit,
  onStructured,
  pushToast,
}: PostComposerProps) {
  const [text, setText] = useState("");
  const [type, setType] = useState<"thought" | "idea" | "mood">("thought");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaId = useId();

  useEffect(() => {
    if (focusSignal > 0) {
      textareaRef.current?.focus();
    }
  }, [focusSignal]);

  useEffect(() => {
    if (open) {
      textareaRef.current?.focus();
    }
  }, [open]);

  const uploading = attachments.some((item) => item.status === "uploading");
  const ready = attachments.filter((item) => item.status === "done" && item.media);
  const canSubmit =
    !submitting && !uploading && (text.trim().length > 0 || ready.length > 0);

  const patchAttachment = (localId: string, patch: Partial<Attachment>) =>
    setAttachments((current) =>
      current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    );

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) {
      return;
    }
    const room = MAX_ATTACHMENTS - attachments.length;
    const selected = [...files].slice(0, Math.max(0, room));
    if (files.length > room) {
      pushToast("info", `最多 ${MAX_ATTACHMENTS} 个照片或视频`, "多出来的文件没有加入。");
    }
    for (const file of selected) {
      const localId = crypto.randomUUID();
      let prepared;
      try {
        prepared = await prepareMediaFile(file);
      } catch (error: unknown) {
        pushToast(
          "danger",
          "无法添加这个文件",
          error instanceof MediaPrepError ? error.message : `「${file.name}」读取失败。`,
        );
        continue;
      }
      const upload = uploadEntryMedia(
        prepared.blob,
        prepared.mimeType,
        prepared.metadata,
        (fraction) => patchAttachment(localId, { progress: fraction }),
      );
      setAttachments((current) => [
        ...current,
        {
          localId,
          kind: prepared.kind,
          previewUrl: prepared.previewUrl,
          progress: 0,
          status: "uploading",
          abort: upload.abort,
        },
      ]);
      upload.promise
        .then((media) =>
          patchAttachment(localId, { status: "done", progress: 1, media }),
        )
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          patchAttachment(localId, {
            status: "error",
            error: error instanceof Error ? error.message : "上传失败。",
          });
        });
    }
  };

  const removeAttachment = (attachment: Attachment) => {
    attachment.abort?.();
    URL.revokeObjectURL(attachment.previewUrl);
    setAttachments((current) =>
      current.filter((item) => item.localId !== attachment.localId),
    );
    if (attachment.media) {
      void discardEntryMedia(attachment.media.id).catch(() => undefined);
    }
  };

  const reset = () => {
    for (const item of attachments) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setAttachments([]);
    setText("");
    setType("thought");
  };

  const mediaIds = () =>
    ready.map((item) => item.media!.id);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    const trimmed = text.trim();
    const saved = await onSubmit({
      type,
      bodyRaw: trimmed || mediaOnlyMarker(ready.map((item) => item.media!)),
      mediaIds: mediaIds(),
      tags: extractHashtags(trimmed),
    });
    setSubmitting(false);
    if (saved) {
      reset();
    }
  };

  const openStructured = (structuredType: "anime" | "screen") => {
    if (uploading) {
      pushToast("info", "还有文件在上传", "上传完成后再切换到番剧/影视记录。");
      return;
    }
    onStructured({ type: structuredType, bodyRaw: text, mediaIds: mediaIds() });
    // Attachments now belong to the structured draft; keep them server-side.
    setAttachments([]);
    setText("");
  };

  const insertHashtag = () => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}#${text.slice(end)}`;
    setText(next);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + 1, start + 1);
    });
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <>
      <div
        className={open ? "feed-composer-backdrop is-open" : "feed-composer-backdrop"}
        aria-hidden="true"
        onClick={onClose}
      />
      <form
        className={open ? "feed-composer is-open" : "feed-composer"}
        aria-label="写一条动态"
        onSubmit={submit}
      >
        <div className="feed-composer-sheet-header">
          <button type="button" className="feed-text-button" onClick={onClose}>
            取消
          </button>
          <strong>写动态</strong>
          <button
            type="submit"
            className="feed-primary-button is-small"
            disabled={!canSubmit}
          >
            发布
          </button>
        </div>
        <div className="feed-composer-body">
          <Avatar />
          <div className="feed-composer-main">
            <label className="sr-only" htmlFor={textareaId}>
              动态内容
            </label>
            <textarea
              id={textareaId}
              ref={textareaRef}
              rows={2}
              value={text}
              placeholder={
                type === "mood"
                  ? "现在心情怎么样？"
                  : type === "idea"
                    ? "记下一个点子…"
                    : "今天想留下什么？"
              }
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            {attachments.length ? (
              <ul className="feed-composer-attachments" aria-label="已添加的照片和视频">
                {attachments.map((item) => (
                  <li key={item.localId} className={`is-${item.status}`}>
                    {item.kind === "video" ? (
                      <video src={item.previewUrl} muted playsInline preload="metadata" />
                    ) : (
                      <img src={item.previewUrl} alt="" />
                    )}
                    {item.kind === "video" ? (
                      <span className="feed-attachment-badge">
                        <Play aria-hidden="true" size={12} /> 视频
                      </span>
                    ) : null}
                    {item.status === "uploading" ? (
                      <span className="feed-attachment-progress">
                        <LoaderCircle aria-hidden="true" size={16} />
                        {Math.round(item.progress * 100)}%
                      </span>
                    ) : null}
                    {item.status === "error" ? (
                      <span className="feed-attachment-error" title={item.error}>
                        上传失败
                      </span>
                    ) : null}
                    <button
                      type="button"
                      aria-label="移除"
                      onClick={() => removeAttachment(item)}
                    >
                      <X aria-hidden="true" size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="feed-composer-toolbar">
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept="image/*,video/mp4,video/quicktime,video/webm,.mov,.heic,.heif"
                multiple
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  void addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                className="feed-tool"
                aria-label="添加照片或视频"
                title="照片 / 视频"
                disabled={attachments.length >= MAX_ATTACHMENTS}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus aria-hidden="true" size={19} />
              </button>
              <button
                type="button"
                className="feed-tool"
                aria-label="记一条番剧"
                title="番剧（带评分）"
                onClick={() => openStructured("anime")}
              >
                <Tv aria-hidden="true" size={19} />
              </button>
              <button
                type="button"
                className="feed-tool"
                aria-label="记一条影视"
                title="影视（带评分）"
                onClick={() => openStructured("screen")}
              >
                <Clapperboard aria-hidden="true" size={19} />
              </button>
              <button
                type="button"
                className={type === "mood" ? "feed-tool is-active" : "feed-tool"}
                aria-label="标记为心情"
                aria-pressed={type === "mood"}
                title="心情"
                onClick={() => setType((current) => (current === "mood" ? "thought" : "mood"))}
              >
                <Smile aria-hidden="true" size={19} />
              </button>
              <button
                type="button"
                className={type === "idea" ? "feed-tool is-active" : "feed-tool"}
                aria-label="标记为点子"
                aria-pressed={type === "idea"}
                title="点子"
                onClick={() => setType((current) => (current === "idea" ? "thought" : "idea"))}
              >
                <Lightbulb aria-hidden="true" size={19} />
              </button>
              <button
                type="button"
                className="feed-tool"
                aria-label="插入话题"
                title="话题"
                onClick={insertHashtag}
              >
                <Hash aria-hidden="true" size={19} />
              </button>
              <span className="feed-toolbar-spacer" />
              <span className="feed-visibility-pill">
                <LockKeyhole aria-hidden="true" size={13} />
                仅自己可见
              </span>
              <button
                type="submit"
                className="feed-primary-button feed-composer-submit"
                disabled={!canSubmit}
              >
                {submitting ? "发布中…" : uploading ? "上传中…" : "发布"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}

interface FeedPostProps extends TimelineFeedProps {
  entry: LedgerEntry;
  work: AnimeWork | undefined;
  now: Date;
  onOpenMedia: (index: number) => void;
}

function FeedPost({
  entry,
  work,
  now,
  timeZone,
  onOpenMedia,
  onOpenEntry,
  onOpenWork,
  onEdit,
  onPublish,
  onUnpublish,
  onDelete,
  onAddFollowUp,
  onDeleteFollowUp,
}: FeedPostProps) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const tags = visibleTags(entry);
  const hideBody = isMediaOnlyBody(entry);
  const longBody = entry.bodyRaw.length > 280 || entry.bodyRaw.split("\n").length > 8;
  const isMediaLog = entry.type === "anime" || entry.type === "screen";

  return (
    <article className="feed-post" aria-label={`${OWNER_NAME}的动态`}>
      <Avatar />
      <div className="feed-post-main">
        <header className="feed-post-header">
          <strong>{OWNER_NAME}</strong>
          <button
            type="button"
            className="feed-post-time"
            title="查看详情与修订"
            onClick={() => onOpenEntry(entry.id)}
          >
            <time dateTime={entry.occurredAt}>{feedTime(entry, timeZone)}</time>
          </button>
          {entry.type === "mood" ? <span className="feed-type-chip">心情</span> : null}
          {entry.type === "idea" ? <span className="feed-type-chip">点子</span> : null}
          <span className="feed-post-spacer" />
          <VisibilityMark visibility={entry.visibility} />
          <PostMenu
            onOpen={() => onOpenEntry(entry.id)}
            onEdit={() => onEdit(entry)}
            onDelete={() => onDelete(entry.id)}
          />
        </header>
        {hideBody ? null : (
          <div className={longBody && !expanded ? "feed-post-body is-clamped" : "feed-post-body"}>
            <p>{entry.bodyRaw}</p>
          </div>
        )}
        {longBody && !hideBody ? (
          <button
            type="button"
            className="feed-text-button feed-expand"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "收起" : "全文"}
          </button>
        ) : null}
        {entry.media.length ? (
          <PostMediaGrid media={entry.media} onOpen={onOpenMedia} />
        ) : null}
        {isMediaLog ? (
          <WorkCard entry={entry} work={work} onOpenWork={onOpenWork} />
        ) : null}
        {tags.length ? (
          <div className="feed-post-tags">
            {tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        ) : null}
        {entry.followUps.length ? (
          <ol className="feed-follow-ups" aria-label="补充">
            {entry.followUps.map((followUp) => (
              <li key={followUp.id}>
                <div className="feed-follow-up-meta">
                  <CornerDownRight aria-hidden="true" size={13} />
                  <span>补充 · {relativeTime(followUp.createdAt, now, timeZone)}</span>
                  <button
                    type="button"
                    aria-label="删除这条补充"
                    onClick={() => {
                      if (window.confirm("删除这条补充？")) {
                        onDeleteFollowUp(entry.id, followUp.id);
                      }
                    }}
                  >
                    <X aria-hidden="true" size={13} />
                  </button>
                </div>
                <p>{followUp.body}</p>
              </li>
            ))}
          </ol>
        ) : null}
        {replyOpen ? (
          <FollowUpComposer
            onCancel={() => setReplyOpen(false)}
            onSubmit={async (body) => {
              const saved = await onAddFollowUp(entry.id, body);
              if (saved) {
                setReplyOpen(false);
              }
              return saved;
            }}
          />
        ) : null}
        <footer className="feed-post-actions">
          <button
            type="button"
            aria-expanded={replyOpen}
            onClick={() => setReplyOpen((value) => !value)}
          >
            <MessageSquarePlus aria-hidden="true" size={16} />
            补充
          </button>
          {entry.visibility === "public" ? (
            <button type="button" onClick={() => onUnpublish(entry.id)}>
              <LockKeyhole aria-hidden="true" size={16} />
              改回私密
            </button>
          ) : (
            <button type="button" onClick={() => onPublish(entry)}>
              <Globe2 aria-hidden="true" size={16} />
              {entry.visibility === "publish_pending" ? "完成公开" : "设为公开"}
            </button>
          )}
          <button type="button" onClick={() => onEdit(entry)}>
            <Pencil aria-hidden="true" size={16} />
            编辑
          </button>
          <span className="feed-post-spacer" />
          <span className="feed-post-source">来自{SOURCE_LABELS[entry.sourceChannel]}</span>
        </footer>
      </div>
    </article>
  );
}

function VisibilityMark({ visibility }: { visibility: LedgerEntry["visibility"] }) {
  if (visibility === "public") {
    return (
      <span className="feed-visibility is-public">
        <Globe2 aria-hidden="true" size={13} />
        公开
      </span>
    );
  }
  if (visibility === "publish_pending") {
    return <span className="feed-visibility is-pending">待确认公开</span>;
  }
  return (
    <span className="feed-visibility is-private" title="仅自己可见">
      <LockKeyhole aria-hidden="true" size={14} />
      <span className="sr-only">仅自己可见</span>
    </span>
  );
}

function PostMenu({
  onOpen,
  onEdit,
  onDelete,
}: {
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !rootRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="feed-menu" ref={rootRef}>
      <button
        type="button"
        className="feed-icon-button"
        aria-label="更多操作"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal aria-hidden="true" size={18} />
      </button>
      {open ? (
        <div className="feed-menu-popover" id={menuId} role="menu">
          <button type="button" role="menuitem" onClick={choose(onOpen)}>
            <ExternalLink aria-hidden="true" size={15} />
            详情与修订记录
          </button>
          <button type="button" role="menuitem" onClick={choose(onEdit)}>
            <Pencil aria-hidden="true" size={15} />
            编辑原文
          </button>
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            onClick={choose(onDelete)}
          >
            <Trash2 aria-hidden="true" size={15} />
            移到回收站
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PostMediaGrid({
  media,
  onOpen,
}: {
  media: EntryMediaItem[];
  onOpen: (index: number) => void;
}) {
  const layout = mediaGridLayout(media.length);
  return (
    <div className={`feed-media feed-media-${layout}`}>
      {media.map((item, index) => {
        const ratio =
          layout === "single" && item.width && item.height
            ? { aspectRatio: `${item.width} / ${item.height}` }
            : undefined;
        if (item.kind === "video") {
          return (
            <div className="feed-media-item is-video" key={item.id} style={ratio}>
              <video
                src={`${item.url}#t=0.1`}
                controls
                playsInline
                preload="metadata"
              />
              {item.durationMs !== null ? (
                <span className="feed-media-duration">
                  {formatDuration(item.durationMs)}
                </span>
              ) : null}
            </div>
          );
        }
        return (
          <button
            type="button"
            className="feed-media-item"
            key={item.id}
            style={ratio}
            aria-label={`查看第 ${index + 1} 张照片`}
            onClick={() => onOpen(index)}
          >
            <img src={item.url} alt="" loading="lazy" decoding="async" />
          </button>
        );
      })}
    </div>
  );
}

function WorkCard({
  entry,
  work,
  onOpenWork,
}: {
  entry: LedgerEntry;
  work: AnimeWork | undefined;
  onOpenWork: (workId: string) => void;
}) {
  const detail = [
    entry.seasonLabel ? `第 ${entry.seasonLabel.replace(/^第\s*|\s*季$/g, "")} 季` : null,
    entry.episodeLabel ? `第 ${entry.episodeLabel.replace(/^第\s*|\s*集$/g, "")} 集` : null,
    entry.ratingScope === "work"
      ? "整部评分"
      : entry.ratingScope === "season"
        ? "季度评分"
        : entry.ratingScope === "episode"
          ? "单集评分"
          : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const label = entry.type === "anime" ? "番剧" : entry.mediaKind === "tv" ? "剧集" : "影视";
  const content = (
    <>
      {work?.coverUrl ? (
        <img src={work.coverUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="feed-work-placeholder" aria-hidden="true">
          {entry.type === "anime" ? <Tv size={22} /> : <Clapperboard size={22} />}
        </span>
      )}
      <span className="feed-work-copy">
        <small>
          {entry.type === "anime" ? (
            <Tv aria-hidden="true" size={12} />
          ) : (
            <Clapperboard aria-hidden="true" size={12} />
          )}
          {label}
        </small>
        <strong>{work?.title ?? entry.title}</strong>
        {detail ? <span>{detail}</span> : null}
      </span>
      {entry.score !== null ? (
        <span className="feed-work-score">
          <Star aria-hidden="true" size={14} />
          <strong>{entry.score.toFixed(1)}</strong>
          <small>/ 10</small>
        </span>
      ) : null}
    </>
  );
  return work ? (
    <button
      type="button"
      className="feed-work-card"
      onClick={() => onOpenWork(work.id)}
    >
      {content}
    </button>
  ) : (
    <div className="feed-work-card">{content}</div>
  );
}

function FollowUpComposer({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (body: string) => Promise<boolean>;
}) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const inputId = useId();

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!body.trim() || saving) {
      return;
    }
    setSaving(true);
    const saved = await onSubmit(body.trim());
    setSaving(false);
    if (saved) {
      setBody("");
    }
  };

  return (
    <form className="feed-follow-up-form" onSubmit={submit}>
      <label className="sr-only" htmlFor={inputId}>
        补充内容
      </label>
      <textarea
        id={inputId}
        autoFocus
        rows={2}
        value={body}
        placeholder="补充一点后来的想法…"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
          if (event.key === "Escape") {
            onCancel();
          }
        }}
      />
      <div>
        <button type="button" className="feed-text-button" onClick={onCancel}>
          取消
        </button>
        <button
          type="submit"
          className="feed-primary-button is-small"
          disabled={!body.trim() || saving}
        >
          {saving ? "保存中…" : "补充"}
        </button>
      </div>
    </form>
  );
}

function FeedRail({
  entries,
  works,
  now,
  onOpenCommand,
  onOpenWork,
}: {
  entries: LedgerEntry[];
  works: AnimeWork[];
  now: Date;
  onOpenCommand: () => void;
  onOpenWork: (workId: string) => void;
}) {
  const stats = weekStats(entries, now);
  const watching = works
    .filter((work) => work.watchStatus === "watching")
    .sort((left, right) =>
      (right.lastLoggedAt ?? "").localeCompare(left.lastLoggedAt ?? ""),
    )
    .slice(0, 4);

  return (
    <aside className="feed-rail" aria-label="概览">
      <button type="button" className="feed-rail-search" onClick={onOpenCommand}>
        <Search aria-hidden="true" size={17} />
        <span>搜索动态</span>
        <kbd>⌘K</kbd>
      </button>
      <section className="feed-rail-card">
        <h2>最近 7 天</h2>
        <dl className="feed-rail-stats">
          <div>
            <dt>条动态</dt>
            <dd>{stats.posts}</dd>
          </div>
          <div>
            <dt>条番剧 / 影视</dt>
            <dd>{stats.mediaLogs}</dd>
          </div>
          <div>
            <dt>条公开</dt>
            <dd>{stats.publicPosts}</dd>
          </div>
        </dl>
      </section>
      {watching.length ? (
        <section className="feed-rail-card">
          <h2>正在追</h2>
          <ul className="feed-rail-watching">
            {watching.map((work) => (
              <li key={work.id}>
                <button type="button" onClick={() => onOpenWork(work.id)}>
                  <img src={work.coverUrl} alt="" loading="lazy" decoding="async" />
                  <span>
                    <strong>{work.title}</strong>
                    <small>
                      {work.overallScore !== null
                        ? `总评 ${work.overallScore.toFixed(1)} · `
                        : ""}
                      {work.logCount} 条记录
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="feed-rail-note">
        <ShieldCheck aria-hidden="true" size={15} />
        新动态默认仅自己可见；设为公开前会先预览，并需要输入确认短码。
      </p>
    </aside>
  );
}

function MediaLightbox({
  media,
  index,
  onIndex,
  onClose,
}: {
  media: EntryMediaItem[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const images = media.filter((item) => item.kind === "image");
  const current = media[index];
  const imageIndex = current ? images.indexOf(current) : -1;
  const closeRef = useRef<HTMLButtonElement>(null);

  const step = (delta: number) => {
    const next = images[(imageIndex + delta + images.length) % images.length];
    if (next) {
      onIndex(media.indexOf(next));
    }
  };

  useEffect(() => {
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  });

  if (!current || current.kind !== "image") {
    return null;
  }

  return (
    <div
      className="feed-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="查看照片"
      onClick={onClose}
    >
      <img src={current.url} alt="" onClick={(event) => event.stopPropagation()} />
      <button
        ref={closeRef}
        type="button"
        className="feed-lightbox-close"
        aria-label="关闭"
        onClick={onClose}
      >
        <X aria-hidden="true" size={22} />
      </button>
      {images.length > 1 ? (
        <>
          <button
            type="button"
            className="feed-lightbox-nav is-prev"
            aria-label="上一张"
            onClick={(event) => {
              event.stopPropagation();
              step(-1);
            }}
          >
            <ChevronLeft aria-hidden="true" size={26} />
          </button>
          <button
            type="button"
            className="feed-lightbox-nav is-next"
            aria-label="下一张"
            onClick={(event) => {
              event.stopPropagation();
              step(1);
            }}
          >
            <ChevronRight aria-hidden="true" size={26} />
          </button>
          <span className="feed-lightbox-count">
            {imageIndex + 1} / {images.length}
          </span>
        </>
      ) : null}
    </div>
  );
}
