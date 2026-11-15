import { Segmented } from "antd";
import { CheckCircle2, CircleDashed, PenLine, Trophy } from "lucide-react";
import { useState } from "react";
import { analyticsStats, RANGES, type RangeId } from "../core/insights";
import type { Capture } from "../core/models";
import { BarChart } from "./BarChart";
import { GlassCard, StatCard } from "./components";

export function AnalyticsPage({ captures, now }: { captures: Capture[]; now: number }) {
  const [rangeId, setRangeId] = useState<RangeId>("30d");
  const range = RANGES.find((candidate) => candidate.id === rangeId)!;
  const stats = analyticsStats(captures, rangeId, now);
  const period = `last ${range.label}`;

  return (
    <div className="page">
      <header className="page-head with-controls">
        <div>
          <h1>Analytics</h1>
          <p>What you captured and closed, from the notes stored on this Mac.</p>
        </div>
        <Segmented<RangeId>
          aria-label="Period"
          value={rangeId}
          onChange={setRangeId}
          options={RANGES.map((option) => ({ value: option.id, label: option.label }))}
        />
      </header>

      <div className="stats">
        <StatCard index={0} icon={PenLine} label="Captured" value={String(stats.captured)} detail={period} />
        <StatCard index={1} icon={CheckCircle2} label="Closed" value={String(stats.closed)} detail={period} />
        <StatCard index={2} icon={Trophy} label="Wins" value={String(stats.wins)} detail={period} />
        <StatCard
          index={3}
          icon={CircleDashed}
          label="Still open"
          value={String(stats.stillOpen)}
          detail={`captured in the ${period}`}
        />
      </div>

      <GlassCard className="chart-card" index={4} aria-labelledby="chart-title">
        <h2 id="chart-title">Capture activity</h2>
        {stats.captured === 0 ? (
          <p className="muted chart-empty">No captures in the {period}.</p>
        ) : (
          <BarChart buckets={stats.buckets} unit={range.daysPerBucket === 1 ? "day" : "week"} />
        )}
      </GlassCard>
    </div>
  );
}
