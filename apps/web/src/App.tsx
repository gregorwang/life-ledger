import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cloud,
  CloudDownload,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  FileArchive,
  FileClock,
  FileJson,
  CalendarHeart,
  Film,
  Globe2,
  Gamepad2,
  History,
  Import,
  Inbox,
  Keyboard,
  Library,
  LockKeyhole,
  Menu,
  MessageCircleMore,
  MapPin,
  MoreHorizontal,
  Music2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  UploadCloud,
  UserRound,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  type CSSProperties,
  Fragment,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MOOD_TAG_PREFIX,
  withMoodTag,
  type EntryLink,
  type SearchHit,
  type ImportDryRunReport,
  type LedgerProfile,
  type PendingAction,
} from "@life-ledger/contracts";

import {
  addEntryFollowUp as apiAddEntryFollowUp,
  commitImport as apiCommitImport,
  confirmPublish as apiConfirmPublish,
  createEntry as apiCreateEntry,
  createExport as apiCreateExport,
  createImportDryRun as apiCreateImportDryRun,
  deleteEntryFollowUp as apiDeleteEntryFollowUp,
  EMPTY_PROFILE,
  exportDownloadUrl,
  loadDashboard,
  loadEntry,
  loadScreenWorks,
  mutateEntry as apiMutateEntry,
  preparePublish as apiPreparePublish,
  purgeEntry as apiPurgeEntry,
  saveProfile as apiSaveProfile,
  searchEverything,
  saveSettings as apiSaveSettings,
  updateEntryBody,
  updateEntryTags,
  verifyExport as apiVerifyExport,
} from "./api";
import {
  demoAnimeWorks,
  demoEntries,
  demoExports,
  demoSettings,
} from "./demo-data";
import {
  ENTRY_TYPES,
  type AnimeWork,
  type CaptureDraft,
  type CaptureDraftSeed,
  type EntryStatus,
  type EntryType,
  type EntryVisibility,
  type ExportRecord,
  type LedgerEntry,
  type LedgerSettings,
  type ScreenWork,
  type SearchFilters,
  type ToastMessage,
} from "./models";
import { GameLibraryPage } from "./GameLibraryPage";
import { LocalBackupPanel } from "./LocalBackupPanel";
import { PlacesPage } from "./PlacesPage";
import { ReviewPage } from "./ReviewPage";
import { ShelfPage } from "./ShelfPage";
import {
  EntryAttachments,
  TimelineFeed,
  type NewPost,
} from "./TimelineFeed";
import {
  sortAnimeWorks,
  type AnimeLibrarySort,
} from "./anime-order";
import { formatOccurredAt } from "./date-display";

const ROUTES = {
  timeline: "/",
  anime: "/anime",
  movies: "/movies",
  games: "/games",
  books: "/books",
  music: "/music",
  places: "/places",
  review: "/review",
  search: "/search",
  imports: "/imports",
  exports: "/exports",
  trash: "/trash",
  settings: "/settings",
} as const;

type AppRoute =
  | { kind: "timeline" }
  | { kind: "anime" }
  | { kind: "anime-detail"; id: string }
  | { kind: "movies" }
  | { kind: "games" }
  | { kind: "books" }
  | { kind: "music" }
  | { kind: "places" }
  | { kind: "review" }
  | { kind: "entry-detail"; id: string }
  | { kind: "search" }
  | { kind: "imports" }
  | { kind: "exports" }
  | { kind: "trash" }
  | { kind: "settings" };

/** Mood tags (`mood:😊`) read as a mood, everything else as a hashtag. */
function displayTag(tag: string): string {
  return tag.startsWith(MOOD_TAG_PREFIX)
    ? `心情 ${tag.slice(MOOD_TAG_PREFIX.length)}`
    : `#${tag}`;
}

interface NavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
  section: "main" | "system";
  badge?: string;
}

const NAV_ITEMS = [
  {
    label: "日常",
    path: ROUTES.timeline,
    icon: Inbox,
    section: "main",
  },
  {
    label: "动漫库",
    path: ROUTES.anime,
    icon: Library,
    section: "main",
  },
  {
    label: "影视",
    path: ROUTES.movies,
    icon: Film,
    section: "main",
  },
  {
    label: "游戏库",
    path: ROUTES.games,
    icon: Gamepad2,
    section: "main",
  },
  {
    label: "书架",
    path: ROUTES.books,
    icon: BookOpen,
    section: "main",
  },
  {
    label: "音乐",
    path: ROUTES.music,
    icon: Music2,
    section: "main",
  },
  {
    label: "足迹",
    path: ROUTES.places,
    icon: MapPin,
    section: "main",
  },
  {
    label: "年度回顾",
    path: ROUTES.review,
    icon: CalendarHeart,
    section: "main",
  },
  {
    label: "搜索",
    path: ROUTES.search,
    icon: Search,
    section: "main",
    badge: "⌘K",
  },
  {
    label: "导入",
    path: ROUTES.imports,
    icon: Import,
    section: "system",
  },
  {
    label: "导出与备份",
    path: ROUTES.exports,
    icon: CloudDownload,
    section: "system",
  },
  {
    label: "回收站",
    path: ROUTES.trash,
    icon: Trash2,
    section: "system",
  },
  {
    label: "设置",
    path: ROUTES.settings,
    icon: Settings,
    section: "system",
  },
] satisfies NavigationItem[];

const TYPE_LABELS: Record<EntryType, string> = {
  anime: "动漫",
  screen: "影视",
  thought: "想法",
  idea: "点子",
  mood: "自述",
  note: "笔记",
};

const SOURCE_LABELS = {
  wechat: "微信 / Hermes",
  web: "网页管理端",
  import: "历史导入",
  mcp: "MCP Agent",
} as const;

const VISIBILITY_LABELS: Record<EntryVisibility, string> = {
  private: "私人",
  publish_pending: "待确认",
  public: "公开",
};

function parseRoute(pathname: string): AppRoute {
  const entryMatch = pathname.match(/^\/entries\/([^/]+)$/);
  if (entryMatch?.[1]) {
    return { kind: "entry-detail", id: decodeURIComponent(entryMatch[1]) };
  }

  const animeMatch = pathname.match(/^\/anime\/([^/]+)$/);
  if (animeMatch?.[1]) {
    return { kind: "anime-detail", id: decodeURIComponent(animeMatch[1]) };
  }

  switch (pathname) {
    case ROUTES.timeline:
      return { kind: "timeline" };
    case ROUTES.anime:
      return { kind: "anime" };
    case ROUTES.movies:
      return { kind: "movies" };
    case ROUTES.games:
      return { kind: "games" };
    case ROUTES.books:
      return { kind: "books" };
    case ROUTES.music:
      return { kind: "music" };
    case ROUTES.places:
      return { kind: "places" };
    case ROUTES.review:
      return { kind: "review" };
    case ROUTES.search:
      return { kind: "search" };
    case ROUTES.imports:
      return { kind: "imports" };
    case ROUTES.exports:
      return { kind: "exports" };
    case ROUTES.trash:
      return { kind: "trash" };
    case ROUTES.settings:
      return { kind: "settings" };
    default:
      return { kind: "timeline" };
  }
}

