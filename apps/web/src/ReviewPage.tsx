import { MOOD_PRESETS, type YearReview } from "@life-ledger/contracts";
import { BookOpen, CalendarHeart, MapPin, Music2, Quote, Tv } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import { loadYearReview } from "./api";
import "./review.css";

const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function moodName(mood: string): string {
  return MOOD_PRESETS.find((preset) => preset.emoji === mood)?.label ?? "心情";
}

/** Sequential blue ramp (validated ordinal steps 250 → 650). */
function heatLevel(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

interface Tip {
  text: string;
  x: number;
  y: number;
}

function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const show = (text: string) => (event: MouseEvent<HTMLElement>) => {
    const host = hostRef.current?.getBoundingClientRect();
    const target = event.currentTarget.getBoundingClientRect();
    if (!host) return;
    setTip({
      text,
      x: target.left - host.left + target.width / 2,
      y: target.top - host.top,
    });
  };
  return { tip, hostRef, show, hide: () => setTip(null) };
}

function TipBubble({ tip }: { tip: Tip | null }) {
  return tip ? (
    <span className="rv-tip" style={{ left: tip.x, top: tip.y }} role="presentation">
      {tip.text}
    </span>
  ) : null;
}

function MoodCalendar({ review }: { review: YearReview }) {
  const [mode, setMode] = useState<"mood" | "count">("mood");
  const { tip, hostRef, show, hide } = useTip();
  const moods = useMemo(() => new Map(review.moods.days.map((day) => [day.date, day.mood])), [review]);
  const counts = useMemo(() => new Map(review.days.map((day) => [day.date, day.count])), [review]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="rv-card rv-calendar-card" aria-labelledby="rv-calendar-title">
      <header className="rv-card-head">
        <div>
          <h2 id="rv-calendar-title">心情日历</h2>
          <p>
            {mode === "mood"
              ? `${review.moods.days.length} 天留下了心情；每格是那天最后记下的一个。`
              : `${review.entries.activeDays} 天写过动态，颜色越深写得越多。`}
          </p>
        </div>
        <div className="rv-toggle" role="group" aria-label="日历显示">
          <button type="button" className={mode === "mood" ? "is-active" : ""} aria-pressed={mode === "mood"} onClick={() => setMode("mood")}>
            心情
          </button>
          <button type="button" className={mode === "count" ? "is-active" : ""} aria-pressed={mode === "count"} onClick={() => setMode("count")}>
            动态数
          </button>
        </div>
      </header>
      <div className="rv-months" ref={hostRef} onMouseLeave={hide}>
        {MONTHS.map((label, month) => {
          const first = new Date(Date.UTC(review.year, month, 1));
          const daysInMonth = new Date(Date.UTC(review.year, month + 1, 0)).getUTCDate();
          const lead = (first.getUTCDay() + 6) % 7;
          return (
            <div className="rv-month" key={label}>
              <h3>{label}</h3>
              <div className="rv-month-grid">
                {WEEKDAYS.map((day) => (
                  <span className="rv-weekday" key={day} aria-hidden="true">
                    {day}
                  </span>
                ))}
                {Array.from({ length: lead }, (_, index) => (
                  <span key={`lead-${index}`} aria-hidden="true" />
                ))}
                {Array.from({ length: daysInMonth }, (_, index) => {
                  const date = `${review.year}-${String(month + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
                  const mood = moods.get(date);
                  const count = counts.get(date) ?? 0;
                  const text = `${month + 1}月${index + 1}日 · ${count} 条动态${mood ? ` · ${mood} ${moodName(mood)}` : ""}`;
                  const future = date > today;
                  return (
                    <span
                      key={date}
                      className={
                        mode === "mood"
                          ? `rv-day is-mood${mood ? " has-mood" : ""}${future ? " is-future" : ""}`
                          : `rv-day is-heat level-${heatLevel(count)}${future ? " is-future" : ""}`
                      }
                      aria-label={text}
                      onMouseEnter={show(text)}
                    >
                      {mode === "mood" && mood ? mood : null}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
        <TipBubble tip={tip} />
      </div>
      {mode === "count" ? (
        <div className="rv-scale" aria-label="颜色说明">
          <span>少</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <i key={level} className={`rv-day is-heat level-${level}`} aria-hidden="true" />
          ))}
          <span>多</span>
        </div>
      ) : review.moods.counts.length ? (
        <ul className="rv-mood-bars" aria-label="心情分布">
          {review.moods.counts.slice(0, 8).map((bucket) => {
            const max = review.moods.counts[0]!.count;
            return (
              <li key={bucket.key}>
                <span className="rv-mood-label">
                  <span aria-hidden="true">{bucket.key}</span>
                  {moodName(bucket.key)}
                </span>
                <span className="rv-mood-track">
                  <i style={{ width: `${(bucket.count / max) * 100}%` }} />
                </span>
                <span className="rv-mood-count">{bucket.count}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rv-empty-line">今年还没有记过心情。写动态时点笑脸就能选。</p>
      )}
    </section>
  );
}

function MonthlyChart({ review }: { review: YearReview }) {
  const { tip, hostRef, show, hide } = useTip();
  const values = review.entries.byMonth;
  const max = Math.max(1, ...values);
  const peak = values.indexOf(Math.max(...values));
  return (
    <section className="rv-card" aria-labelledby="rv-monthly-title">
      <header className="rv-card-head">
        <div>
          <h2 id="rv-monthly-title">每月动态</h2>
          <p>{values.some(Boolean) ? `写得最多的是 ${peak + 1} 月，共 ${values[peak]} 条。` : "今年还没有动态。"}</p>
        </div>
      </header>
      <div className="rv-columns" ref={hostRef} onMouseLeave={hide}>
        {values.map((value, index) => (
          <div className="rv-column" key={MONTHS[index]} onMouseEnter={show(`${MONTHS[index]} · ${value} 条`)}>
            <span className="rv-column-value">{index === peak && value > 0 ? value : ""}</span>
            <span className="rv-column-bar" style={{ height: `${(value / max) * 100}%` }} />
            <span className="rv-column-label">{index + 1}</span>
          </div>
        ))}
        <TipBubble tip={tip} />
      </div>
      <details className="rv-table">
        <summary>查看数据表</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">月份</th>
              <th scope="col">动态</th>
            </tr>
          </thead>
          <tbody>
            {values.map((value, index) => (
              <tr key={MONTHS[index]}>
                <td>{MONTHS[index]}</td>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function Cover({ url, title, square = false }: { url: string | null; title: string; square?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={square ? "rv-cover is-square" : "rv-cover"}>
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{Array.from(title)[0]}</span>
      )}
    </span>
  );
}

export function ReviewPage({ onOpenEntry }: { onOpenEntry: (id: string) => void }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [review, setReview] = useState<YearReview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    void loadYearReview(year, controller.signal)
      .then((result) => {
        setReview(result);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState("error");
      });
    return () => controller.abort();
  }, [year]);

  const years = review?.years.length ? review.years : [year];
  const cities = review
    ? new Set(review.places.map((place) => place.city ?? place.name)).size
    : 0;

  return (
    <div className="page rv-page">
      <header className="rv-head">
        <p className="rv-eyebrow">
          <CalendarHeart aria-hidden="true" size={14} />
          YEAR IN REVIEW
        </p>
        <h1>{year} 年度回顾</h1>
        <p className="rv-lede">不是平台替你总结的年度报告，是你自己一条条记下来的一年。</p>
        <div className="rv-years" role="group" aria-label="选择年份">
          {years.map((option) => (
            <button
              key={option}
              type="button"
              className={option === year ? "is-active" : ""}
              aria-pressed={option === year}
              onClick={() => setYear(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </header>

      {state === "loading" && !review ? (
        <div className="rv-state" role="status">
          正在整理这一年…
        </div>
      ) : state === "error" ? (
        <div className="rv-state is-error" role="alert">
          回顾暂时生成不出来，请稍后刷新重试。
        </div>
      ) : review ? (
        <div className={state === "loading" ? "rv-body is-loading" : "rv-body"}>
          <dl className="rv-stats">
            <div>
              <dt>条动态</dt>
              <dd>{review.entries.total.toLocaleString()}</dd>
            </div>
            <div>
              <dt>天有记录</dt>
              <dd>{review.entries.activeDays}</dd>
            </div>
            <div>
              <dt>最长连续记录</dt>
              <dd>
                {review.entries.longestStreak}
                <small>天</small>
              </dd>
            </div>
            <div>
              <dt>本书读完</dt>
              <dd>{review.books.length}</dd>
            </div>
            <div>
              <dt>个地方</dt>
              <dd>{review.places.length}</dd>
            </div>
          </dl>

          <MoodCalendar review={review} />

          <div className="rv-grid">
            <MonthlyChart review={review} />
            <section className="rv-card" aria-labelledby="rv-first-title">
              <header className="rv-card-head">
                <div>
                  <h2 id="rv-first-title">今年的第一条</h2>
                  <p>
                    {review.firstEntry
                      ? new Date(review.firstEntry.occurredAt).toLocaleString("zh-CN", {
                          timeZone: review.timezone,
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "今年还没有动态。"}
                  </p>
                </div>
              </header>
              {review.firstEntry ? (
                <button
                  type="button"
                  className="rv-first"
                  onClick={() => onOpenEntry(review.firstEntry!.id)}
                >
                  <Quote aria-hidden="true" size={18} />
                  <span>{review.firstEntry.excerpt}</span>
                </button>
              ) : null}
              {review.topTags.length ? (
                <>
                  <h3 className="rv-subhead">最常写的话题</h3>
                  <ul className="rv-tags">
                    {review.topTags.map((tag) => (
                      <li key={tag.key}>
                        #{tag.key}
                        <span>{tag.count}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          </div>

          {review.works.length ? (
            <section className="rv-card" aria-labelledby="rv-works-title">
              <header className="rv-card-head">
                <div>
                  <h2 id="rv-works-title">
                    <Tv aria-hidden="true" size={17} />
                    看过的番剧与影视
                  </h2>
                  <p>{review.works.length} 部作品，按今年给的分排序。</p>
                </div>
              </header>
              <ul className="rv-shelf">
                {review.works.map((work) => (
                  <li key={work.mediaWorkId}>
                    <Cover url={work.coverUrl} title={work.title} />
                    <strong>{work.title}</strong>
                    <span>
                      {work.score !== null ? `★${work.score.toFixed(1)} · ` : ""}
                      {work.logCount} 条记录
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {review.books.length || review.music.length ? (
            <div className="rv-grid">
              {review.books.length ? (
                <section className="rv-card" aria-labelledby="rv-books-title">
                  <header className="rv-card-head">
                    <div>
                      <h2 id="rv-books-title">
                        <BookOpen aria-hidden="true" size={17} />
                        读完的书
                      </h2>
                      <p>{review.books.length} 本 · 摘抄 {review.books.reduce((total, book) => total + book.excerpts.length, 0)} 条</p>
                    </div>
                  </header>
                  <ul className="rv-shelf">
                    {review.books.map((book) => (
                      <li key={book.id}>
                        <Cover url={book.coverUrl} title={book.title} />
                        <strong>{book.title}</strong>
                        <span>{[book.creator, book.rating !== null ? `★${book.rating.toFixed(1)}` : null].filter(Boolean).join(" · ")}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {review.music.length ? (
                <section className="rv-card" aria-labelledby="rv-music-title">
                  <header className="rv-card-head">
                    <div>
                      <h2 id="rv-music-title">
                        <Music2 aria-hidden="true" size={17} />
                        今年的音乐
                      </h2>
                      <p>{review.music.length} 张专辑 / 首歌</p>
                    </div>
                  </header>
                  <ul className="rv-shelf is-square">
                    {review.music.map((item) => (
                      <li key={item.id}>
                        <Cover url={item.coverUrl} title={item.title} square />
                        <strong>{item.title}</strong>
                        <span>{[item.creator, item.rating !== null ? `★${item.rating.toFixed(1)}` : null].filter(Boolean).join(" · ")}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}

          {review.places.length ? (
            <section className="rv-card" aria-labelledby="rv-places-title">
              <header className="rv-card-head">
                <div>
                  <h2 id="rv-places-title">
                    <MapPin aria-hidden="true" size={17} />
                    去过的地方
                  </h2>
                  <p>{review.places.length} 个地点 · {cities} 座城市</p>
                </div>
              </header>
              <ol className="rv-places">
                {review.places.map((place) => (
                  <li key={place.id}>
                    <time dateTime={place.visitedOn}>{place.visitedOn.slice(5).replace("-", "/")}</time>
                    <strong>{place.name}</strong>
                    <span>{[place.city, place.country].filter(Boolean).join("，")}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
