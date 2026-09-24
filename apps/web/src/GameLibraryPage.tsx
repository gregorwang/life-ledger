import type { GameLibraryItem } from "@life-ledger/contracts";
import {
  Clock3,
  ExternalLink,
  Gamepad2,
  Search,
  Star,
  Trophy,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { loadGameLibrary } from "./api";
import { RelatedEntries } from "./RelatedEntries";
import "./game-library.css";

type GameFilter = "all" | "completed" | "playing";
type GameSort = "rating" | "hours" | "progress" | "title";

const FILTERS: ReadonlyArray<readonly [GameFilter, string]> = [
  ["all", "全部"],
  ["completed", "已通关"],
  ["playing", "还在玩"],
];

const SORTS: ReadonlyArray<readonly [GameSort, string]> = [
  ["rating", "评分最高"],
  ["hours", "玩得最久"],
  ["progress", "完成度"],
  ["title", "按名称"],
];

function hoursOf(game: GameLibraryItem): number {
  const hours = Number.parseFloat(game.playTime);
  return Number.isFinite(hours) ? hours : 0;
}

function matchesFilter(game: GameLibraryItem, filter: GameFilter): boolean {
  if (filter === "completed") return game.progress === 100;
  if (filter === "playing") return game.progress < 100;
  return true;
}

function compareGames(sort: GameSort) {
  return (left: GameLibraryItem, right: GameLibraryItem): number => {
    switch (sort) {
      case "rating":
        return right.rating - left.rating || hoursOf(right) - hoursOf(left);
      case "hours":
        return hoursOf(right) - hoursOf(left);
      case "progress":
        return right.progress - left.progress || right.rating - left.rating;
      case "title":
        return left.title.localeCompare(right.title, "zh-CN");
    }
  };
}

/** Stable hue per title so a missing cover still looks intentional. */
function coverHue(title: string): number {
  let hash = 0;
  for (const char of title) {
    hash = (hash * 31 + char.codePointAt(0)!) % 360;
  }
  return hash;
}

function GameCover({
  game,
  eager = false,
}: {
  game: GameLibraryItem;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed || !game.coverUrl) {
    const hue = coverHue(game.title);
    return (
      <span
        className="gl-cover-fallback"
        style={{
          background: `linear-gradient(135deg, hsl(${hue} 42% 32%), hsl(${(hue + 40) % 360} 48% 18%))`,
        }}
        aria-hidden="true"
      >
        {Array.from(game.title)[0]}
      </span>
    );
  }
  return (
    <img
      src={game.coverUrl}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      width="720"
      height="405"
      onError={() => setFailed(true)}
    />
  );
}

export function GameLibraryPage({
  focusId,
  onOpenEntry,
}: {
  focusId: string | null;
  onOpenEntry: (entryId: string) => void;
}) {
  const [items, setItems] = useState<GameLibraryItem[]>([]);
  const [filter, setFilter] = useState<GameFilter>("all");
  const [sort, setSort] = useState<GameSort>("rating");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const searchId = useId();
  const sortId = useId();

  useEffect(() => {
    const controller = new AbortController();
    void loadGameLibrary(controller.signal)
      .then((result) => {
        setItems(result);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadState("error");
      });
    return () => controller.abort();
  }, []);

  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (focusId && focusedRef.current !== focusId && items.some((game) => game.id === focusId)) {
      focusedRef.current = focusId;
      setOpenId(focusId);
    }
  }, [focusId, items]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map(([value]) => [
          value,
          items.filter((game) => matchesFilter(game, value)).length,
        ]),
      ) as Record<GameFilter, number>,
    [items],
  );

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter((game) => matchesFilter(game, filter))
      .filter(
        (game) =>
          !needle ||
          game.title.toLowerCase().includes(needle) ||
          game.tags.some((tag) => tag.toLowerCase().includes(needle)),
      )
      .sort(compareGames(sort));
  }, [filter, items, query, sort]);

  const totalHours = items.reduce((total, game) => total + hoursOf(game), 0);
  const platinum = items.reduce((total, game) => total + game.trophies.platinum, 0);
  const openGame = openId ? items.find((game) => game.id === openId) ?? null : null;

  return (
    <div className="page gl-page">
      <header className="gl-head">
        <div className="gl-title">
          <p className="gl-eyebrow">
            <Gamepad2 aria-hidden="true" size={14} />
            PLAY ARCHIVE
          </p>
          <h1>游戏库</h1>
          <p className="gl-lede">玩过的世界、拿到的奖杯，还有通关那天的一句话。</p>
        </div>
        <dl className="gl-stats">
          <div>
            <dt>款游戏</dt>
            <dd>{items.length || "—"}</dd>
          </div>
          <div>
            <dt>小时</dt>
            <dd>{items.length ? Math.round(totalHours).toLocaleString() : "—"}</dd>
          </div>
          <div>
            <dt>已通关</dt>
            <dd>{items.length ? counts.completed : "—"}</dd>
          </div>
          <div>
            <dt>白金奖杯</dt>
            <dd>{items.length ? platinum : "—"}</dd>
          </div>
        </dl>
      </header>

      <div className="gl-toolbar">
        <div className="gl-filter" role="group" aria-label="筛选游戏">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "is-active" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
              <span>{items.length ? counts[value] : ""}</span>
            </button>
          ))}
        </div>
        <div className="gl-tools">
          <label className="gl-search" htmlFor={searchId}>
            <Search aria-hidden="true" size={15} />
            <span className="sr-only">搜索游戏</span>
            <input
              id={searchId}
              type="search"
              value={query}
              placeholder="搜索名字或标签"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="gl-sort" htmlFor={sortId}>
            <span className="sr-only">排序</span>
            <select
              id={sortId}
              value={sort}
              onChange={(event) => setSort(event.target.value as GameSort)}
            >
              {SORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loadState === "loading" ? (
        <div className="gl-state" role="status">
          <Gamepad2 aria-hidden="true" />
          正在读取游戏档案…
        </div>
      ) : loadState === "error" ? (
        <div className="gl-state is-error" role="alert">
          游戏库暂时读不出来，请稍后刷新重试。
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="gl-state">
          {items.length ? "没有符合条件的游戏。" : "游戏库还是空的，可以通过 MCP 添加。"}
        </div>
      ) : (
        <ul className="gl-grid">
          {visibleItems.map((game, index) => (
            <li key={game.id}>
              <button
                type="button"
                className="gl-card"
                aria-haspopup="dialog"
                onClick={() => setOpenId(game.id)}
              >
                <span className="gl-cover">
                  <GameCover game={game} eager={index < 6} />
                  {game.progress === 100 ? (
                    <span className="gl-done">
                      <Trophy aria-hidden="true" size={12} />
                      已通关
                    </span>
                  ) : null}
                </span>
                <span className="gl-card-body">
                  <span className="gl-card-top">
                    <strong className="gl-card-title">{game.title}</strong>
                    <span className="gl-score" aria-label={`评分 ${game.rating.toFixed(1)}`}>
                      <Star aria-hidden="true" size={12} />
                      {game.rating.toFixed(1)}
                    </span>
                  </span>
                  <span className="gl-meta">
                    <span>
                      <Clock3 aria-hidden="true" size={13} />
                      {game.playTime}
                    </span>
                    <span>
                      <Trophy aria-hidden="true" size={13} />
                      {game.achievementsCurrent}/{game.achievementsTotal}
                    </span>
                    <span className="gl-meta-progress">{game.progress}%</span>
                  </span>
                  <span className="gl-bar" aria-hidden="true">
                    <i style={{ width: `${game.progress}%` }} />
                  </span>
                  {game.review ? <span className="gl-quote">{game.review}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openGame ? (
        <GameDetail game={openGame} onClose={() => setOpenId(null)} onOpenEntry={onOpenEntry} />
      ) : null}
    </div>
  );
}

const TROPHY_TIERS = [
  ["platinum", "白金"],
  ["gold", "金"],
  ["silver", "银"],
  ["bronze", "铜"],
] as const;

function GameDetail({
  game,
  onClose,
  onOpenEntry,
}: {
  game: GameLibraryItem;
  onClose: () => void;
  onOpenEntry: (entryId: string) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div className="gl-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="gl-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="gl-dialog-cover">
          <GameCover game={game} eager />
          <button
            ref={closeRef}
            type="button"
            className="gl-dialog-close"
            aria-label="关闭"
            onClick={onClose}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="gl-dialog-body">
          <p className="gl-eyebrow">{game.platform}</p>
          <div className="gl-dialog-title">
            <h2 id={titleId}>{game.title}</h2>
            <span className="gl-score is-large">
              <Star aria-hidden="true" size={15} />
              {game.rating.toFixed(1)}
              <small>/ 10</small>
            </span>
          </div>
          {game.review ? <blockquote className="gl-dialog-quote">{game.review}</blockquote> : null}
          <dl className="gl-dialog-facts">
            <div>
              <dt>游玩时长</dt>
              <dd>{game.playTime}</dd>
            </div>
            <div>
              <dt>完成度</dt>
              <dd>{game.progress}%</dd>
            </div>
            <div>
              <dt>奖杯</dt>
              <dd>
                {game.achievementsCurrent}/{game.achievementsTotal}
              </dd>
            </div>
          </dl>
          <ul className="gl-trophies" aria-label="奖杯分布">
            {TROPHY_TIERS.map(([tier, label]) => (
              <li key={tier} className={`is-${tier}`}>
                <i aria-hidden="true" />
                {label}
                <strong>{game.trophies[tier]}</strong>
              </li>
            ))}
          </ul>
          <RelatedEntries kind="game" id={game.id} onOpenEntry={onOpenEntry} />
          {game.tags.length ? (
            <div className="gl-tags">
              {game.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          ) : null}
          {game.sourceUrl ? (
            <a className="gl-source" href={game.sourceUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" size={13} />
              数据来源
            </a>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}
