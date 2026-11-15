import { ArrowUpRight, Hourglass, Inbox, PenLine, Trophy } from "lucide-react";
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
  onDone,
}: {
  captures: Capture[];
  now: number;
  personName: (id: number | null) => string | undefined;
  onOpenCaptures: (selection: Selection) => void;
  onOpenAnalytics: () => void;
  onDone: (capture: Capture) => void;
}) {
  const stats = overviewStats(captures, now);
  const clear = stats.clearTotal === 0;
  const change = stats.capturedThisWeek - stats.capturedLastWeek;
  const oldest = stats.waitingList[0];

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
        <section className="hero" style={{ "--i": 0 } as React.CSSProperties}>
          <div className="hero-text">
            <p className="hero-kicker">This week</p>
            <h2>
              {clear
                ? "You're all clear"
                : stats.waitingOnMe === 0
                  ? "Everything is cleared"
                  : `${stats.waitingOnMe} still waiting on you`}
            </h2>
            <p>
              {clear
                ? "No commitments or asks are open. Capture one with Control-Option-Space."
                : `You closed ${stats.clearedThisWeek} of ${stats.clearTotal} commitments and asks in the last 7 days.`}
            </p>
            {stats.waitingOnMe > 0 && (
              <button className="hero-cta" onClick={() => onOpenCaptures({ type: "open" })}>
                Review open items <ArrowUpRight size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <CircularProgress
            value={clear ? 1 : stats.clearedThisWeek / stats.clearTotal}
            label={clear ? "100%" : `${Math.round((stats.clearedThisWeek / stats.clearTotal) * 100)}%`}
            caption="cleared"
          />
        </section>

        <GlassCard className="waiting" index={1} aria-labelledby="waiting-title">
          <h2 id="waiting-title">Waiting on you</h2>
          {stats.waitingList.length === 0 ? (
            <p className="muted">Nothing open. Commitments and asks of you appear here, oldest first.</p>
          ) : (
            <ul>
              {stats.waitingList.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <input
                    type="checkbox"
                    checked={false}
                    aria-label={`Mark done: ${item.body}`}
                    onChange={() => onDone(item)}
                  />
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
            <button className="link" onClick={() => onOpenCaptures({ type: "open" })}>
              See all {stats.waitingList.length}
            </button>
          )}
        </GlassCard>
      </div>

      <div className="stats">
        <StatCard
          index={2}
          icon={Inbox}
          label="Waiting on me"
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
          detail={change === 0 ? "same as last week" : `${change > 0 ? "+" : "−"}${Math.abs(change)} vs last week`}
          onClick={onOpenAnalytics}
          actionLabel="Open analytics"
        >
          <Sparkline values={stats.dailyCaptures} />
        </StatCard>
      </div>
    </div>
  );
}
