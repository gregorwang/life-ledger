import type { GameLibraryItem } from "@life-ledger/contracts";
import {
  Clock3,
  Gamepad2,
  Gem,
  Sparkles,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { loadGameLibrary } from "./api";

type GameFilter = "all" | "completed" | "playing";

export function GameLibraryPage() {
  const [items, setItems] = useState<GameLibraryItem[]>([]);
  const [filter, setFilter] = useState<GameFilter>("all");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

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

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (filter === "completed") return item.progress === 100;
        if (filter === "playing") return item.progress < 100;
        return true;
      }),
    [filter, items],
  );
  const totalHours = items.reduce(
    (total, item) => total + Number.parseFloat(item.playTime) || total,
    0,
  );
  const totalAchievements = items.reduce(
    (total, item) => total + item.achievementsCurrent,
    0,
  );
  const platinum = items.reduce(
    (total, item) => total + item.trophies.platinum,
    0,
  );

  return (
    <div className="page game-library-page">
      <section className="game-hero">
        <div className="game-hero-scan" aria-hidden="true" />
        <div className="game-hero-copy">
          <p className="eyebrow">PLAY MEMORY / 私人游玩收藏</p>
          <h1>
            游戏库
            <span>PLAY ARCHIVE</span>
          </h1>
          <p>
            每一张封面就是一段玩过的世界。这里直接陈列完成度、奖杯、评分和当时的评价，
            不再套一层与全站脱节的主机后台。
          </p>
        </div>
        <div className="game-pad-mark" aria-hidden="true">
          <Gamepad2 />
          <span>遊んだ記憶</span>
        </div>
        <div className="game-summary">
          <div>
            <span>游戏总数</span>
            <strong>{items.length || "—"}</strong>
          </div>
          <div>
            <span>累计时长</span>
            <strong>{items.length ? `${Math.round(totalHours)}h` : "—"}</strong>
          </div>
          <div>
            <span>已解锁成就</span>
            <strong>{items.length ? totalAchievements.toLocaleString() : "—"}</strong>
          </div>
          <div>
            <span>白金奖杯</span>
            <strong>{items.length ? platinum : "—"}</strong>
          </div>
        </div>
      </section>

      <section className="game-catalog-section">
        <header className="game-catalog-header">
          <div>
            <p className="eyebrow">YOUR PLAY LIBRARY</p>
            <h2>游玩收藏</h2>
            <p className="game-catalog-intro">
              封面、进度与评价同屏呈现；筛选只改变眼前这面作品墙。
            </p>
          </div>
          <div className="game-filter" role="group" aria-label="筛选游戏">
            {(
              [
                ["all", "全部"],
                ["completed", "已完成"],
                ["playing", "推进中"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={filter === value ? "is-active" : ""}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {loadState === "loading" ? (
          <div className="game-load-state" role="status">
            <Gamepad2 aria-hidden="true" />
            正在读取 D1 游戏档案…
          </div>
        ) : loadState === "error" ? (
          <div className="game-load-state is-error" role="alert">
            游戏事实层暂时不可用，请稍后重试。
          </div>
        ) : (
          <div className="game-grid">
            {visibleItems.map((game, index) => (
              <article
                className={`game-card ${index % 7 === 0 ? "is-featured" : ""}`}
                key={game.id}
              >
                <div className="game-card-cover">
                  <img
                    src={game.coverUrl}
                    alt={`${game.title} 游戏封面`}
                    loading={index < 4 ? "eager" : "lazy"}
                    fetchPriority={index < 2 ? "high" : "auto"}
                    decoding="async"
                    width="720"
                    height="405"
                  />
                  <span className="game-rating">
                    {game.rating.toFixed(1)}
                    <small>/ 10</small>
                  </span>
                </div>
                <div className="game-card-body">
                  <div className="game-card-title-row">
                    <div>
                      <p>PLAY MEMORY · {game.platform.toUpperCase()}</p>
                      <h3>{game.title}</h3>
                    </div>
                    <span className="game-complete-mark">
                      <Sparkles aria-hidden="true" size={14} />
                      {game.progress === 100 ? "已完成" : "推进中"}
                    </span>
                  </div>
                  <div className="game-progress">
                    <div>
                      <span>完成度</span>
                      <strong>{game.progress}%</strong>
                    </div>
                    <i>
                      <b style={{width: `${game.progress}%`}} />
                    </i>
                  </div>
                  <div className="game-metrics">
                    <span>
                      <Clock3 aria-hidden="true" size={15} />
                      {game.playTime}
                    </span>
                    <span>
                      <Trophy aria-hidden="true" size={15} />
                      {game.achievementsCurrent}/{game.achievementsTotal}
                    </span>
                    <span>
                      <Gem aria-hidden="true" size={15} />
                      白金 {game.trophies.platinum}
                    </span>
                  </div>
                  <p className="game-review">“{game.review}”</p>
                  <div className="game-tags">
                    {game.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