function getRoutePath(route: AppRoute): string {
  switch (route.kind) {
    case "timeline":
      return ROUTES.timeline;
    case "anime":
      return ROUTES.anime;
    case "movies":
      return ROUTES.movies;
    case "games":
      return ROUTES.games;
    case "books":
      return ROUTES.books;
    case "music":
      return ROUTES.music;
    case "places":
      return ROUTES.places;
    case "review":
      return ROUTES.review;
    case "anime-detail":
      return `/anime/${encodeURIComponent(route.id)}`;
    case "entry-detail":
      return `/entries/${encodeURIComponent(route.id)}`;
    case "search":
      return ROUTES.search;
    case "imports":
      return ROUTES.imports;
    case "exports":
      return ROUTES.exports;
    case "trash":
      return ROUTES.trash;
    case "settings":
      return ROUTES.settings;
    default: {
      const exhaustive: never = route;
      throw new Error(`Unknown route: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Library page for a linked item, opened on that item. */
function linkPath(link: EntryLink): string {
  const base =
    link.kind === "place"
      ? ROUTES.places
      : link.kind === "game"
        ? ROUTES.games
        : link.shelfKind === "music"
          ? ROUTES.music
          : ROUTES.books;
  return `${base}?item=${encodeURIComponent(link.id)}`;
}

function entryPath(id: string): string {
  return `/entries/${encodeURIComponent(id)}`;
}

function animePath(id: string): string {
  return `/anime/${encodeURIComponent(id)}`;
}

const DEFAULT_TIME_ZONE = "Asia/Tokyo";
const TIME_ZONE_STORAGE_KEY = "life-ledger.timezone";

function currentTimeZone(): string {
  return window.localStorage.getItem(TIME_ZONE_STORAGE_KEY) || DEFAULT_TIME_ZONE;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: currentTimeZone(),
  }).format(new Date(value));
}

function formatEntryOccurredAt(entry: LedgerEntry): string {
  return formatOccurredAt(
    entry.occurredAt,
    entry.datePrecision,
    currentTimeZone(),
  );
}

function formatAnimeLastLoggedAt(work: AnimeWork): string | null {
  if (!work.lastLoggedAt) {
    return null;
  }
  return formatOccurredAt(
    work.lastLoggedAt,
    work.lastLoggedDatePrecision ?? "approximate",
    currentTimeZone(),
  );
}

function hasSensitivePattern(value: string): boolean {
  const patterns = [
    /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i,
    /(?:\+?\d[\d -]{7,}\d)/,
    /\b(?:sk|api|token|secret)[-_][a-z0-9_-]{12,}\b/i,
    /\b(?:bearer\s+)[a-z0-9._~-]{12,}\b/i,
  ];
  return patterns.some((pattern) => pattern.test(value));
}

const USE_DEMO_DATA = import.meta.env.DEV;

export function App() {
  const [route, setRoute] = useState<AppRoute>(() =>
    parseRoute(window.location.pathname),
  );
  // ?item=<id> asks a library page to open that item (links from 日常 posts).
  const [focusItem, setFocusItem] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("item"),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureSeed, setCaptureSeed] = useState<CaptureDraftSeed | null>(null);
  const [composerSignal, setComposerSignal] = useState(0);
  const [commandOpen, setCommandOpen] = useState(false);
  const [entries, setEntries] = useState<LedgerEntry[]>(() =>
    USE_DEMO_DATA ? structuredClone(demoEntries) : [],
  );
  const [works, setWorks] = useState<AnimeWork[]>(() =>
    USE_DEMO_DATA ? structuredClone(demoAnimeWorks) : [],
  );
  const [screenWorks, setScreenWorks] = useState<ScreenWork[]>([]);
  const [exports, setExports] = useState<ExportRecord[]>(() =>
    USE_DEMO_DATA ? structuredClone(demoExports) : [],
  );
  const [settings, setSettings] = useState<LedgerSettings>(() => ({
    ...demoSettings,
    timezone:
      window.localStorage.getItem(TIME_ZONE_STORAGE_KEY) ||
      demoSettings.timezone,
  }));
  const [profile, setProfile] = useState<LedgerProfile>(EMPTY_PROFILE);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const navigate = (path: string) => {
    window.history.pushState({}, "", path);
    const url = new URL(path, window.location.origin);
    setRoute(parseRoute(url.pathname));
    setFocusItem(url.searchParams.get("item"));
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pushToast = (
    tone: ToastMessage["tone"],
    title: string,
    detail: string,
  ) => {
    const toast: ToastMessage = {
      id: Date.now() + Math.round(Math.random() * 1000),
      tone,
      title,
      detail,
    };
    setToasts((current) => [...current, toast]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toast.id));
    }, 3600);
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboard(controller.signal)
      .then((dashboard) => {
        setEntries(dashboard.entries);
        setWorks(dashboard.works);
        setExports(dashboard.exports);
        setSettings(dashboard.settings);
        setProfile(dashboard.profile);
        window.localStorage.setItem(
          TIME_ZONE_STORAGE_KEY,
          dashboard.settings.timezone,
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        pushToast(
          USE_DEMO_DATA ? "info" : "danger",
          USE_DEMO_DATA ? "正在使用本地演示数据" : "事实层暂时不可用",
          USE_DEMO_DATA
            ? "启动 Cloudflare 本地 Worker 后会自动读取 D1。"
            : "生产页面不会回退到虚构记录；请稍后重试或检查 Worker 状态。",
        );
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (route.kind !== "movies") {
      return;
    }
    const controller = new AbortController();
    void loadScreenWorks(controller.signal)
      .then(setScreenWorks)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        pushToast(
          "danger",
          "影视目录暂时不可用",
          error instanceof Error ? error.message : "请稍后重试。",
        );
      });
    return () => controller.abort();
  }, [route.kind]);

  const openCapture = () => {
    if (route.kind === "timeline") {
      setComposerSignal((signal) => signal + 1);
      return;
    }
    setCaptureSeed(null);
    setCaptureOpen(true);
  };

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseRoute(window.location.pathname));
      setFocusItem(new URLSearchParams(window.location.search).get("item"));
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (captureOpen) {
          return;
        }
        setCommandOpen((open) => !open);
      }

      if (!isTyping && event.key === "/") {
        event.preventDefault();
        setCommandOpen(true);
      }

      if (!isTyping && !commandOpen && event.key.toLowerCase() === "n") {
        event.preventDefault();
        openCapture();
      }

      if (event.key === "Escape") {
        setCommandOpen(false);
        setCaptureOpen(false);
        setMobileNavOpen(false);
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [captureOpen, commandOpen, route.kind]);

  const updateEntry = (entryId: string, updater: (entry: LedgerEntry) => LedgerEntry) => {
    setEntries((current) =>
      current.map((entry) => (entry.id === entryId ? updater(entry) : entry)),
    );
  };

  useEffect(() => {
    if (route.kind !== "entry-detail") {
      return;
    }
    let active = true;
    void loadEntry(route.id)
      .then((entry) => {
        if (!active) {
          return;
        }
        setEntries((current) => {
          const exists = current.some((item) => item.id === entry.id);
          return exists
            ? current.map((item) => (item.id === entry.id ? entry : item))
            : [entry, ...current];
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [route]);

  const updateSettings = (nextSettings: LedgerSettings) => {
    window.localStorage.setItem(TIME_ZONE_STORAGE_KEY, nextSettings.timezone);
    setSettings(nextSettings);
    void apiSaveSettings(nextSettings).catch((error: unknown) => {
      pushToast(
        "danger",
        "设置未写入",
        error instanceof Error ? error.message : "事实层暂时不可用。",
      );
    });
  };

  const createEntry = async (draft: CaptureDraft) => {
    try {
      const entry = await apiCreateEntry(draft, works);
      setEntries((current) => [entry, ...current]);
      setCaptureOpen(false);
      setCaptureSeed(null);
      pushToast("success", "已发布到动态", "默认仅自己可见，原文与首个修订已保存。");
      if (route.kind !== "timeline") {
        navigate(ROUTES.timeline);
      }
    } catch (error: unknown) {
      pushToast(
        "danger",
        "保存失败",
        error instanceof Error ? error.message : "事实层暂时不可用。",
      );
    }
  };

  const saveProfile = async (next: LedgerProfile): Promise<boolean> => {
    try {
      setProfile(await apiSaveProfile(next));
      pushToast("success", "资料已更新", "头像、背景和签名只保存在你自己的账本里。");
      return true;
    } catch (error: unknown) {
      pushToast(
        "danger",
        "资料未保存",
        error instanceof Error ? error.message : "事实层暂时不可用。",
      );
      return false;
    }
  };

  const setEntryMood = async (entryId: string, mood: string | null) => {
    const current = entries.find((entry) => entry.id === entryId);
    if (!current) {
      return;
    }
    try {
      const updated = await updateEntryTags(
        current,
        withMoodTag(current.tags, mood),
        mood ? `心情设为 ${mood}` : "清除心情",
      );
      updateEntry(entryId, () => updated);
    } catch (error: unknown) {
      pushToast("danger", "心情没有保存", error instanceof Error ? error.message : "请求失败。");
    }
  };

  const createPost = async (post: NewPost): Promise<boolean> => {
    try {
      const entry = await apiCreateEntry(
        {
          type: post.type,
          title: "",
          bodyRaw: post.bodyRaw,
          score: "",
          workId: "",
          mediaKind: "movie",
          ratingScope: "work",
          seasonId: "",
          seasonLabel: "",
          episodeLabel: "",
          mediaIds: post.mediaIds,
          tags: post.tags,
          ...(post.links ? { links: post.links } : {}),
        },
        works,
      );
      setEntries((current) => [entry, ...current]);
      pushToast("success", "已发布", "仅自己可见，可随时设为公开。");
      return true;
    } catch (error: unknown) {
      pushToast(
        "danger",
        "发布失败",
        error instanceof Error ? error.message : "事实层暂时不可用。",
      );
      return false;
    }
  };

  const addFollowUp = async (entryId: string, body: string): Promise<boolean> => {
    try {
      const updated = await apiAddEntryFollowUp(entryId, body);
      updateEntry(entryId, () => updated);
      return true;
    } catch (error: unknown) {
      pushToast("danger", "补充失败", error instanceof Error ? error.message : "请求失败。");
      return false;
    }
  };

  const deleteFollowUp = async (entryId: string, followUpId: string) => {
    try {
      const updated = await apiDeleteEntryFollowUp(entryId, followUpId);
      updateEntry(entryId, () => updated);
    } catch (error: unknown) {
      pushToast("danger", "删除补充失败", error instanceof Error ? error.message : "请求失败。");
    }
  };

  const softDeleteEntry = async (entryId: string) => {
    try {
      const updated = await apiMutateEntry(entryId, "delete");
      updateEntry(entryId, () => updated);
      pushToast("info", "记录已移入回收站", "不会出现在公开 API，可随时恢复。");
      if (route.kind === "entry-detail") {
        navigate(ROUTES.timeline);
      }
    } catch (error: unknown) {
      pushToast("danger", "删除失败", error instanceof Error ? error.message : "请求失败。");
    }
  };

  const restoreEntry = async (entryId: string) => {
    try {
      const updated = await apiMutateEntry(entryId, "restore");
      updateEntry(entryId, () => updated);
      pushToast("success", "记录已恢复", "按照安全规则，恢复后的记录保持私人。");
    } catch (error: unknown) {
      pushToast("danger", "恢复失败", error instanceof Error ? error.message : "请求失败。");
    }
  };

  const purgeEntry = async (entryId: string) => {
    try {
      await apiPurgeEntry(entryId);
      setEntries((current) => current.filter((entry) => entry.id !== entryId));
      pushToast("danger", "记录已永久清除", "业务数据已删除，仅保留最小安全审计。");
    } catch (error: unknown) {
      pushToast("danger", "永久清除失败", error instanceof Error ? error.message : "请求失败。");
    }
  };

  const saveEntryBody = async (entryId: string, bodyRaw: string) => {
    const current = entries.find((entry) => entry.id === entryId);
    if (!current) {
      return;
    }
    try {
      const updated = await updateEntryBody(current, bodyRaw);
      updateEntry(entryId, () => updated);
      pushToast("success", "修改已保存", "已创建新修订，原始版本仍可查看。");
    } catch (error: unknown) {
      pushToast("danger", "保存失败", error instanceof Error ? error.message : "请求失败。");
    }
  };

  const preparePublish = async (entryId: string): Promise<PendingAction> => {
    try {
      const action = await apiPreparePublish(entryId);
      updateEntry(entryId, (entry) => ({
        ...entry,
        visibility: "publish_pending",
      }));
      return action;
    } catch (error: unknown) {
      pushToast("danger", "无法生成预览", error instanceof Error ? error.message : "请求失败。");
      throw error;
    }
  };

  const confirmPublish = async (
    entryId: string,
    actionId: string,
    confirmationCode: string,
  ) => {
    try {
      const updated = await apiConfirmPublish(actionId, confirmationCode);
      updateEntry(entryId, () => updated);
      pushToast("success", "已确认公开", "公开 revision 已更新，可随时取消公开。");
    } catch (error: unknown) {
      pushToast("danger", "公开失败", error instanceof Error ? error.message : "请求失败。");
      throw error;
    }
  };

  const unpublishEntry = async (entryId: string) => {
    try {
      const updated = await apiMutateEntry(entryId, "unpublish");
      updateEntry(entryId, () => updated);
      pushToast("info", "已取消公开", "no-store 投影已更新，不保留旧公开缓存。");
    } catch (error: unknown) {
      pushToast("danger", "取消公开失败", error instanceof Error ? error.message : "请求失败。");
      throw error;
    }
  };

  const createExport = async () => {
    try {
      const record = await apiCreateExport();
      setExports((current) => [record, ...current]);
      pushToast("info", "已创建完整导出", "Cloudflare Workflow 已入队，完成后会写入私有 R2。");
      window.setTimeout(() => {
        void loadDashboard()
          .then((dashboard) => setExports(dashboard.exports))
          .catch(() => undefined);
      }, 4_000);
    } catch (error: unknown) {
      pushToast("danger", "导出创建失败", error instanceof Error ? error.message : "请求失败。");
    }
  };

  const currentPath = getRoutePath(route);
  const activeEntries = entries.filter((entry) => entry.status === "active");
  const deletedCount = entries.filter((entry) => entry.status === "deleted").length;

  return (
    <div
      className={[
        "app-shell",
        sidebarCollapsed ? "sidebar-collapsed" : "",
        mobileNavOpen ? "mobile-nav-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        currentPath={currentPath}
        deletedCount={deletedCount}
        onCollapse={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onNavigate={navigate}
        onOpenCapture={openCapture}
      />

      <div
        className="mobile-backdrop"
        aria-hidden={!mobileNavOpen}
        onClick={() => setMobileNavOpen(false)}
      />

      <main className="app-main">
        <MobileHeader
          navOpen={mobileNavOpen}
          onMenu={() => setMobileNavOpen(true)}
          onCapture={openCapture}
          onSearch={() => setCommandOpen(true)}
        />
        <div className="route-stage" key={currentPath}>
          {renderRoute({
            route,
            composerSignal,
            onCreatePost: createPost,
            focusItem,
            profile,
            onSaveProfile: saveProfile,
            onSetMood: (entryId, mood) => {
              void setEntryMood(entryId, mood);
            },
            onOpenStructuredCapture: (seed) => {
              setCaptureSeed(seed);
              setCaptureOpen(true);
            },
            onAddFollowUp: addFollowUp,
            onDeleteFollowUp: (entryId, followUpId) => {
              void deleteFollowUp(entryId, followUpId);
            },
            entries,
            works,
            screenWorks,
            exports,
            settings,
            navigate,
            updateSettings,
            onOpenCapture: () => setCaptureOpen(true),
            onOpenCommand: () => setCommandOpen(true),
            onSoftDelete: softDeleteEntry,
            onRestore: restoreEntry,
            onPurge: purgeEntry,
            onSaveBody: saveEntryBody,
            onPreparePublish: preparePublish,
            onConfirmPublish: confirmPublish,
            onUnpublish: unpublishEntry,
            onCreateExport: createExport,
            pushToast,
          })}
        </div>
      </main>

      <QuickCaptureDialog
        open={captureOpen}
        works={works}
        initial={captureSeed}
        onClose={() => {
          setCaptureOpen(false);
          setCaptureSeed(null);
        }}
        onSubmit={createEntry}
      />

      <CommandPalette
        open={commandOpen}
        entries={activeEntries}
        onClose={() => setCommandOpen(false)}
        onNavigate={(path) => {
          setCommandOpen(false);
          navigate(path);
        }}
      />

      <ToastStack
        messages={toasts}
        onDismiss={(id) =>
          setToasts((current) => current.filter((toast) => toast.id !== id))
        }
      />
    </div>
  );
}

interface RenderRouteProps {
  route: AppRoute;
  composerSignal: number;
  onCreatePost: (post: NewPost) => Promise<boolean>;
  focusItem: string | null;
  profile: LedgerProfile;
  onSaveProfile: (profile: LedgerProfile) => Promise<boolean>;
  onSetMood: (entryId: string, mood: string | null) => void;
  onOpenStructuredCapture: (seed: CaptureDraftSeed) => void;
  onAddFollowUp: (entryId: string, body: string) => Promise<boolean>;
  onDeleteFollowUp: (entryId: string, followUpId: string) => void;
  entries: LedgerEntry[];
  works: AnimeWork[];
  screenWorks: ScreenWork[];
  exports: ExportRecord[];
  settings: LedgerSettings;
  navigate: (path: string) => void;
  updateSettings: (settings: LedgerSettings) => void;
  onOpenCapture: () => void;
  onOpenCommand: () => void;
  onSoftDelete: (entryId: string) => void;
  onRestore: (entryId: string) => void;
  onPurge: (entryId: string) => void;
  onSaveBody: (entryId: string, bodyRaw: string) => void;
  onPreparePublish: (entryId: string) => Promise<PendingAction>;
  onConfirmPublish: (
    entryId: string,
    actionId: string,
    confirmationCode: string,
  ) => Promise<void>;
  onUnpublish: (entryId: string) => void;
  onCreateExport: () => void;
  pushToast: (
    tone: ToastMessage["tone"],
    title: string,
    detail: string,
  ) => void;
}

function renderRoute(props: RenderRouteProps): ReactNode {
  switch (props.route.kind) {
    case "timeline":
      return (
        <TimelinePage
          entries={props.entries}
          works={props.works}
          settings={props.settings}
          composerSignal={props.composerSignal}
          navigate={props.navigate}
          onCreatePost={props.onCreatePost}
          profile={props.profile}
          onSaveProfile={props.onSaveProfile}
          onSetMood={props.onSetMood}
          onOpenStructuredCapture={props.onOpenStructuredCapture}
          onOpenCommand={props.onOpenCommand}
          onSoftDelete={props.onSoftDelete}
          onSaveBody={props.onSaveBody}
          onPreparePublish={props.onPreparePublish}
          onConfirmPublish={props.onConfirmPublish}
          onUnpublish={props.onUnpublish}
          onAddFollowUp={props.onAddFollowUp}
          onDeleteFollowUp={props.onDeleteFollowUp}
          pushToast={props.pushToast}
        />
      );
    case "anime":
      return (
        <AnimeLibraryPage
          entries={props.entries}
          works={props.works}
          navigate={props.navigate}
          onOpenCapture={props.onOpenCapture}
        />
      );
    case "movies":
      return (
        <MoviesPage
          works={props.screenWorks}
          navigate={props.navigate}
          onOpenCapture={props.onOpenCapture}
        />
      );
    case "games":
      return (
        <GameLibraryPage
          focusId={props.focusItem}
          onOpenEntry={(id) => props.navigate(entryPath(id))}
        />
      );
    case "books":
    case "music":
      return (
        <ShelfPage
          key={props.route.kind}
          kind={props.route.kind === "books" ? "book" : "music"}
          focusId={props.focusItem}
          onOpenEntry={(id) => props.navigate(entryPath(id))}
          onCreatePost={props.onCreatePost}
          pushToast={props.pushToast}
        />
      );
    case "places":
      return (
        <PlacesPage
          focusId={props.focusItem}
          onOpenEntry={(id) => props.navigate(entryPath(id))}
          onCreatePost={props.onCreatePost}
          pushToast={props.pushToast}
        />
      );
    case "review":
      return <ReviewPage onOpenEntry={(id) => props.navigate(entryPath(id))} />;
    case "anime-detail":
      return (
        <AnimeDetailPage
          workId={props.route.id}
          entries={props.entries}
          works={props.works}
          navigate={props.navigate}
          onOpenCapture={props.onOpenCapture}
        />
      );
    case "entry-detail":
      return (
        <EntryDetailPage
          entryId={props.route.id}
          entries={props.entries}
          works={props.works}
          settings={props.settings}
          navigate={props.navigate}
          onSoftDelete={props.onSoftDelete}
          onRestore={props.onRestore}
          onSaveBody={props.onSaveBody}
          onPreparePublish={props.onPreparePublish}
          onConfirmPublish={props.onConfirmPublish}
          onUnpublish={props.onUnpublish}
        />
      );
    case "search":
      return (
        <SearchPage
          entries={props.entries}
          works={props.works}
          navigate={props.navigate}
        />
      );
    case "imports":
      return <ImportsPage pushToast={props.pushToast} />;
    case "exports":
      return (
        <ExportsPage
          exports={props.exports}
          onCreateExport={props.onCreateExport}
          pushToast={props.pushToast}
        />
      );
    case "trash":
      return (
        <TrashPage
          entries={props.entries}
          navigate={props.navigate}
          onRestore={props.onRestore}
          onPurge={props.onPurge}
        />
      );
    case "settings":
      return (
        <SettingsPage
          settings={props.settings}
          updateSettings={props.updateSettings}
          navigate={props.navigate}
        />
      );
    default: {
      const exhaustive: never = props.route;
      throw new Error(`Unhandled route: ${JSON.stringify(exhaustive)}`);
    }
  }
}

interface SidebarProps {
  collapsed: boolean;
  currentPath: string;
  deletedCount: number;
  onCollapse: () => void;
  onNavigate: (path: string) => void;
  onOpenCapture: () => void;
}

function Sidebar({
  collapsed,
  currentPath,
  deletedCount,
  onCollapse,
  onNavigate,
  onOpenCapture,
}: SidebarProps) {
  const navSection = (section: NavigationItem["section"], title: string) => (
    <div className="sidebar-section">
      <span className="sidebar-section-label">{title}</span>
      <nav aria-label={title}>
        {NAV_ITEMS.filter((item) => item.section === section).map((item) => {
          const Icon = item.icon;
          const isActive =
            item.path === "/"
              ? currentPath === "/"
              : currentPath.startsWith(item.path);
          const badge =
            item.path === ROUTES.trash && deletedCount > 0
              ? String(deletedCount)
              : item.badge;
          return (
            <button
              className={isActive ? "sidebar-link is-active" : "sidebar-link"}
              key={item.path}
              type="button"
              title={collapsed ? item.label : undefined}
              onClick={() => onNavigate(item.path)}
            >
              <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
              <span className="sidebar-link-label">{item.label}</span>
              {badge ? <span className="sidebar-link-badge">{badge}</span> : null}
            </button>
          );
        })}
      </nav>
    </div>
  );

  return (
    <aside className="sidebar" id="primary-sidebar">
      <span className="sidebar-world-title" aria-hidden="true">
        私人記憶保管庫
      </span>
      <div className="brand-row">
        <button
          className="brand"
          type="button"
          aria-label="回到日常"
          onClick={() => onNavigate(ROUTES.timeline)}
        >
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          <span className="brand-copy">
            <strong>Life Ledger</strong>
            <small>PERSONAL EVENT SYSTEM</small>
          </span>
        </button>
        <button
          className="icon-button collapse-button"
          type="button"
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
          onClick={onCollapse}
        >
          <ChevronRight
            aria-hidden="true"
            className={collapsed ? "" : "rotate-180"}
            size={17}
          />
        </button>
      </div>

      <button
        className="capture-button"
        type="button"
        aria-label="新建记录"
        onClick={onOpenCapture}
      >
        <Plus aria-hidden="true" size={18} />
        <span>新建记录</span>
        <kbd>N</kbd>
      </button>

      <div className="sidebar-scroll">
        {navSection("main", "工作区")}
        {navSection("system", "数据与系统")}
      </div>

      <div className="sidebar-status-card">
        <div className="status-pulse" aria-hidden="true" />
        <div>
          <strong>Cloudflare D1 在线</strong>
          <span>生产私有库 · APAC</span>
        </div>
        <ShieldCheck aria-hidden="true" size={17} />
      </div>

      <button
        className="account-row"
        type="button"
        aria-label="打开账户与设置"
        onClick={() => onNavigate(ROUTES.settings)}
      >
        <span className="account-avatar">汪</span>
        <span className="account-copy">
          <strong>汪家俊</strong>
          <small>单用户 · 密码会话保护</small>
        </span>
        <MoreHorizontal aria-hidden="true" size={18} />
      </button>
    </aside>
  );
}

interface MobileHeaderProps {
  navOpen: boolean;
  onMenu: () => void;
  onCapture: () => void;
  onSearch: () => void;
}

function MobileHeader({
  navOpen,
  onMenu,
  onCapture,
  onSearch,
}: MobileHeaderProps) {
  return (
    <header className="mobile-header">
      <button
        className="icon-button"
        type="button"
        aria-label="打开导航"
        aria-expanded={navOpen}
        aria-controls="primary-sidebar"
        onClick={onMenu}
      >
        <Menu aria-hidden="true" size={20} />
      </button>
      <button
        className="mobile-brand"
        type="button"
        aria-label="打开全局搜索"
        onClick={onSearch}
      >
        <span className="brand-mark">L</span>
        <strong>Life Ledger</strong>
      </button>
      <button
        className="icon-button is-dark"
        type="button"
        aria-label="新建记录"
        onClick={onCapture}
      >
        <Plus aria-hidden="true" size={20} />
      </button>
    </header>
  );
}

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}

function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

interface StatusBadgeProps {
  visibility: EntryVisibility;
  status?: EntryStatus;
}

function StatusBadge({ visibility, status = "active" }: StatusBadgeProps) {
  const kind = status === "deleted" ? "deleted" : visibility;
  const label = status === "deleted" ? "已删除" : VISIBILITY_LABELS[visibility];
  const Icon =
    kind === "public" ? Eye : kind === "deleted" ? Trash2 : LockKeyhole;
  return (
    <span className={`status-badge status-${kind}`}>
      <Icon aria-hidden="true" size={12} strokeWidth={2} />
      {label}
    </span>
  );
}

interface TimelinePageProps {
  entries: LedgerEntry[];
  works: AnimeWork[];
  settings: LedgerSettings;
  composerSignal: number;
  navigate: (path: string) => void;
  onCreatePost: (post: NewPost) => Promise<boolean>;
  profile: LedgerProfile;
  onSaveProfile: (profile: LedgerProfile) => Promise<boolean>;
  onSetMood: (entryId: string, mood: string | null) => void;
  onOpenStructuredCapture: (seed: CaptureDraftSeed) => void;
  onOpenCommand: () => void;
  onSoftDelete: (entryId: string) => void;
  onSaveBody: (entryId: string, bodyRaw: string) => void;
  onPreparePublish: (entryId: string) => Promise<PendingAction>;
  onConfirmPublish: (
    entryId: string,
    actionId: string,
    confirmationCode: string,
  ) => Promise<void>;
  onUnpublish: (entryId: string) => void;
  onAddFollowUp: (entryId: string, body: string) => Promise<boolean>;
  onDeleteFollowUp: (entryId: string, followUpId: string) => void;
  pushToast: (
    tone: ToastMessage["tone"],
    title: string,
    detail: string,
  ) => void;
}

function TimelinePage(props: TimelinePageProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<{
    entryId: string;
    action: PendingAction;
  } | null>(null);
  const editingEntry = editingId
    ? props.entries.find((entry) => entry.id === editingId) ?? null
    : null;
  const publishingEntry = publishing
    ? props.entries.find((entry) => entry.id === publishing.entryId) ?? null
    : null;

  return (
    <>
      <TimelineFeed
        entries={props.entries}
        works={props.works}
        timeZone={currentTimeZone()}
        composerSignal={props.composerSignal}
        onCreatePost={props.onCreatePost}
        profile={props.profile}
        onSaveProfile={props.onSaveProfile}
        onSetMood={props.onSetMood}
        onOpenStructuredCapture={props.onOpenStructuredCapture}
        onOpenCommand={props.onOpenCommand}
        onOpenEntry={(entryId) => props.navigate(entryPath(entryId))}
        onOpenWork={(workId) => props.navigate(animePath(workId))}
        onOpenLink={(link) => props.navigate(linkPath(link))}
        onEdit={(entry) => setEditingId(entry.id)}
        onPublish={(entry) => {
          void props
            .onPreparePublish(entry.id)
            .then((action) => setPublishing({ entryId: entry.id, action }))
            .catch(() => undefined);
        }}
        onUnpublish={props.onUnpublish}
        onDelete={props.onSoftDelete}
        onAddFollowUp={props.onAddFollowUp}
        onDeleteFollowUp={props.onDeleteFollowUp}
        pushToast={props.pushToast}
      />
      {editingEntry ? (
        <EditEntryDialog
          entry={editingEntry}
          open
          onClose={() => setEditingId(null)}
          onSave={(body) => {
            props.onSaveBody(editingEntry.id, body);
            setEditingId(null);
          }}
        />
      ) : null}
      {publishing && publishingEntry ? (
        <PublishDialog
          entry={publishingEntry}
          work={props.works.find(
            (work) => work.id === publishingEntry.mediaWorkId,
          )}
          pendingAction={publishing.action}
          open
          onClose={() => {
            setPublishing(null);
            void props.onUnpublish(publishingEntry.id);
          }}
          onConfirm={async () => {
            try {
              await props.onConfirmPublish(
                publishingEntry.id,
                publishing.action.actionId,
                publishing.action.confirmationCode,
              );
              setPublishing(null);
            } catch {
              // The toast from onConfirmPublish already explains the failure.
            }
          }}
          sensitiveMatch={
            props.settings.sensitiveWarning &&
            hasSensitivePattern(
              `${publishingEntry.title}\n${publishingEntry.bodyRaw}`,
            )
          }
        />
      ) : null}
    </>
  );
}

interface EntryCardProps {
  entry: LedgerEntry;
  work: AnimeWork | undefined;
  onOpen: () => void;
  compact?: boolean;
  timestampKind?: "occurred" | "created";
}

function EntryCard({
  entry,
  work,
  onOpen,
  compact = false,
  timestampKind = "occurred",
}: EntryCardProps) {
  const timestamp =
    timestampKind === "created" ? entry.createdAt : entry.occurredAt;
  return (
    <article
      className={[
        "entry-card",
        compact ? "is-compact" : "",
        `entry-type-${entry.type}`,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button className="entry-card-main" type="button" onClick={onOpen}>
        <div className="entry-card-topline">
          <div className="entry-kind">
            <span className="entry-kind-dot" />
            {TYPE_LABELS[entry.type]}
          </div>
          <StatusBadge visibility={entry.visibility} status={entry.status} />
          <time
            dateTime={timestamp}
            title={timestampKind === "created" ? "写入时间" : "发生时间"}
          >
            {timestampKind === "created"
              ? formatDateTime(timestamp)
              : formatEntryOccurredAt(entry)}
          </time>
        </div>
        <div className="entry-card-content">
          {work ? (
            <img
              className="entry-cover"
              src={work.coverUrl}
              alt=""
              decoding="async"
              height="650"
              loading="lazy"
              width="460"
            />
          ) : (
            <div className="entry-symbol" aria-hidden="true">
              {entry.type === "idea" ? "✦" : entry.type === "mood" ? "◌" : "·"}
            </div>
          )}
          <div>
            <h3>{entry.title}</h3>
            <p>{entry.bodySummary}</p>
          </div>
          {entry.score !== null ? (
            <div className="score-orb">
              <strong>{entry.score.toFixed(1)}</strong>
              <span>/ 10</span>
            </div>
          ) : null}
        </div>
        <div className="entry-card-footer">
          <div className="tag-row">
            {entry.tags.slice(0, 3).map((tag) => (
              <span key={tag}>{displayTag(tag)}</span>
            ))}
          </div>
          <span className="entry-source">
            <MessageCircleMore aria-hidden="true" size={13} />
            {SOURCE_LABELS[entry.sourceChannel]}
          </span>
          <ArrowRight aria-hidden="true" className="entry-arrow" size={16} />
        </div>
      </button>
    </article>
  );
}

interface AnimeLibraryPageProps {
  entries: LedgerEntry[];
  works: AnimeWork[];
  navigate: (path: string) => void;
  onOpenCapture: () => void;
}

const ANIME_LIBRARY_BATCH_SIZE = 12;

function AnimeLibraryPage({
  entries,
  works,
  navigate,
  onOpenCapture,
}: AnimeLibraryPageProps) {
  const [statusFilter, setStatusFilter] = useState<
    "all" | NonNullable<AnimeWork["watchStatus"]>
  >("all");
  const [sort, setSort] = useState<AnimeLibrarySort>("recent_desc");
  const [visibleCount, setVisibleCount] = useState(ANIME_LIBRARY_BATCH_SIZE);

  const worksByActivity = useMemo(
    () => works,
    [works],
  );
  const watchingWorks = worksByActivity.filter(
    (work) => work.watchStatus === "watching",
  );
  const plannedWorks = worksByActivity.filter(
    (work) => work.watchStatus === "planned",
  );
  const visibleWorks = useMemo(
    () => {
      const filtered = works.filter(
          (work) =>
            statusFilter === "all" || work.watchStatus === statusFilter,
        );
      return sort === "recent_desc"
        ? filtered
        : sortAnimeWorks(filtered, sort);
    },
    [sort, statusFilter, works],
  );
  const publicLogsByWork = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      if (
        entry.mediaWorkId &&
        entry.visibility === "public" &&
        entry.status === "active"
      ) {
        counts.set(
          entry.mediaWorkId,
          (counts.get(entry.mediaWorkId) ?? 0) + 1,
        );
      }
    }
    return counts;
  }, [entries]);
  const renderedWorks = visibleWorks.slice(0, visibleCount);
  const worksWithTimeline = visibleWorks.filter(
    (work) => work.lastLoggedAt !== null,
  ).length;

  useEffect(() => {
    setVisibleCount(ANIME_LIBRARY_BATCH_SIZE);
  }, [sort, statusFilter]);

  const featured = watchingWorks[0] ?? worksByActivity[0];

  if (!featured) {
    return (
      <div className="page anime-page">
        <PageHeader
          eyebrow="ANIME ARCHIVE"
          title="动漫库"
          description="作品、季度与单集记录共享同一事实层，但评分彼此独立，不会互相覆盖。"
          actions={
            <button
              className="primary-button"
              type="button"
              onClick={onOpenCapture}
            >
              <Plus aria-hidden="true" size={17} />
              记录第一部作品
            </button>
          }
        />
        <section className="anime-feature anime-feature-empty">
          <span className="anime-feature-japanese" aria-hidden="true">
            第一章
          </span>
          <div className="anime-feature-empty-copy">
            <p className="eyebrow">YOUR FIRST STORY</p>
            <h2>从第一部作品开始</h2>
            <p>
              写下作品名、观看进度与当时的感受；首次记录会自动建立作品档案。
            </p>
            <button className="primary-button" type="button" onClick={onOpenCapture}>
              <Plus aria-hidden="true" size={17} />
              新建私人记录
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page anime-page">
      <PageHeader
        eyebrow="ANIME ARCHIVE"
        title="动漫库"
        description="作品、季度与单集记录共享同一事实层，但评分彼此独立，不会互相覆盖。"
        actions={
          <button
            className="primary-button"
            type="button"
            onClick={onOpenCapture}
          >
            <Plus aria-hidden="true" size={17} />
            记录观看
          </button>
        }
      />

      <section
        className="anime-feature"
        style={{ "--work-accent": featured.accent } as CSSProperties}
      >
        <img
          className="anime-feature-backdrop"
          src="/assets/anime-ui/chiramune-hero-v1.webp"
          alt=""
          aria-hidden="true"
          decoding="async"
          fetchPriority="high"
          height="900"
          width="1600"
        />
        <span className="anime-feature-japanese" aria-hidden="true">
          作品と記録
        </span>
        <div className="anime-feature-art">
          <img
            src={featured.coverUrl}
            alt={`${featured.title} 宣传海报`}
            decoding="async"
            fetchPriority="high"
            height="650"
            width="460"
          />
          <span>
            {featured.watchStatus === "watching"
              ? "NOW WATCHING"
              : featured.watchStatus === "planned"
                ? "UP NEXT"
                : "ARCHIVED"}
          </span>
        </div>
        <div className="anime-feature-copy">
          <p className="eyebrow">
            {featured.lastLoggedAt
              ? `最近作品时间线 · ${formatAnimeLastLoggedAt(featured)}`
              : featured.watchStatus === "watching"
                ? "最近在看"
                : featured.watchStatus === "planned"
                  ? "计划观看"
                  : "私人收藏"}
          </p>
          <h2>{featured.title}</h2>
          <p className="anime-subtitle">{featured.subtitle}</p>
          <p>{featured.description}</p>
          <div className="anime-feature-meta">
            <div>
              <span>整体评分</span>
              <strong>{featured.overallScore?.toFixed(1) ?? "—"}</strong>
            </div>
            <div>
              <span>当前进度</span>
              <strong>{featured.statusLabel}</strong>
            </div>
            <div>
              <span>记录数量</span>
              <strong>{featured.logCount}</strong>
            </div>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={() => navigate(animePath(featured.id))}
          >
            查看作品时间线
            <ArrowRight aria-hidden="true" size={16} />
          </button>
        </div>
      </section>

      <section className="anime-queue-section" aria-labelledby="anime-queue-title">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">WATCH QUEUE</p>
            <h2 id="anime-queue-title">正在看与下一部</h2>
          </div>
          <p className="anime-queue-summary">
            {watchingWorks.length} 部正在看 · {plannedWorks.length} 部计划观看
          </p>
        </div>

        <div className="anime-queue-lanes">
          {[
            {
              key: "watching",
              eyebrow: "NOW PLAYING",
              title: "最近在看",
              empty: "暂时没有正在追的作品",
              items: watchingWorks,
            },
            {
              key: "planned",
              eyebrow: "NEXT STORIES",
              title: "计划要看",
              empty: "观看清单还是空的",
              items: plannedWorks,
            },
          ].map((lane) => (
            <article
              className={`anime-queue-lane anime-queue-${lane.key}`}
              key={lane.key}
            >
              <header>
                <div>
                  <p>{lane.eyebrow}</p>
                  <h3>{lane.title}</h3>
                </div>
                <strong>{String(lane.items.length).padStart(2, "0")}</strong>
              </header>
              <div className="anime-queue-list">
                {lane.items.length ? (
                  lane.items.map((work) => (
                    <button
                      className="anime-queue-card"
                      key={work.id}
                      type="button"
                      onClick={() => navigate(animePath(work.id))}
                    >
                      <img
                        src={work.coverUrl}
                        alt={`${work.title} 宣传海报`}
                        decoding="async"
                        height="650"
                        loading="lazy"
                        width="460"
                      />
                      <span>
                        <small>{work.subtitle}</small>
                        <strong>{work.title}</strong>
                        <em>{work.statusLabel}</em>
                      </span>
                      <ArrowRight aria-hidden="true" size={17} />
                    </button>
                  ))
                ) : (
                  <p className="anime-queue-empty">{lane.empty}</p>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="library-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">YOUR LIBRARY</p>
            <h2>全部作品</h2>
            <p className="anime-library-timeline-summary">
              <Clock3 aria-hidden="true" size={14} />
              {worksWithTimeline} 部有作品时间线 ·{" "}
              {visibleWorks.length - worksWithTimeline} 部暂无作品时间线
            </p>
          </div>
          <div className="select-controls">
            <AnimeSelect
              className="library-select"
              label="观看状态"
              value={statusFilter}
              onChange={(value) =>
                setStatusFilter(
                  value as
                    | "all"
                    | NonNullable<AnimeWork["watchStatus"]>,
                )
              }
              options={[
                ["all", "全部状态"],
                ["watching", "观看中"],
                ["planned", "计划观看"],
                ["completed", "已看完"],
                ["paused", "已暂停"],
                ["dropped", "已弃"],
              ]}
            />
            <AnimeSelect
              className="library-select"
              label="排序"
              value={sort}
              onChange={(value) => setSort(value as AnimeLibrarySort)}
              options={[
                ["recent_desc", "作品时间线：最近优先"],
                ["recent_asc", "作品时间线：最早优先"],
                ["updated_desc", "作品：最近更新"],
                ["title_asc", "作品：标题排序"],
              ]}
            />
          </div>
        </div>

        <div className="anime-grid">
          {renderedWorks.map((work, index) => {
            const publicLogs = publicLogsByWork.get(work.id) ?? 0;
            return (
              <Fragment key={work.id}>
                {work.lastLoggedAt === null &&
                (index === 0 ||
                  renderedWorks[index - 1]?.lastLoggedAt !== null) ? (
                  <div className="anime-grid-group-label">
                    <strong>未记录观看时间</strong>
                    <span>这些作品暂无作品时间线，始终排在有观看记录的作品后面。</span>
                  </div>
                ) : null}
                <button
                  className="anime-card"
                  type="button"
                  style={
                    {
                      "--work-accent": work.accent,
                    } as CSSProperties
                  }
                  onClick={() => navigate(animePath(work.id))}
                >
                <span className="anime-card-cover">
                  <img
                    src={work.coverUrl}
                    alt={`${work.title} 宣传海报`}
                    decoding="async"
                    height="650"
                    loading="lazy"
                    width="460"
                  />
                  {work.watchStatus ? (
                    <span
                      className={`watch-status status-${work.watchStatus}`}
                    >
                      {work.statusLabel}
                    </span>
                  ) : null}
                </span>
                <span className="anime-card-copy">
                  <small>{work.subtitle}</small>
                  <strong>{work.title}</strong>
                  <span className="anime-card-timeline">
                    <Clock3 aria-hidden="true" size={12} />
                    {work.lastLoggedAt
                      ? `作品时间线 · ${formatAnimeLastLoggedAt(work)}`
                      : "暂无作品时间线"}
                  </span>
                </span>
                <span
                  className={`anime-card-score ${
                    work.overallScore === null ? "is-empty" : ""
                  }`}
                >
                  <strong>
                    {work.overallScore?.toFixed(1) ?? "未评"}
                  </strong>
                  <small>{work.logCount} 条作品记录 · {publicLogs} 条公开</small>
                </span>
                <ArrowRight aria-hidden="true" size={16} />
                </button>
              </Fragment>
            );
          })}
        </div>
        {renderedWorks.length < visibleWorks.length ? (
          <div className="anime-library-more">
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                setVisibleCount((current) =>
                  Math.min(
                    current + ANIME_LIBRARY_BATCH_SIZE,
                    visibleWorks.length,
                  ),
                )
              }
            >
              再显示{" "}
              {Math.min(
                ANIME_LIBRARY_BATCH_SIZE,
                visibleWorks.length - renderedWorks.length,
              )}{" "}
              部
              <ChevronDown aria-hidden="true" size={16} />
            </button>
            <span>
              已显示 {renderedWorks.length} / {visibleWorks.length}
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}

interface MoviesPageProps {
  works: ScreenWork[];
  navigate: (path: string) => void;
  onOpenCapture: () => void;
}

function MoviesPage({
  works,
  navigate,
  onOpenCapture,
}: MoviesPageProps) {
  const [kindFilter, setKindFilter] = useState<"all" | "movie" | "tv">("all");
  const visibleWorks = works.filter(
    (work) => kindFilter === "all" || work.mediaKind === kindFilter,
  );
  const movieCount = works.filter((work) => work.mediaKind === "movie").length;
  const tvCount = works.filter((work) => work.mediaKind === "tv").length;
  const watchStatusLabel = (status: ScreenWork["watchStatus"]) => {
    switch (status) {
      case "planned":
        return "想看";
      case "watching":
        return "观看中";
      case "completed":
        return "已看完";
      case "watched":
        return "已看";
      case "paused":
        return "已暂停";
      case "dropped":
        return "已搁置";
      default:
        return "未标记";
    }
  };

  return (
    <div className="page movies-page">
      <section className="movies-hero">
        <div className="movies-hero-copy">
          <p className="eyebrow">SCREEN LIBRARY / 02</p>
          <h1>影视</h1>
          <p>
            电影和电视剧直接陈列在同一面作品墙上。海报、观看状态与评分就是这一层的全部，
            不需要为了看一张卡片再进入第二级。
          </p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={onOpenCapture}>
              <Plus aria-hidden="true" size={17} />
              添加影视
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => navigate(ROUTES.search)}
            >
              <Search aria-hidden="true" size={16} />
              搜索作品
            </button>
          </div>
        </div>
        <div className="movies-scene-label" aria-hidden="true">
          <span>CINEMA</span>
          <strong>記憶は、光になる。</strong>
        </div>
      </section>

      <section className="movies-summary" aria-label="影视作品概览">
        <div>
          <span>全部作品</span>
          <strong>{works.length}</strong>
        </div>
        <div>
          <span>电影</span>
          <strong>{movieCount}</strong>
        </div>
        <div>
          <span>电视剧</span>
          <strong>{tvCount}</strong>
        </div>
      </section>

      <section className="movies-catalog-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">YOUR SCREEN LIBRARY</p>
            <h2>全部作品</h2>
          </div>
          <div className="movies-filter">
            <SegmentedControl
              value={kindFilter}
              options={[
                ["all", "全部"],
                ["movie", "电影"],
                ["tv", "电视剧"],
              ]}
              onChange={(value) =>
                setKindFilter(value as "all" | "movie" | "tv")
              }
            />
            <span className="compatibility-note">
              {visibleWorks.length} 部作品
            </span>
          </div>
        </div>
        <div className="screen-work-grid">
          {visibleWorks.length ? (
            visibleWorks.map((work) => (
              <article className="screen-work-card" key={work.id}>
                <div className="screen-work-art">
                  {work.coverUrl ? (
                    <img
                      src={work.coverUrl}
                      alt={`${work.title} 海报`}
                      decoding="async"
                      height="900"
                      loading="lazy"
                      width="600"
                    />
                  ) : (
                    <Film aria-hidden="true" size={34} />
                  )}
                  <span
                    className={`media-kind-badge media-kind-${work.mediaKind}`}
                  >
                    {work.mediaKind === "movie" ? "电影" : "电视剧"}
                  </span>
                </div>
                <div className="screen-work-copy">
                  <div className="screen-work-topline">
                    <span className="tiny-label">
                      {watchStatusLabel(work.watchStatus)}
                    </span>
                    <span>{work.mediaKind === "movie" ? "MOVIE" : "SERIES"}</span>
                  </div>
                  <h3>{work.title}</h3>
                  {work.aliases[0] ? <p>{work.aliases[0]}</p> : null}
                  <div className="screen-work-footer">
                    <div>
                      <span>私人评分</span>
                      <strong>{work.overallScore?.toFixed(1) ?? "未评分"}</strong>
                    </div>
                    <span className="screen-work-kind">
                      {work.mediaKind === "tv" && work.seasonCount > 0
                        ? `${work.seasonCount} 季`
                        : work.mediaKind === "tv"
                          ? "电视剧"
                          : "电影"}
                    </span>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <EmptyState
              icon={Film}
              title={works.length ? "这个分类还没有作品" : "尚无影视作品"}
              detail={
                works.length
                  ? "切换到其他影视类型，或从这里记录一部新作品。"
                  : "从一部电影或电视剧开始，首次记录会建立真实作品档案。"
              }
              actionLabel="新增影视作品"
              onAction={onOpenCapture}
            />
          )}
        </div>
      </section>
    </div>
  );
}

interface AnimeDetailPageProps {
  workId: string;
  entries: LedgerEntry[];
  works: AnimeWork[];
  navigate: (path: string) => void;
  onOpenCapture: () => void;
}

function AnimeDetailPage({
  workId,
  entries,
  works,
  navigate,
  onOpenCapture,
}: AnimeDetailPageProps) {
  const work = works.find((item) => item.id === workId);
  const relatedEntries = entries
    .filter((entry) => entry.mediaWorkId === workId && entry.status === "active")
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const recentScores = relatedEntries
    .filter((entry) => entry.score !== null)
    .slice(0, 8)
    .reverse()
    .map((entry) => entry.score as number);

  if (!work) {
    return (
      <div className="page">
        <EmptyState
          icon={Library}
          title="没有找到这部作品"
          detail="作品可能被合并或尚未导入。"
          actionLabel="返回动漫库"
          onAction={() => navigate(ROUTES.anime)}
        />
      </div>
    );
  }

  return (
    <div className="page anime-detail-page">
      <button className="back-button" type="button" onClick={() => navigate(ROUTES.anime)}>
        <ArrowLeft aria-hidden="true" size={16} />
        返回动漫库
      </button>

      <section
        className="work-detail-hero"
        style={{ "--work-accent": work.accent } as CSSProperties}
      >
        <div className="work-detail-cover">
          <img
            src={work.coverUrl}
            alt={`${work.title} 宣传海报`}
            decoding="async"
            fetchPriority="high"
            height="650"
            width="460"
          />
        </div>
        <div className="work-detail-copy">
          <div className="entry-card-topline">
            <span
              className={`watch-status status-${work.watchStatus ?? "unset"}`}
            >
              动漫 · {work.statusLabel}
            </span>
            <span>
              {work.lastLoggedAt
                ? `最后作品时间线 ${formatAnimeLastLoggedAt(work)}`
                : "尚无观看日志"}
            </span>
          </div>
          <h1>{work.title}</h1>
          <p className="anime-subtitle">{work.subtitle}</p>
          <p>{work.description}</p>
          <div className="alias-row">
            {work.aliases.map((alias) => (
              <span key={alias}>{alias}</span>
            ))}
          </div>
        </div>
        <div className="work-score-panel">
          <span>OVERALL</span>
          <strong>{work.overallScore?.toFixed(1) ?? "—"}</strong>
          <small>/ 10.0</small>
          {recentScores.length >= 2 ? (
            <div className="spark-bars" aria-label="最近真实评分变化">
              {recentScores.map((score, index) => (
                <i
                  key={`${score}-${index}`}
                  style={{ height: `${score * 10}%` }}
                />
              ))}
            </div>
          ) : (
            <span className="score-baseline">
              {recentScores.length === 1 ? "1 条评分基线" : "尚无评分样本"}
            </span>
          )}
        </div>
      </section>

      <section className="work-stats-grid">
        <div>
          <span>当前进度</span>
          <strong>{work.statusLabel}</strong>
        </div>
        <div>
          <span>观看记录</span>
          <strong>{relatedEntries.length || work.logCount}</strong>
        </div>
        <div>
          <span>公开记录</span>
          <strong>
            {
              relatedEntries.filter((entry) => entry.visibility === "public")
                .length
            }
          </strong>
        </div>
        <div>
          <span>评分范围</span>
          <strong>单集 · 整部作品</strong>
        </div>
      </section>

      <section className="work-log-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">WATCH LOG</p>
            <h2>评分与感想时间线</h2>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={onOpenCapture}
          >
            <Plus aria-hidden="true" size={16} />
            记录新一集
          </button>
        </div>
        <div className="episode-track">
          {relatedEntries.length ? (
            relatedEntries.map((entry) => (
              <button
                className="episode-card"
                key={entry.id}
                type="button"
                onClick={() => navigate(entryPath(entry.id))}
              >
                <div>
                  <span>
                    {entry.ratingScope === "episode"
                      ? `EP. ${entry.episodeLabel ?? "—"}`
                      : entry.ratingScope?.toUpperCase() ?? "NOTE"}
                  </span>
                  <StatusBadge visibility={entry.visibility} />
                </div>
                <strong>{entry.score?.toFixed(1) ?? "—"}</strong>
                <p>{entry.bodySummary}</p>
                <time>{formatEntryOccurredAt(entry)}</time>
              </button>
            ))
          ) : (
            <EmptyState
              icon={BookOpen}
              title="暂无可见观看记录"
              detail="记录第一条真实观看感想后，它会出现在这里。"
            />
          )}
        </div>
      </section>
    </div>
  );
}

interface EntryDetailPageProps {
  entryId: string;
  entries: LedgerEntry[];
  works: AnimeWork[];
  settings: LedgerSettings;
  navigate: (path: string) => void;
  onSoftDelete: (entryId: string) => void;
  onRestore: (entryId: string) => void;
  onSaveBody: (entryId: string, bodyRaw: string) => void;
  onPreparePublish: (entryId: string) => Promise<PendingAction>;
  onConfirmPublish: (
    entryId: string,
    actionId: string,
    confirmationCode: string,
  ) => Promise<void>;
  onUnpublish: (entryId: string) => void;
}

function EntryDetailPage({
  entryId,
  entries,
  works,
  settings,
  navigate,
  onSoftDelete,
  onRestore,
  onSaveBody,
  onPreparePublish,
  onConfirmPublish,
  onUnpublish,
}: EntryDetailPageProps) {
  const entry = entries.find((item) => item.id === entryId);
  const [tab, setTab] = useState<"fields" | "revisions" | "audit">("fields");
  const [editOpen, setEditOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [preparingPublish, setPreparingPublish] = useState(false);
  const [pendingPublish, setPendingPublish] = useState<PendingAction | null>(
    null,
  );
  const work = works.find((item) => item.id === entry?.mediaWorkId);
  const sensitiveMatch = entry
    ? settings.sensitiveWarning && hasSensitivePattern(`${entry.title}\n${entry.bodyRaw}`)
    : false;

  if (!entry) {
    return (
      <div className="page">
        <EmptyState
          icon={FileClock}
          title="没有找到这条记录"
          detail="记录可能已被永久清除，或当前路由 ID 不存在。"
          actionLabel="回到日常"
          onAction={() => navigate(ROUTES.timeline)}
        />
      </div>
    );
  }

  return (
    <div className="page entry-detail-page">
      <button className="back-button" type="button" onClick={() => navigate(ROUTES.timeline)}>
        <ArrowLeft aria-hidden="true" size={16} />
        回到日常
      </button>

      <header className="entry-detail-header">
        <div>
          <div className="entry-card-topline">
            <span className="entry-kind">
              <span className="entry-kind-dot" />
              {TYPE_LABELS[entry.type]}
            </span>
            <StatusBadge visibility={entry.visibility} status={entry.status} />
            <span>v{entry.versionNo}</span>
          </div>
          <h1>{entry.title}</h1>
          <p>
            发生于 {formatEntryOccurredAt(entry)} · 写入于{" "}
            {formatDateTime(entry.createdAt)}
          </p>
        </div>
        <div className="entry-detail-actions">
          {entry.status === "deleted" ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => onRestore(entry.id)}
            >
              <RotateCcw aria-hidden="true" size={16} />
              恢复为私人记录
            </button>
          ) : (
            <>
              {entry.visibility === "public" ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onUnpublish(entry.id)}
                >
                  <EyeOff aria-hidden="true" size={16} />
                  取消公开
                </button>
              ) : (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={preparingPublish}
                  onClick={() => {
                    setPreparingPublish(true);
                    void onPreparePublish(entry.id)
                      .then((action) => {
                        setPendingPublish(action);
                        setPublishOpen(true);
                      })
                      .catch(() => undefined)
                      .finally(() => setPreparingPublish(false));
                  }}
                >
                  <Globe2 aria-hidden="true" size={16} />
                  {preparingPublish ? "正在生成…" : "生成公开预览"}
                </button>
              )}
              <button
                className="primary-button"
                type="button"
                onClick={() => setEditOpen(true)}
              >
                校对原文
              </button>
              <button
                className="icon-button danger-ghost"
                type="button"
                aria-label="移到回收站"
                onClick={() => onSoftDelete(entry.id)}
              >
                <Trash2 aria-hidden="true" size={17} />
              </button>
            </>
          )}
        </div>
      </header>

      <section className="raw-source-card">
        <div className="raw-source-heading">
          <div>
            <span className="tiny-label">SOURCE OF TRUTH · 原始表达</span>
            <strong>原文不可被 AI 摘要覆盖</strong>
          </div>
          <span className="source-pill">
            <MessageCircleMore aria-hidden="true" size={13} />
            {SOURCE_LABELS[entry.sourceChannel]}
          </span>
        </div>
        <blockquote>{entry.bodyRaw}</blockquote>
        <EntryAttachments entry={entry} timeZone={currentTimeZone()} />
        <div className="raw-source-footer">
          <span>
            <Clock3 aria-hidden="true" size={13} />
            {formatDateTime(entry.createdAt)}
          </span>
          <span>
            ID · {entry.id}
            <button
              type="button"
              aria-label="复制记录 ID"
              onClick={() => void navigator.clipboard.writeText(entry.id)}
            >
              <Copy aria-hidden="true" size={13} />
            </button>
          </span>
        </div>
      </section>

      <div className="detail-layout">
        <section className="detail-main">
          <div className="tab-list" role="tablist" aria-label="记录详情">
            <button
              className={tab === "fields" ? "is-active" : ""}
              type="button"
              role="tab"
              id="entry-tab-fields"
              aria-controls="entry-tabpanel"
              aria-selected={tab === "fields"}
              onClick={() => setTab("fields")}
            >
              结构字段
            </button>
            <button
              className={tab === "revisions" ? "is-active" : ""}
              type="button"
              role="tab"
              id="entry-tab-revisions"
              aria-controls="entry-tabpanel"
              aria-selected={tab === "revisions"}
              onClick={() => setTab("revisions")}
            >
              修订历史
              <span>{entry.revisions.length}</span>
            </button>
            <button
              className={tab === "audit" ? "is-active" : ""}
              type="button"
              role="tab"
              id="entry-tab-audit"
              aria-controls="entry-tabpanel"
              aria-selected={tab === "audit"}
              onClick={() => setTab("audit")}
            >
              审计事件
              <span>{entry.audit.length}</span>
            </button>
          </div>

          <div
            id="entry-tabpanel"
            role="tabpanel"
            aria-labelledby={`entry-tab-${tab}`}
          >
            {tab === "fields" ? (
              <StructuredFields entry={entry} work={work} />
            ) : tab === "revisions" ? (
              <RevisionList entry={entry} />
            ) : (
              <AuditList entry={entry} />
            )}
          </div>
        </section>

        <aside className="detail-aside">
          <section className="aside-card">
            <span className="tiny-label">VISIBILITY</span>
            <div className="visibility-state">
              <StatusBadge visibility={entry.visibility} status={entry.status} />
              <strong>
                {entry.visibility === "private"
                  ? "只有你和授权 Agent 可读取"
                  : entry.visibility === "publish_pending"
                    ? "预览已生成，尚未进入公开 API"
                    : "已进入公开白名单投影"}
              </strong>
            </div>
            <div className="state-track">
              <i className="is-done" />
              <i className={entry.visibility !== "private" ? "is-done" : ""} />
              <i className={entry.visibility === "public" ? "is-done" : ""} />
            </div>
            <div className="state-labels">
              <span>私人</span>
              <span>待确认</span>
              <span>公开</span>
            </div>
          </section>

          <section className="aside-card">
            <span className="tiny-label">TAGS</span>
            <div className="large-tag-row">
              {entry.tags.map((tag) => (
                <span key={tag}>
                  <Tag aria-hidden="true" size={12} />
                  {displayTag(tag).replace(/^#/, "")}
                </span>
              ))}
            </div>
          </section>

          <section
            className={`aside-card safety-card${sensitiveMatch ? " is-warning" : ""}`}
          >
            {sensitiveMatch ? (
              <CircleAlert aria-hidden="true" size={19} />
            ) : (
              <ShieldCheck aria-hidden="true" size={19} />
            )}
            <div>
              <strong>发布安全检查</strong>
              <span>
                {sensitiveMatch
                  ? "检测到可能的邮箱、手机号或访问令牌；请在公开前复核。"
                  : settings.sensitiveWarning
                    ? "未发现邮箱、手机号或访问令牌模式。"
                    : "敏感信息模式检查已关闭；仍需人工复核公开预览。"}
              </span>
            </div>
          </section>
        </aside>
      </div>

      <EditEntryDialog
        entry={entry}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSave={(body) => {
          onSaveBody(entry.id, body);
          setEditOpen(false);
        }}
      />
      <PublishDialog
        entry={entry}
        work={work}
        pendingAction={pendingPublish}
        open={publishOpen}
        onClose={() => {
          setPublishOpen(false);
          setPendingPublish(null);
          void onUnpublish(entry.id);
        }}
        onConfirm={async () => {
          if (!pendingPublish) {
            return;
          }
          await onConfirmPublish(
            entry.id,
            pendingPublish.actionId,
            pendingPublish.confirmationCode,
          );
          setPendingPublish(null);
          setPublishOpen(false);
        }}
        sensitiveMatch={sensitiveMatch}
      />
    </div>
  );
}

interface StructuredFieldsProps {
  entry: LedgerEntry;
  work: AnimeWork | undefined;
}

function StructuredFields({ entry, work }: StructuredFieldsProps) {
  const fields = [
    ["记录类型", TYPE_LABELS[entry.type]],
    ["关联作品", work?.title ?? "—"],
    ["评分范围", entry.ratingScope ?? "—"],
    ["评分", entry.score === null ? "—" : `${entry.score.toFixed(1)} / 10`],
    [
      "季度 / 集数",
      entry.seasonLabel || entry.episodeLabel
        ? `S${entry.seasonLabel ?? "—"} · EP${entry.episodeLabel ?? "—"}`
        : "—",
    ],
    ["发生时间", formatEntryOccurredAt(entry)],
    ["来源渠道", SOURCE_LABELS[entry.sourceChannel]],
    ["来源消息", entry.sourceMessageId ?? "网页创建，无消息 ID"],
  ] as const;
  return (
    <div className="structured-fields">
      {fields.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function RevisionList({ entry }: { entry: LedgerEntry }) {
  return (
    <div className="history-list">
      {[...entry.revisions]
        .sort((a, b) => b.versionNo - a.versionNo)
        .map((revision) => (
        <article key={revision.id}>
          <div className="history-marker">
            <History aria-hidden="true" size={15} />
          </div>
          <div>
            <div className="history-topline">
              <strong>版本 {revision.versionNo}</strong>
              <time>{formatDateTime(revision.createdAt)}</time>
            </div>
            <p>{revision.bodyRaw}</p>
            <span>
              {revision.actor} · {revision.reason}
            </span>
          </div>
        </article>
        ))}
    </div>
  );
}

function AuditList({ entry }: { entry: LedgerEntry }) {
  return (
    <div className="history-list audit-list">
      {entry.audit.map((event) => (
        <article key={event.id}>
          <div className="history-marker">
            <ShieldCheck aria-hidden="true" size={15} />
          </div>
          <div>
            <div className="history-topline">
              <strong>{event.action}</strong>
              <time>{formatDateTime(event.createdAt)}</time>
            </div>
            <p>{event.detail}</p>
            <span>{event.actor}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

interface SearchPageProps {
  entries: LedgerEntry[];
  works: AnimeWork[];
  navigate: (path: string) => void;
}

function SearchPage({ entries, works, navigate }: SearchPageProps) {
  const [filters, setFilters] = useState<SearchFilters>({
    query: "",
    type: "all",
    visibility: "all",
    score: "all",
  });

  const results = entries.filter((entry) => {
    if (entry.status !== "active") {
      return false;
    }
    const work = works.find((item) => item.id === entry.mediaWorkId);
    const haystack = [
      entry.title,
      entry.bodyRaw,
      entry.bodySummary,
      entry.tags.join(" "),
      work?.title ?? "",
      work?.aliases.join(" ") ?? "",
    ]
      .join(" ")
      .toLocaleLowerCase("zh-CN");
    const queryMatches = haystack.includes(
      filters.query.trim().toLocaleLowerCase("zh-CN"),
    );
    const typeMatches = filters.type === "all" || entry.type === filters.type;
    const visibilityMatches =
      filters.visibility === "all" ||
      entry.visibility === filters.visibility;
    const scoreMatches =
      filters.score === "all" ||
      (filters.score === "high" && (entry.score ?? 0) >= 9) ||
      (filters.score === "low" &&
        entry.score !== null &&
        entry.score < 8.5);
    return queryMatches && typeMatches && visibilityMatches && scoreMatches;
  });

  return (
    <div className="page search-page">
      <PageHeader
        eyebrow="STRUCTURED RETRIEVAL"
        title="搜索"
        description="MVP 只使用关键词与结构化筛选；所有命中都返回原文摘录和日期。"
      />

      <section className="search-workbench">
        <div className="large-search-input">
          <Search aria-hidden="true" size={22} />
          <input
            autoFocus
            type="search"
            value={filters.query}
            placeholder="搜索标题、原文、标签、作品或别名…"
            aria-label="搜索记录"
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                query: event.target.value,
              }))
            }
          />
          {filters.query ? (
            <button
              type="button"
              aria-label="清空搜索"
              onClick={() =>
                setFilters((current) => ({ ...current, query: "" }))
              }
            >
              <X aria-hidden="true" size={17} />
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </div>
        <div className="search-filter-grid">
          <SearchSelect
            label="类型"
            value={filters.type}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                type: value as SearchFilters["type"],
              }))
            }
            options={[
              ["all", "全部类型"],
              ...ENTRY_TYPES.map((type) => [type, TYPE_LABELS[type]] as const),
            ]}
          />
          <SearchSelect
            label="可见性"
            value={filters.visibility}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                visibility: value as SearchFilters["visibility"],
              }))
            }
            options={[
              ["all", "全部状态"],
              ["private", "私人"],
              ["publish_pending", "待确认"],
              ["public", "公开"],
            ]}
          />
          <SearchSelect
            label="评分"
            value={filters.score}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                score: value as SearchFilters["score"],
              }))
            }
            options={[
              ["all", "全部评分"],
              ["high", "9.0 以上"],
              ["low", "8.5 以下"],
            ]}
          />
          <button
            className="clear-filter-button"
            type="button"
            onClick={() =>
              setFilters({
                query: "",
                type: "all",
                visibility: "all",
                score: "all",
              })
            }
          >
            <RotateCcw aria-hidden="true" size={15} />
            重置
          </button>
        </div>
      </section>

      <section className="search-results">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">RESULTS</p>
            <h2>{results.length} 条匹配记录</h2>
          </div>
          <span className="search-explainer">
            <Sparkles aria-hidden="true" size={15} />
            语义搜索将在 P1 启用
          </span>
        </div>
        <div className="search-result-list">
          {results.length ? (
            results.map((entry) => (
              <EntryCard
                compact
                key={entry.id}
                entry={entry}
                work={works.find((work) => work.id === entry.mediaWorkId)}
                onOpen={() => navigate(entryPath(entry.id))}
              />
            ))
          ) : (
            <EmptyState
              icon={Search}
              title="没有找到匹配记录"
              detail="试试作品别名、原文中的一个短语，或放宽评分和可见性条件。"
            />
          )}
        </div>
      </section>
    </div>
  );
}

interface AnimeSelectProps {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  hideLabel?: boolean;
}

function AnimeSelect({
  label,
  value,
  options,
  onChange,
  className = "",
  disabled = false,
  hideLabel = false,
}: AnimeSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex(([optionValue]) => optionValue === value),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const reactId = useId().replaceAll(":", "");
  const labelId = `anime-select-label-${reactId}`;
  const valueId = `anime-select-value-${reactId}`;
  const listboxId = `anime-select-listbox-${reactId}`;

  useEffect(() => {
    if (!open) {
      return;
    }
    setActiveIndex(selectedIndex);
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open, selectedIndex]);

  const commit = (index: number) => {
    const option = options[index];
    if (!option) {
      return;
    }
    onChange(option[0]);
    setOpen(false);
  };

  const handleKeys = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (!open) {
        setOpen(true);
        setActiveIndex(selectedIndex);
        return;
      }
      setActiveIndex(
        (index) => (index + direction + options.length) % options.length,
      );
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) {
        commit(activeIndex);
      } else {
        setOpen(true);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  const selectedLabel = options[selectedIndex]?.[1] ?? "请选择";

  return (
    <div
      className={`anime-select ${open ? "is-open" : ""} ${className}`.trim()}
      ref={rootRef}
    >
      <span
        className={hideLabel ? "anime-select-label sr-only" : "anime-select-label"}
        id={labelId}
      >
        {label}
      </span>
      <button
        className="anime-select-trigger"
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-activedescendant={
          open ? `${listboxId}-option-${activeIndex}` : undefined
        }
        disabled={disabled}
        onClick={() => setOpen((shown) => !shown)}
        onKeyDown={handleKeys}
      >
        <span id={valueId}>{selectedLabel}</span>
        <ChevronDown aria-hidden="true" size={15} />
      </button>
      {open ? (
        <div className="anime-select-menu" id={listboxId} role="listbox">
          {options.map(([optionValue, optionLabel], index) => (
            <button
              className={[
                "anime-select-option",
                index === activeIndex ? "is-active" : "",
                optionValue === value ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              id={`${listboxId}-option-${index}`}
              key={optionValue}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={optionValue === value}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commit(index)}
            >
              <span>{optionLabel}</span>
              {optionValue === value ? (
                <Check aria-hidden="true" size={14} />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface SearchSelectProps {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}

function SearchSelect({ label, value, options, onChange }: SearchSelectProps) {
  return (
    <AnimeSelect
      className="search-select"
      label={label}
      value={value}
      options={options}
      onChange={onChange}
    />
  );
}

function ImportsPage({
  pushToast,
}: {
  pushToast: RenderRouteProps["pushToast"];
}) {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "ready" | "running" | "reported" | "committed"
  >("idle");
  const [sourceRecords, setSourceRecords] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [parseError, setParseError] = useState("");
  const [report, setReport] = useState<ImportDryRunReport | null>(null);

  const readSourceFile = async (file: File) => {
    setParseError("");
    setReport(null);
    try {
      const text = await file.text();
      const extension = file.name.split(".").at(-1)?.toLowerCase();
      let records: Array<Record<string, unknown>> = [];
      if (extension === "json") {
        const parsed: unknown = JSON.parse(text);
        const candidate =
          Array.isArray(parsed)
            ? parsed
            : typeof parsed === "object" && parsed !== null
              ? "items" in parsed && Array.isArray(parsed.items)
                ? parsed.items
                : "data" in parsed && Array.isArray(parsed.data)
                  ? parsed.data
                  : "works" in parsed && Array.isArray(parsed.works)
                    ? parsed.works
                    : [parsed]
              : [];
        records = candidate.filter(
          (item): item is Record<string, unknown> =>
            typeof item === "object" && item !== null && !Array.isArray(item),
        );
      } else if (extension === "csv") {
        const lines = text.split(/\r?\n/).filter((line) => line.trim());
        const headers = lines[0]?.split(",").map((value) => value.trim()) ?? [];
        records = lines.slice(1).map((line) =>
          Object.fromEntries(
            line.split(",").map((value, index) => {
              const key = headers[index] || `column_${index + 1}`;
              const trimmed = value.trim();
              const numeric = Number(trimmed);
              return [key, trimmed !== "" && Number.isFinite(numeric) ? numeric : trimmed];
            }),
          ),
        );
      } else {
        records = [...text.matchAll(/\btitle\s*:\s*["'`]([^"'`]+)["'`]/g)].map(
          (match) => ({ title: match[1] }),
        );
      }
      if (!records.length) {
        throw new Error("没有识别到可导入的对象或 title 字段。");
      }
      if (records.length > 5_000) {
        throw new Error("单次最多处理 5,000 条记录。");
      }
      setSourceRecords(records);
      setPhase("ready");
    } catch (error: unknown) {
      setSourceRecords([]);
      setPhase("idle");
      setParseError(error instanceof Error ? error.message : "无法读取源文件。");
    }
  };

  const startDryRun = async () => {
    if (!sourceFile || !sourceRecords.length) {
      return;
    }
    setPhase("running");
    pushToast("info", "正在执行 dry-run", "只写入 staging 报告，不会修改事实表。");
    try {
      const nextReport = await apiCreateImportDryRun(
        sourceFile.name,
        sourceRecords,
      );
      setReport(nextReport);
      setPhase("reported");
    } catch (error: unknown) {
      setPhase("ready");
      pushToast(
        "danger",
        "dry-run 失败",
        error instanceof Error ? error.message : "请求失败。",
      );
    }
  };

  const commitImport = async () => {
    if (!report) {
      return;
    }
    try {
      const committed = await apiCommitImport(report.batchId);
      setReport(committed);
      setPhase("committed");
      pushToast(
        "success",
        "已写入动漫资料库",
        "有效记录已幂等写入事实表，重复标题不会产生第二份数据。",
      );
    } catch (error: unknown) {
      pushToast(
        "danger",
        "提交失败",
        error instanceof Error ? error.message : "请求失败。",
      );
    }
  };

  return (
    <div className="page imports-page">
      <PageHeader
        eyebrow="MIGRATION WORKBENCH"
        title="导入"
        description="先预览、再去重、最后确认。模糊标题只进入报告，绝不自动合并。"
      />

      <section className="integration-grid">
        <article className="integration-card is-primary">
          <div className="integration-icon">
            <FileJson aria-hidden="true" size={24} />
          </div>
          <span className="tiny-label">STEP 01 · SOURCE</span>
          <h2>现有动漫 JSON / TS</h2>
          <p>读取主站硬编码数据，保留原文件，并为每行生成稳定来源哈希。</p>
          <label className="file-drop">
            <UploadCloud aria-hidden="true" size={22} />
            <strong>{sourceFile ? sourceFile.name : "选择文件或拖到这里"}</strong>
            <span>JSON、TS 或 CSV · 最大 10 MB</span>
            <input
              type="file"
              accept=".json,.ts,.csv"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setSourceFile(file);
                setPhase("idle");
                setSourceRecords([]);
                if (file) {
                  void readSourceFile(file);
                }
              }}
            />
          </label>
          {parseError ? <p className="form-error" role="alert">{parseError}</p> : null}
        </article>

        <article className="integration-card">
          <div className="integration-icon">
            <RefreshCw aria-hidden="true" size={24} />
          </div>
          <span className="tiny-label">STEP 02 · DRY-RUN</span>
          <h2>字段映射与去重</h2>
          <p>exact normalized_title 可匹配；别名辅助判断；模糊项等待人工复核。</p>
          <ul className="check-list">
            <li>
              <Check aria-hidden="true" size={14} /> 不修改生产数据
            </li>
            <li>
              <Check aria-hidden="true" size={14} /> 评分范围校验
            </li>
            <li>
              <Check aria-hidden="true" size={14} /> 条数对账
            </li>
          </ul>
          <button
            className="secondary-button"
            type="button"
            disabled={!sourceFile || !sourceRecords.length || phase === "running"}
            onClick={() => void startDryRun()}
          >
            {phase === "running" ? "正在分析…" : "运行 dry-run"}
            <ArrowRight aria-hidden="true" size={15} />
          </button>
        </article>

        <article className="integration-card">
          <div className="integration-icon">
            <Database aria-hidden="true" size={24} />
          </div>
          <span className="tiny-label">STEP 03 · COMMIT</span>
          <h2>确认写入资料库</h2>
          <p>每批导入带 import_batch_id，可安全重试；重复标题跳过并生成完整审计。</p>
          {phase === "reported" ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => void commitImport()}
            >
              <Check aria-hidden="true" size={16} />
              确认写入资料库
            </button>
          ) : phase === "committed" ? (
            <div className="locked-action">
              <Check aria-hidden="true" size={17} />
              资料库写入完成
            </div>
          ) : (
            <div className="locked-action">
              <LockKeyhole aria-hidden="true" size={17} />
              完成 dry-run 后解锁
            </div>
          )}
        </article>
      </section>

      {(phase === "reported" || phase === "committed") && report ? (
        <section className="import-report">
          <div className="report-heading">
            <div className="success-ring">
              <Check aria-hidden="true" size={22} />
            </div>
            <div>
              <p className="eyebrow">DRY-RUN COMPLETE</p>
              <h2>
                {phase === "committed" ? "资料库写入完成" : "预览完成，尚未写入"}
              </h2>
            </div>
            <span>
              源文件 {report.total} 条 = {report.newRecords} 新增 +{" "}
              {report.duplicates} 重复 + {report.errors} 错误
            </span>
          </div>
          <div className="report-metrics">
            <div className="report-good">
              <strong>{report.newRecords}</strong>
              <span>可新增作品</span>
            </div>
            <div className="report-warn">
              <strong>{report.duplicates}</strong>
              <span>精确标题重复</span>
            </div>
            <div className="report-danger">
              <strong>{report.errors}</strong>
              <span>无效评分</span>
            </div>
            <div>
              <strong>{report.ambiguous}</strong>
              <span>自动模糊合并</span>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

interface ExportsPageProps {
  exports: ExportRecord[];
  onCreateExport: () => void;
  pushToast: RenderRouteProps["pushToast"];
}

function ExportsPage({ exports, onCreateExport, pushToast }: ExportsPageProps) {
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const completedExports = exports.filter(
    (record) => record.status === "completed",
  );
  const latestCompleted = completedExports[0] ?? null;
  const verifyLatest = async () => {
    if (!latestCompleted) {
      return;
    }
    setVerifyingId(latestCompleted.id);
    try {
      const result = await apiVerifyExport(latestCompleted.id);
      pushToast(
        result.verified ? "success" : "danger",
        result.verified ? "R2 归档校验通过" : "R2 归档校验失败",
        result.verified
          ? `${result.sizeBytes.toLocaleString("zh-CN")} 字节与 ${result.expectedChecksum.slice(0, 16)}… 匹配。`
          : `期望 ${result.expectedChecksum.slice(0, 12)}…，实际 ${result.computedChecksum.slice(0, 12)}…。`,
      );
    } catch (error: unknown) {
      pushToast(
        "danger",
        "归档校验失败",
        error instanceof Error ? error.message : "请求失败。",
      );
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className="page exports-page">
      <PageHeader
        eyebrow="DATA PORTABILITY"
        title="导出与备份"
        description="D1 Time Travel 处理短期回滚，R2 / 本地归档保障长期数据主权。两者缺一不可。"
        actions={
          <button className="primary-button" type="button" onClick={onCreateExport}>
            <FileArchive aria-hidden="true" size={17} />
            创建完整导出
          </button>
        }
      />

      <LocalBackupPanel />

      <section className="backup-health">
        <div className="backup-score">
          <div className="score-circle">
            <ShieldCheck aria-hidden="true" size={28} />
          </div>
          <div>
            <span className="tiny-label">BACKUP HEALTH</span>
            <h2>
              {latestCompleted ? "最近一次归档已完成" : "等待首次完整归档"}
            </h2>
            <p>
              {latestCompleted
                ? `${formatDateTime(latestCompleted.createdAt)} 生成 ${latestCompleted.rowCount} 行归档；下一次每日增量将在 03:20 运行。`
                : "尚无已完成导出。创建一次完整导出后，这里才会显示真实 R2 与校验状态。"}
            </p>
          </div>
        </div>
        <div className="backup-checks">
          <div>
            <Check aria-hidden="true" size={15} />
            <span>D1 Time Travel</span>
            <strong>自动启用</strong>
          </div>
          <div>
            {latestCompleted ? (
              <Check aria-hidden="true" size={15} />
            ) : (
              <Clock3 aria-hidden="true" size={15} />
            )}
            <span>R2 私有归档</span>
            <strong>
              {latestCompleted
                ? `最后成功 ${formatDateTime(latestCompleted.createdAt)}`
                : "等待首次导出"}
            </strong>
          </div>
          <div>
            {latestCompleted?.checksum ? (
              <Check aria-hidden="true" size={15} />
            ) : (
              <Clock3 aria-hidden="true" size={15} />
            )}
            <span>Checksum</span>
            <strong title={latestCompleted?.checksum ?? undefined}>
              {latestCompleted?.checksum
                ? `${latestCompleted.checksum.slice(0, 18)}…`
                : "尚未生成"}
            </strong>
          </div>
        </div>
      </section>

      <section className="backup-schedule-grid">
        <BackupScheduleCard
          icon={Zap}
          title="每日增量"
          time="每天 03:20"
          detail="JSONL.gz · 保留 30 天"
          tone="cyan"
        />
        <BackupScheduleCard
          icon={Database}
          title="每周完整 SQL"
          time="周日 04:00"
          detail="SQL.gz + SHA-256 · 保留 12 周"
          tone="purple"
        />
        <BackupScheduleCard
          icon={Archive}
          title="每月长期归档"
          time="每月 1 日"
          detail="SQL + JSON + manifest · 长期保留"
          tone="amber"
        />
      </section>

      <section className="export-history">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">EXPORT HISTORY</p>
            <h2>导出记录</h2>
          </div>
          <button
            className="text-button"
            type="button"
            disabled={!latestCompleted?.checksum}
            onClick={() => void verifyLatest()}
          >
            <ShieldCheck aria-hidden="true" size={15} />
            {verifyingId ? "正在重算 SHA-256…" : "重新计算校验"}
          </button>
        </div>
        <div className="data-table export-table">
          <div className="table-row table-head">
            <span>创建时间</span>
            <span>类型</span>
            <span>行数</span>
            <span>大小</span>
            <span>校验</span>
            <span>状态</span>
            <span />
          </div>
          {exports.map((record) => (
            <div className="table-row" key={record.id}>
              <span>{formatDateTime(record.createdAt)}</span>
              <span>
                <FileArchive aria-hidden="true" size={15} />
                {record.scope === "full" ? "完整" : "增量"} ·{" "}
                {record.format.toUpperCase()}
              </span>
              <span>{record.rowCount}</span>
              <span>{record.size}</span>
              <span className="mono-value" title={record.checksum ?? undefined}>
                {record.checksum
                  ? `${record.checksum.slice(0, 20)}…`
                  : "生成中"}
              </span>
              <span>
                <span className={`job-status job-${record.status}`}>
                  {record.status === "completed"
                    ? "已完成"
                    : record.status === "running"
                      ? "运行中"
                      : record.status === "pending"
                        ? "排队中"
                        : "失败"}
                </span>
              </span>
              <button
                type="button"
                aria-label={`下载 ${record.id}`}
                disabled={record.status !== "completed"}
                onClick={() => window.location.assign(exportDownloadUrl(record.id))}
              >
                <Download aria-hidden="true" size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

interface BackupScheduleCardProps {
  icon: LucideIcon;
  title: string;
  time: string;
  detail: string;
  tone: "cyan" | "purple" | "amber";
}

function BackupScheduleCard({
  icon: Icon,
  title,
  time,
  detail,
  tone,
}: BackupScheduleCardProps) {
  return (
    <article className={`backup-schedule-card tone-${tone}`}>
      <Icon aria-hidden="true" size={20} />
      <div>
        <span>{title}</span>
        <strong>{time}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

interface TrashPageProps {
  entries: LedgerEntry[];
  navigate: (path: string) => void;
  onRestore: (entryId: string) => void;
  onPurge: (entryId: string) => void;
}

function TrashPage({
  entries,
  navigate,
  onRestore,
  onPurge,
}: TrashPageProps) {
  const deleted = entries.filter((entry) => entry.status === "deleted");
  const [purgeTarget, setPurgeTarget] = useState<LedgerEntry | null>(null);

  return (
    <div className="page trash-page">
      <PageHeader
        eyebrow="RECOVERABLE DELETION"
        title="回收站"
        description="删除默认只是软删除。恢复后的记录始终回到私人状态，避免意外重新公开。"
      />

      <div className="notice-banner danger-notice">
        <CircleAlert aria-hidden="true" size={18} />
        <div>
          <strong>永久清除不可撤销</strong>
          <span>必须输入完整记录 ID 才能执行；公开记录会先取消公开。</span>
        </div>
      </div>

      <section className="trash-list">
        {deleted.length ? (
          deleted.map((entry) => (
            <article className="trash-card" key={entry.id}>
              <div className="trash-icon">
                <Trash2 aria-hidden="true" size={19} />
              </div>
              <button
                className="trash-main"
                type="button"
                onClick={() => navigate(entryPath(entry.id))}
              >
                <span className="tiny-label">{TYPE_LABELS[entry.type]} · {formatEntryOccurredAt(entry)}</span>
                <strong>{entry.title}</strong>
                <p>{entry.bodySummary}</p>
              </button>
              <div className="trash-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onRestore(entry.id)}
                >
                  <RotateCcw aria-hidden="true" size={15} />
                  恢复为私人
                </button>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => setPurgeTarget(entry)}
                >
                  永久清除
                </button>
              </div>
            </article>
          ))
        ) : (
          <EmptyState
            icon={Trash2}
            title="回收站是空的"
            detail="已删除记录会出现在这里，并保留恢复入口。"
          />
        )}
      </section>

      <PurgeDialog
        entry={purgeTarget}
        onClose={() => setPurgeTarget(null)}
        onConfirm={(entryId) => {
          onPurge(entryId);
          setPurgeTarget(null);
        }}
      />
    </div>
  );
}

interface SettingsPageProps {
  settings: LedgerSettings;
  updateSettings: (settings: LedgerSettings) => void;
  navigate: (path: string) => void;
}

function SettingsPage({
  settings,
  updateSettings,
  navigate,
}: SettingsPageProps) {
  const patchSettings = (patch: Partial<LedgerSettings>) =>
    updateSettings({ ...settings, ...patch });

  return (
    <div className="page settings-page">
      <PageHeader
        eyebrow="SYSTEM PREFERENCES"
        title="设置"
        description="控制写入触发、时区、发布保护和备份保留。凭证只存在 Cloudflare / VPS 环境中。"
        actions={
          <span className="settings-auto-save">
            <Check aria-hidden="true" size={15} />
            更改自动保存
          </span>
        }
      />

      <div className="settings-layout">
        <div className="settings-content">
          <SettingsSection
            id="capture"
            icon={MessageCircleMore}
            eyebrow="CAPTURE"
            title="录入与时区"
            description="系统核心不依赖微信；任何入口都遵循同一事实模型。"
          >
            <div className="setting-row">
              <div>
                <strong>用户时区</strong>
                <span>按此时区分组日期；数据库仍统一保存 UTC。</span>
              </div>
              <AnimeSelect
                className="settings-select"
                label="选择用户时区"
                hideLabel
                value={settings.timezone}
                onChange={(value) => patchSettings({ timezone: value })}
                options={[
                  ["Asia/Tokyo", "Asia/Tokyo · UTC+9"],
                  ["Asia/Singapore", "Asia/Singapore · UTC+8"],
                  ["Asia/Shanghai", "Asia/Shanghai · UTC+8"],
                ]}
              />
            </div>
            <div className="setting-row">
              <div>
                <strong>安全触发模式</strong>
                <span>必须包含“记一下 / 记录 / 存一下”或使用 /log。</span>
              </div>
              <SegmentedControl
                value={settings.captureMode}
                options={[
                  ["safe", "安全模式"],
                  ["quick_media", "快速媒体"],
                ]}
                onChange={(value) =>
                  patchSettings({
                    captureMode: value as LedgerSettings["captureMode"],
                  })
                }
              />
            </div>
          </SettingsSection>

          <SettingsSection
            id="publish"
            icon={Globe2}
            eyebrow="PUBLICATION"
            title="公开规则"
            description="公开是唯一必须双步骤确认的日常操作。"
          >
            <ToggleRow
              checked
              title="始终生成公开预览"
              detail="安全基线：先显示最终公开文本、评分、日期和目标页面，不能关闭。"
              onChange={() => undefined}
              disabled
            />
            <ToggleRow
              checked={settings.sensitiveWarning}
              title="敏感信息模式检查"
              detail="检测邮箱、手机号、地址、订单号和访问令牌模式。"
              onChange={(checked) =>
                patchSettings({ sensitiveWarning: checked })
              }
            />
            <ToggleRow
              checked={settings.weeklyReview}
              title="每周私人回顾草稿"
              detail="只统计可追溯主题，不推送、不公开、不做医学诊断。"
              onChange={(checked) => patchSettings({ weeklyReview: checked })}
            />
          </SettingsSection>

          <SettingsSection
            id="clients"
            icon={ShieldCheck}
            eyebrow="AUTH"
            title="登录与 Agent 客户端"
            description="网页使用固定密码会话；每个 Agent 使用独立 Access 客户端和审计 actor_id。"
          >
            <div className="client-card">
              <div className="client-icon">
                <MessageCircleMore aria-hidden="true" size={20} />
              </div>
              <div>
                <strong>Hermes Agent</strong>
                <span>Cloudflare Access 或双栈 IP 白名单 · 已启用</span>
              </div>
              <div className="scope-row">
                <span>entries:write</span>
                <span>entries:read</span>
                <span>publish:prepare</span>
                <span>已配置 2 个地址</span>
              </div>
              <span className="job-status job-completed">有效</span>
            </div>
            <div className="client-card">
              <div className="client-icon">
                <UserRound aria-hidden="true" size={20} />
              </div>
              <div>
                <strong>网页管理端</strong>
                <span>固定密码 · 12 小时签名会话</span>
              </div>
              <div className="scope-row">
                <span>full:private</span>
                <span>publish:confirm</span>
              </div>
              <span className="job-status job-completed">有效</span>
            </div>
          </SettingsSection>

          <SettingsSection
            id="backup"
            icon={Cloud}
            eyebrow="RETENTION"
            title="备份保留"
            description="生命周期只清理短期增量，不自动删除长期月度归档。"
          >
            <div className="setting-row">
              <div>
                <strong>每日增量保留天数</strong>
                <span>到期后由 R2 生命周期规则清理。</span>
              </div>
              <input
                aria-label="每日增量保留天数"
                type="number"
                min="7"
                max="90"
                value={settings.retentionDaily}
                onChange={(event) =>
                  patchSettings({ retentionDaily: Number(event.target.value) })
                }
              />
            </div>
            <div className="setting-row">
              <div>
                <strong>每周完整备份数量</strong>
                <span>默认保留 12 周；月度归档不受影响。</span>
              </div>
              <input
                aria-label="每周完整备份数量"
                type="number"
                min="4"
                max="52"
                value={settings.retentionWeekly}
                onChange={(event) =>
                  patchSettings({ retentionWeekly: Number(event.target.value) })
                }
              />
            </div>
          </SettingsSection>

          <SettingsSection
            id="danger"
            icon={CircleAlert}
            eyebrow="DANGER ZONE"
            title="危险区"
            description="影响不可逆或可能扩大数据暴露面的操作。"
            danger
          >
            <div className="setting-row">
              <div>
                <strong>永久清理回收站</strong>
                <span>逐条文本确认后删除业务行与关联附件。</span>
              </div>
              <button
                className="danger-button"
                type="button"
                onClick={() => navigate(ROUTES.trash)}
              >
                打开清理流程
              </button>
            </div>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}

interface SettingsSectionProps {
  id: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  danger?: boolean;
}

function SettingsSection({
  id,
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
  danger = false,
}: SettingsSectionProps) {
  return (
    <section className={danger ? "settings-section is-danger" : "settings-section"} id={id}>
      <header>
        <div className="settings-section-icon">
          <Icon aria-hidden="true" size={19} />
        </div>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

interface ToggleRowProps {
  checked: boolean;
  title: string;
  detail: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({
  checked,
  title,
  detail,
  onChange,
  disabled = false,
}: ToggleRowProps) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <button
        className={checked ? "toggle is-on" : "toggle"}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

interface SegmentedControlProps {
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}

function SegmentedControl({
  value,
  options,
  onChange,
}: SegmentedControlProps) {
  return (
    <div className="segmented-control">
      {options.map(([optionValue, label]) => (
        <button
          className={value === optionValue ? "is-active" : ""}
          key={optionValue}
          type="button"
          aria-pressed={value === optionValue}
          onClick={() => onChange(optionValue)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}

function EmptyState({
  icon: Icon,
  title,
  detail,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon aria-hidden="true" size={23} />
      </div>
      <strong>{title}</strong>
      <p>{detail}</p>
      {actionLabel && onAction ? (
        <button className="secondary-button" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

interface QuickCaptureDialogProps {
  open: boolean;
  works: AnimeWork[];
  initial: CaptureDraftSeed | null;
  onClose: () => void;
  onSubmit: (draft: CaptureDraft) => void;
}

function initialCaptureDraft(
  works: AnimeWork[],
  seed: CaptureDraftSeed | null,
): CaptureDraft {
  return {
    type: seed?.type ?? (works.length ? "anime" : "note"),
    title: "",
    bodyRaw: seed?.bodyRaw ?? "",
    score: "",
    workId: works[0]?.id ?? "",
    mediaKind: "movie",
    ratingScope: "work",
    seasonId: "",
    seasonLabel: "",
    episodeLabel: "",
    mediaIds: seed?.mediaIds ?? [],
  };
}

function QuickCaptureDialog({
  open,
  works,
  initial,
  onClose,
  onSubmit,
}: QuickCaptureDialogProps) {
  const [draft, setDraft] = useState<CaptureDraft>(() =>
    initialCaptureDraft(works, initial),
  );

  useEffect(() => {
    if (open) {
      setDraft(initialCaptureDraft(works, initial));
    }
  }, [open, works, initial]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.bodyRaw.trim()) {
      return;
    }
    onSubmit(draft);
  };

  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog-panel capture-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
      >
        <div className="capture-scene" aria-hidden="true">
          <span className="capture-scene-index">LOG / PRIVATE / 01</span>
          <div className="capture-scene-message">
            <small>MEMORY BEFORE INTERPRETATION</small>
            <strong>把此刻先留住。</strong>
            <span>结构可以晚一点，原文不应该消失。</span>
          </div>
          <img
            className="capture-character capture-character-one"
            src="/assets/anime-ui/kakekoi-character-1.png"
            alt=""
          />
          <img
            className="capture-character capture-character-two"
            src="/assets/anime-ui/kakekoi-character-2.png"
            alt=""
          />
        </div>
        <header className="dialog-header">
          <div>
            <p className="eyebrow">QUICK CAPTURE</p>
            <h2 id="capture-title">新建私人记录</h2>
            <p>先保存原文，结构字段可以稍后校对。</p>
          </div>
          <button className="icon-button" type="button" aria-label="关闭" onClick={onClose}>
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="capture-type-grid">
            {ENTRY_TYPES.map((type) => (
              <button
                className={draft.type === type ? "is-active" : ""}
                key={type}
                type="button"
                aria-pressed={draft.type === type}
                onClick={() =>
                  setDraft((current) => {
                    if (current.type === type) {
                      return current;
                    }
                    if (type === "anime") {
                      return {
                        ...current,
                        type,
                        ratingScope: "work",
                        seasonId: "",
                        seasonLabel: "",
                        episodeLabel: "",
                      };
                    }
                    if (type === "screen") {
                      return {
                        ...current,
                        type,
                        mediaKind: "movie",
                        ratingScope: "work",
                        seasonId: "",
                        seasonLabel: "",
                        episodeLabel: "",
                      };
                    }
                    return { ...current, type };
                  })
                }
              >
                {TYPE_LABELS[type]}
              </button>
            ))}
          </div>
          <label className="form-field">
            <span>原始表达 <i>必填</i></span>
            <textarea
              autoFocus
              required
              value={draft.bodyRaw}
              placeholder="写下发生了什么，以及你当时怎么想…"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  bodyRaw: event.target.value,
                }))
              }
            />
          </label>
          <label className="form-field">
            <span>
              标题{" "}
              <small>
                {draft.type === "screen" ||
                (draft.type === "anime" && works.length === 0)
                  ? "必填"
                  : "可选"}
              </small>
            </span>
            <input
              required={
                draft.type === "screen" ||
                (draft.type === "anime" && works.length === 0)
              }
              value={draft.title}
              placeholder="留空时使用作品名或自动摘要"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </label>
          {draft.type === "anime" ? (
            <div className="anime-rating-fields">
              <div className="form-grid-two capture-anime-topline">
                {works.length ? (
                  <AnimeSelect
                    className="capture-select"
                    label="关联作品"
                    value={draft.workId}
                    options={works.map(
                      (work) => [work.id, work.title] as const,
                    )}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        workId: value,
                        ratingScope: "work",
                        seasonId: "",
                        seasonLabel: "",
                        episodeLabel: "",
                      }))
                    }
                  />
                ) : (
                  <div className="capture-work-empty">
                    <span>关联作品</span>
                    <strong>保存后创建作品档案</strong>
                  </div>
                )}
                <label className="form-field">
                  <span>评分 <small>0.0–10.0</small></span>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    value={draft.score}
                    placeholder="8.8"
                    onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      score: event.target.value,
                    }))
                  }
                  />
                </label>
              </div>
              <div className="rating-scope-block">
                <span className="rating-scope-label">评分范围</span>
                <div className="rating-scope-actions">
                  <SegmentedControl
                    value={draft.ratingScope}
                    options={[
                      ["work", "整部"],
                      ["episode", "单集"],
                    ]}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        ratingScope: value as "work" | "episode",
                        seasonId: "",
                        seasonLabel: "",
                        episodeLabel:
                          value === "episode" ? current.episodeLabel : "",
                      }))
                    }
                  />
                </div>
              </div>
              {draft.ratingScope === "episode" ? (
                <label className="form-field">
                  <span>
                    单集 <small>必填</small>
                  </span>
                  <input
                    required
                    value={draft.episodeLabel}
                    placeholder="例如：第 8 集"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        episodeLabel: event.target.value,
                      }))
                    }
                  />
                </label>
              ) : null}
            </div>
          ) : null}
          {draft.type === "screen" ? (
            <div className="anime-rating-fields screen-rating-fields">
              <div className="form-grid-two capture-anime-topline">
                <div className="rating-scope-block screen-kind-block">
                  <span className="rating-scope-label">影视类型</span>
                  <SegmentedControl
                    value={draft.mediaKind}
                    options={[
                      ["movie", "电影"],
                      ["tv", "电视剧"],
                    ]}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        mediaKind: value as CaptureDraft["mediaKind"],
                        ratingScope:
                          value === "movie" ? "work" : current.ratingScope,
                        seasonLabel:
                          value === "movie" ? "" : current.seasonLabel,
                        seasonId:
                          value === "movie" ? "" : current.seasonId,
                        episodeLabel:
                          value === "movie" ? "" : current.episodeLabel,
                      }))
                    }
                  />
                </div>
                <label className="form-field">
                  <span>
                    评分 <small>0.0–10.0</small>
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    value={draft.score}
                    placeholder="8.8"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        score: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              {draft.mediaKind === "tv" ? (
                <div className="rating-scope-block">
                  <span className="rating-scope-label">评分范围</span>
                  <SegmentedControl
                    value={draft.ratingScope}
                    options={[
                      ["work", "整部"],
                      ["season", "季度"],
                      ["episode", "单集"],
                    ]}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        ratingScope: value as CaptureDraft["ratingScope"],
                        episodeLabel:
                          value === "episode" ? current.episodeLabel : "",
                      }))
                    }
                  />
                </div>
              ) : (
                <div className="screen-kind-note">
                  电影默认使用整部评分；电视剧可进一步选择季度或单集。
                </div>
              )}
              {draft.mediaKind === "tv" && draft.ratingScope !== "work" ? (
                <div className="form-grid-two rating-detail-grid">
                  <label className="form-field">
                    <span>
                      季度{" "}
                      <small>
                        {draft.ratingScope === "season" ? "必填" : "可选"}
                      </small>
                    </span>
                    <input
                      required={draft.ratingScope === "season"}
                      value={draft.seasonLabel}
                      placeholder="例如：第 2 季"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          seasonId: "",
                          seasonLabel: event.target.value,
                        }))
                      }
                    />
                  </label>
                  {draft.ratingScope === "episode" ? (
                    <label className="form-field">
                      <span>
                        单集 <small>必填</small>
                      </span>
                      <input
                        required
                        value={draft.episodeLabel}
                        placeholder="例如：第 8 集"
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            episodeLabel: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {draft.mediaIds.length ? (
            <div className="privacy-callout">
              <Film aria-hidden="true" size={17} />
              <div>
                <strong>附带 {draft.mediaIds.length} 个照片 / 视频</strong>
                <span>来自动态输入框，保存后一起出现在这条记录里。</span>
              </div>
            </div>
          ) : null}
          <div className="privacy-callout">
            <LockKeyhole aria-hidden="true" size={17} />
            <div>
              <strong>默认保存为私人</strong>
              <span>公开需要单独生成预览并输入确认短码。</span>
            </div>
          </div>
          <footer className="dialog-footer">
            <span>
              <Keyboard aria-hidden="true" size={14} /> Esc 取消
            </span>
            <div>
              <button className="secondary-button" type="button" onClick={onClose}>
                取消
              </button>
              <button className="primary-button" type="submit">
                <Check aria-hidden="true" size={16} />
                保存记录
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}

interface EditEntryDialogProps {
  entry: LedgerEntry;
  open: boolean;
  onClose: () => void;
  onSave: (body: string) => void;
}

function EditEntryDialog({
  entry,
  open,
  onClose,
  onSave,
}: EditEntryDialogProps) {
  const [body, setBody] = useState(entry.bodyRaw);

  useEffect(() => {
    if (open) {
      setBody(entry.bodyRaw);
    }
  }, [entry.bodyRaw, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog-panel edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
      >
        <header className="dialog-header">
          <div>
            <p className="eyebrow">NEW REVISION</p>
            <h2 id="edit-title">校对原文</h2>
            <p>保存会创建 v{entry.versionNo + 1}，不会覆盖当前版本。</p>
          </div>
          <button className="icon-button" type="button" aria-label="关闭" onClick={onClose}>
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <textarea
          autoFocus
          aria-label="修订后的原文"
          className="large-textarea"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <footer className="dialog-footer">
          <span>乐观锁版本 · v{entry.versionNo}</span>
          <div>
            <button className="secondary-button" type="button" onClick={onClose}>
              取消
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={!body.trim() || body === entry.bodyRaw}
              onClick={() => onSave(body.trim())}
            >
              保存新修订
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

interface PublishDialogProps {
  entry: LedgerEntry;
  work: AnimeWork | undefined;
  pendingAction: PendingAction | null;
  open: boolean;
  onClose: () => void | Promise<void>;
  onConfirm: () => void | Promise<void>;
  sensitiveMatch: boolean;
}

function PublishDialog({
  entry,
  work,
  pendingAction,
  open,
  onClose,
  onConfirm,
  sensitiveMatch,
}: PublishDialogProps) {
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (open) {
      setConfirmation("");
    }
  }, [open]);

  if (!open || !pendingAction) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog-panel publish-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
      >
        <header className="dialog-header">
          <div>
            <p className="eyebrow">PUBLIC SNAPSHOT PREVIEW</p>
            <h2 id="publish-title">确认最终公开内容</h2>
            <p>只有下方字段会进入 /public/v1/anime；来源与修订永不输出。</p>
          </div>
          <button className="icon-button" type="button" aria-label="关闭" onClick={onClose}>
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="public-preview-card">
          {work ? (
            <img
              src={work.coverUrl}
              alt=""
              decoding="async"
              height="650"
              loading="lazy"
              width="460"
            />
          ) : null}
          <div>
            <span>{work?.title ?? TYPE_LABELS[entry.type]}</span>
            <h3>{entry.title}</h3>
            <p>{entry.bodySummary}</p>
            <div>
              {entry.score !== null ? (
                <strong>{entry.score.toFixed(1)} / 10</strong>
              ) : null}
              <time>{formatEntryOccurredAt(entry)}</time>
            </div>
          </div>
        </div>
        <div className="field-whitelist">
          <span>
            <Check aria-hidden="true" size={13} /> 标题
          </span>
          <span>
            <Check aria-hidden="true" size={13} /> 公开感想
          </span>
          <span>
            <Check aria-hidden="true" size={13} /> 评分与日期
          </span>
          <span className="is-blocked">
            <X aria-hidden="true" size={13} /> 来源消息 ID
          </span>
          <span className="is-blocked">
            <X aria-hidden="true" size={13} /> 修订与审计
          </span>
        </div>
        {sensitiveMatch ? (
          <div className="privacy-callout is-warning" role="alert">
            <CircleAlert aria-hidden="true" size={17} />
            <div>
              <strong>检测到可能的敏感信息</strong>
              <span>公开前请重新检查标题与公开感想；来源字段虽不会输出，但正文仍可能泄露隐私。</span>
            </div>
          </div>
        ) : null}
        <div className="confirmation-field">
          <label htmlFor="publish-confirmation">
            输入 <strong>确认公开 {pendingAction.confirmationCode}</strong>
          </label>
          <input
            id="publish-confirmation"
            autoComplete="off"
            value={confirmation}
            placeholder={`确认公开 ${pendingAction.confirmationCode}`}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <span>确认短码 10 分钟后失效。</span>
        </div>
        <footer className="dialog-footer">
          <button className="secondary-button" type="button" onClick={onClose}>
            保持私人
          </button>
          <button
            className="publish-button"
            type="button"
            disabled={
              confirmation.trim() !==
              `确认公开 ${pendingAction.confirmationCode}`
            }
            onClick={onConfirm}
          >
            <Globe2 aria-hidden="true" size={16} />
            确认并公开
          </button>
        </footer>
      </section>
    </div>
  );
}

interface PurgeDialogProps {
  entry: LedgerEntry | null;
  onClose: () => void;
  onConfirm: (entryId: string) => void;
}

function PurgeDialog({ entry, onClose, onConfirm }: PurgeDialogProps) {
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    setConfirmation("");
  }, [entry]);

  if (!entry) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog-panel purge-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="purge-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
      >
        <header className="dialog-header">
          <div>
            <p className="eyebrow">PERMANENT DELETION</p>
            <h2 id="purge-title">永久清除这条记录？</h2>
            <p>业务行与关联附件将被移除，只保留最小安全审计。</p>
          </div>
          <button className="icon-button" type="button" aria-label="关闭" onClick={onClose}>
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="danger-summary">
          <Trash2 aria-hidden="true" size={20} />
          <div>
            <strong>{entry.title}</strong>
            <span>{entry.id}</span>
          </div>
        </div>
        <div className="confirmation-field">
          <label htmlFor="purge-confirmation">
            输入完整记录 ID 以确认
          </label>
          <input
            id="purge-confirmation"
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>
        <footer className="dialog-footer">
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="danger-button"
            type="button"
            disabled={confirmation !== entry.id}
            onClick={() => onConfirm(entry.id)}
          >
            永久清除
          </button>
        </footer>
      </section>
    </div>
  );
}

