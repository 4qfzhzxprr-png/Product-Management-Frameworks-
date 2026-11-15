import { Button, Checkbox } from "antd";
import { ArrowUpRight, Hourglass, Inbox, PenLine, Plus, Trophy } from "lucide-react";
import { overviewStats } from "../core/insights";
import { KIND_LABELS, type Capture } from "../core/models";
import { CircularProgress, GlassCard, Sparkline, StatCard } from "./components";
import type { Selection } from "./CapturesPage";

function greeting(now: number): string {
  const hour = new Date(now).getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function age(createdAt: number, now: number): string {
  const days = Math.floor((now - createdAt) / 86_400_000);
  return days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`;
}

export function OverviewPage({
  captures,
  now,
  personName,
  onOpenCaptures,
  onOpenAnalytics,
  onCapture,
  onDone,
}: {
  captures: Capture[];
  now: number;
  personName: (id: number | null) => string | undefined;
  onOpenCaptures: (selection: Selection) => void;
  onOpenAnalytics: () => void;
  onCapture: () => void;
  onDone: (capture: Capture) => void;
}) {
  const stats = overviewStats(captures, now);
  const clear = stats.clearTotal === 0;
  const change = stats.capturedThisWeek - stats.capturedLastWeek;
  const oldest = stats.waitingList[0];
  const today = new Date(now);
  // The current week, Monday first.
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7) + index);
    return { date, isToday: date.getDate() === today.getDate() && date.getMonth() === today.getMonth() };
  });

  return (
    <div className="page">
      <header className="page-head">
        <h1>{greeting(now)}</h1>
        <p>
          {new Date(now).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          {" · "}
          {stats.waitingOnMe === 0
            ? "nothing is waiting on you"
            : `${stats.waitingOnMe} ${stats.waitingOnMe === 1 ? "item is" : "items are"} waiting on you`}
        </p>
      </header>

      <div className="overview-top">
        <section className="hero" style={{ "--i": 0 } as React.CSSProperties} aria-labelledby="hero-title">
          <div className="hero-text">
            <p className="hero-chip">
              Last 7 days · {stats.capturedThisWeek} {stats.capturedThisWeek === 1 ? "capture" : "captures"}
            </p>
            <h2 id="hero-title">
              {clear ? (
                <>
                  You're all <em>clear</em>
                </>
              ) : stats.waitingOnMe === 0 ? (
                <>
                  Everything is <em>cleared</em>
                </>
              ) : (
                <>
                  {stats.waitingOnMe} {stats.waitingOnMe === 1 ? "thing is" : "things are"} still <em>waiting</em> on
                  you
                </>
              )}
            </h2>
            <p>
              {clear
                ? "No commitments or asks are open. Capture one with Control-Option-Space."
                : `You closed ${stats.clearedThisWeek} of ${stats.clearTotal} commitments and asks in the last 7 days.`}
            </p>
            <dl className="hero-stats">
              <div>
                <dd>{stats.clearedThisWeek}</dd>
                <dt>cleared</dt>
              </div>
              <div>
                <dd>{stats.waitingOnMe}</dd>
                <dt>waiting</dt>
              </div>
              <div>
                <dd>{oldest ? age(oldest.createdAt, now) : "none"}</dd>
                <dt>oldest open</dt>
              </div>
            </dl>
            <div className="hero-actions">
              {stats.waitingOnMe > 0 && (
                <Button
                  className="pill solid"
                  shape="round"
                  size="large"
                  icon={<ArrowUpRight size={16} aria-hidden="true" />}
                  iconPlacement="end"
                  onClick={() => onOpenCaptures({ type: "open" })}
                >
                  Review open items
                </Button>
              )}
              <Button
                className="pill outline"
                shape="round"
                size="large"
                icon={<Plus size={16} aria-hidden="true" />}
                onClick={onCapture}
              >
                Quick capture
              </Button>
            </div>
          </div>
          <CircularProgress
            value={clear ? 1 : stats.clearedThisWeek / stats.clearTotal}
            label={clear ? "100%" : `${Math.round((stats.clearedThisWeek / stats.clearTotal) * 100)}%`}
            caption="cleared"
          />
        </section>

        <GlassCard className="waiting" index={1} aria-labelledby="waiting-title">
          <div className="cal-head">
            <span className="cal-day" aria-hidden="true">
              {String(today.getDate()).padStart(2, "0")}
            </span>
            <div>
              <h2 id="waiting-title">Waiting on you</h2>
              <p className="muted small">
                {today.toLocaleDateString(undefined, { weekday: "long" })},{" "}
                {today.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </p>
            </div>
          </div>
          <ol className="week" aria-hidden="true">
            {week.map(({ date, isToday }) => (
              <li key={date.getTime()} className={isToday ? "today" : ""}>
                <span>{date.toLocaleDateString(undefined, { weekday: "narrow" })}</span>
                {date.getDate()}
              </li>
            ))}
          </ol>
          {stats.waitingList.length === 0 ? (
            <p className="muted">Nothing open. Commitments and asks of you appear here, oldest first.</p>
          ) : (
            <ul>
              {stats.waitingList.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <Checkbox checked={false} aria-label={`Mark done: ${item.body}`} onChange={() => onDone(item)} />
                  <div>
                    <p>{item.body}</p>
                    <p className="muted small">
                      {[KIND_LABELS[item.kind], personName(item.personId), age(item.createdAt, now)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {stats.waitingList.length > 5 && (
            <Button type="link" className="see-all" onClick={() => onOpenCaptures({ type: "open" })}>
              See all {stats.waitingList.length}
            </Button>
          )}
        </GlassCard>
      </div>

      <div className="stats">
        <StatCard
          index={2}
          icon={Inbox}
          label="Waiting on me"
          accent
          value={String(stats.waitingOnMe)}
          detail={oldest ? `oldest: ${age(oldest.createdAt, now)}` : "all clear"}
          onClick={() => onOpenCaptures({ type: "open" })}
          actionLabel="Show open items"
        />
        <StatCard
          index={3}
          icon={Hourglass}
          label="Waiting on others"
          value={String(stats.waitingOnOthers)}
          detail="open asks I made"
          onClick={() => onOpenCaptures({ type: "open" })}
          actionLabel="Show open items"
        />
        <StatCard
          index={4}
          icon={Trophy}
          label="Wins"
          value={String(stats.recentWins)}
          detail="last 30 days"
          onClick={() => onOpenCaptures({ type: "wins" })}
          actionLabel="Show wins"
        />
        <StatCard
          index={5}
          icon={PenLine}
          label="Captured this week"
          value={String(stats.capturedThisWeek)}
          detail={`${stats.capturedLastWeek} last week`}
          chip={change === 0 ? undefined : `${change > 0 ? "+" : "−"}${Math.abs(change)}`}
          onClick={onOpenAnalytics}
          actionLabel="Open analytics"
        >
          <Sparkline values={stats.dailyCaptures} />
        </StatCard>
      </div>
    </div>
  );
}