interface CommandPaletteProps {
  open: boolean;
  entries: LedgerEntry[];
  onClose: () => void;
  onNavigate: (path: string) => void;
}

const SEARCH_KIND_LABELS: Record<SearchHit["kind"], string> = {
  entry: "动态",
  book: "书",
  music: "音乐",
  place: "足迹",
  game: "游戏",
  anime: "番剧",
  screen: "影视",
};

const SEARCH_KIND_ICONS: Record<SearchHit["kind"], LucideIcon> = {
  entry: Inbox,
  book: BookOpen,
  music: Music2,
  place: MapPin,
  game: Gamepad2,
  anime: Library,
  screen: Film,
};

function searchHitPath(hit: SearchHit): string {
  const item = `?item=${encodeURIComponent(hit.id)}`;
  switch (hit.kind) {
    case "entry":
      return entryPath(hit.id);
    case "book":
      return `${ROUTES.books}${item}`;
    case "music":
      return `${ROUTES.music}${item}`;
    case "place":
      return `${ROUTES.places}${item}`;
    case "game":
      return `${ROUTES.games}${item}`;
    case "anime":
      return animePath(hit.id);
    case "screen":
      return ROUTES.movies;
  }
}

function CommandPalette({
  open,
  entries,
  onClose,
  onNavigate,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setHits(null);
    }
  }, [open]);

  useEffect(() => {
    const needle = query.trim();
    if (!open || !needle) {
      setHits(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchEverything(needle, controller.signal)
        .then(setHits)
        .catch(() => undefined);
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  if (!open) {
    return null;
  }

  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  const pageResults = NAV_ITEMS.filter((item) =>
    item.label.toLocaleLowerCase("zh-CN").includes(normalized),
  ).slice(0, 4);
  // Until the server answers (or with an empty query) show recent local posts.
  const entryResults = hits
    ? []
    : entries
        .filter((entry) =>
          `${entry.title} ${entry.bodyRaw}`
            .toLocaleLowerCase("zh-CN")
            .includes(normalized),
        )
        .slice(0, 5);
  const hitResults = hits ?? [];
  const resultPaths = [
    ...pageResults.map((item) => item.path),
    ...entryResults.map((entry) => entryPath(entry.id)),
    ...hitResults.map(searchHitPath),
  ];

  const handleResultKeys = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!resultPaths.length) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % resultPaths.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (index) => (index - 1 + resultPaths.length) % resultPaths.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      onNavigate(resultPaths[Math.min(activeIndex, resultPaths.length - 1)]!);
    }
  };

  return (
    <div className="command-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="command-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="全局搜索与导航"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
      >
        <div className="command-input">
          <Search aria-hidden="true" size={20} />
          <input
            autoFocus
            type="search"
            aria-label="搜索所有记录或跳转页面"
            value={query}
            placeholder="搜动态、书、音乐、足迹、游戏、番剧…"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleResultKeys}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="command-results">
          {pageResults.length ? (
            <>
              <span className="command-group-label">页面</span>
              {pageResults.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    className={activeIndex === index ? "is-active" : ""}
                    key={item.path}
                    type="button"
                    aria-current={activeIndex === index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => onNavigate(item.path)}
                  >
                    <span className="command-icon">
                      <Icon aria-hidden="true" size={17} />
                    </span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>打开 Life Ledger 页面</small>
                    </span>
                    <ArrowRight aria-hidden="true" size={15} />
                  </button>
                );
              })}
            </>
          ) : null}
          {entryResults.length ? (
            <>
              <span className="command-group-label">记录</span>
              {entryResults.map((entry, index) => {
                const resultIndex = pageResults.length + index;
                return (
                <button
                  className={activeIndex === resultIndex ? "is-active" : ""}
                  key={entry.id}
                  type="button"
                  aria-current={activeIndex === resultIndex}
                  onMouseEnter={() => setActiveIndex(resultIndex)}
                  onClick={() => onNavigate(entryPath(entry.id))}
                >
                  <span className={`command-icon entry-type-${entry.type}`}>
                    <BookOpen aria-hidden="true" size={17} />
                  </span>
                  <span>
                    <strong>{entry.title}</strong>
                    <small>
                      {formatEntryOccurredAt(entry)} ·{" "}
                      {TYPE_LABELS[entry.type]}
                    </small>
                  </span>
                  <StatusBadge visibility={entry.visibility} />
                </button>
                );
              })}
            </>
          ) : null}
          {hitResults.length ? (
            <>
              <span className="command-group-label">所有库</span>
              {hitResults.map((hit, index) => {
                const resultIndex = pageResults.length + entryResults.length + index;
                const Icon = SEARCH_KIND_ICONS[hit.kind];
                return (
                  <button
                    className={activeIndex === resultIndex ? "is-active" : ""}
                    key={`${hit.kind}:${hit.id}`}
                    type="button"
                    aria-current={activeIndex === resultIndex}
                    onMouseEnter={() => setActiveIndex(resultIndex)}
                    onClick={() => onNavigate(searchHitPath(hit))}
                  >
                    <span className="command-icon">
                      <Icon aria-hidden="true" size={17} />
                    </span>
                    <span>
                      <strong>{hit.title}</strong>
                      <small>
                        {SEARCH_KIND_LABELS[hit.kind]}
                        {hit.kind === "entry"
                          ? hit.date
                            ? ` · ${new Date(hit.date).toLocaleDateString("zh-CN")}`
                            : ""
                          : hit.subtitle
                            ? ` · ${hit.subtitle}`
                            : ""}
                        {hit.rating !== null ? ` · ★${hit.rating.toFixed(1)}` : ""}
                      </small>
                    </span>
                    <ArrowRight aria-hidden="true" size={15} />
                  </button>
                );
              })}
            </>
          ) : null}
          {!pageResults.length && !entryResults.length && !hitResults.length ? (
            <div className="command-empty">{hits === null && normalized ? "搜索中…" : "没有匹配结果"}</div>
          ) : null}
        </div>
        <footer className="command-footer">
          <span>↑↓ 浏览</span>
          <span>Enter 打开</span>
          <span>仅搜索已授权的私人数据</span>
        </footer>
      </section>
    </div>
  );
}

interface ToastStackProps {
  messages: ToastMessage[];
  onDismiss: (id: number) => void;
}

function ToastStack({ messages, onDismiss }: ToastStackProps) {
  return (
    <div className="toast-stack" aria-live="polite">
      {messages.map((message) => {
        const Icon =
          message.tone === "success"
            ? Check
            : message.tone === "danger"
              ? CircleAlert
              : ShieldCheck;
        return (
          <div className={`toast toast-${message.tone}`} key={message.id}>
            <span className="toast-icon">
              <Icon aria-hidden="true" size={17} />
            </span>
            <div>
              <strong>{message.title}</strong>
              <span>{message.detail}</span>
            </div>
            <button
              type="button"
              aria-label="关闭通知"
              onClick={() => onDismiss(message.id)}
            >
              <X aria-hidden="true" size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
