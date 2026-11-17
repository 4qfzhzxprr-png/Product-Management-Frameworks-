import type { Db } from "./db";

/** Metrics with a target and a history, so a number can be quoted with its trend. */

export interface Metric {
  id: number;
  name: string;
  /** Shown after the value: "%", " pharmacies", "" for none. */
  unit: string;
  target: number | null;
  /** Whether a higher value is better. */
  higherIsBetter: boolean;
  createdAt: number;
}

export interface MetricPoint {
  id: number;
  metricId: number;
  at: number;
  value: number;
  note: string;
}

export interface MetricSummary {
  metric: Metric;
  points: MetricPoint[];
  latest: MetricPoint | null;
  first: MetricPoint | null;
  /** Latest minus first, or null with fewer than two points. */
  change: number | null;
  /** Whether the latest value meets the target, or null without one. */
  onTarget: boolean | null;
  /** Share of the way from the first value to the target, 0 to 1, or null. */
  progress: number | null;
  /** Moving the right way since the first point. */
  improving: boolean | null;
}

export function summarize(metric: Metric, all: MetricPoint[]): MetricSummary {
  const points = all.filter((point) => point.metricId === metric.id).sort((a, b) => a.at - b.at);
  const latest = points.at(-1) ?? null;
  const first = points[0] ?? null;
  const change = latest && first && points.length > 1 ? latest.value - first.value : null;
  const onTarget = latest && metric.target !== null ? (metric.higherIsBetter ? latest.value >= metric.target : latest.value <= metric.target) : null;
  const span = first && metric.target !== null ? metric.target - first.value : null;
  const progress = latest && first && span ? Math.max(0, Math.min(1, (latest.value - first.value) / span)) : onTarget ? 1 : null;
  return { metric, points, latest, first, change, onTarget, progress, improving: change === null || change === 0 ? null : metric.higherIsBetter ? change > 0 : change < 0 };
}

const format = (value: number, unit: string) => `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`;
const month = (time: number) => new Date(time).toLocaleDateString(undefined, { month: "short", year: "numeric" });

/** One line to put in a deck or an update: the value, its trend and its target. */
export function quoteMetric(summary: MetricSummary): string {
  const { metric, latest, first } = summary;
  if (!latest) return `${metric.name}: no value yet`;
  const trend = first && first !== latest ? `, ${summary.improving === false ? "down" : latest.value >= first.value ? "up" : "down"} from ${format(first.value, metric.unit)} in ${month(first.at)}` : "";
  const target = metric.target !== null ? ` (target ${format(metric.target, metric.unit)}${summary.onTarget ? ", met" : ""})` : "";
  return `${metric.name}: ${format(latest.value, metric.unit)}${trend}${target}`;
}

interface MetricRow {
  id: number;
  name: string;
  unit: string;
  target: number | null;
  higher_is_better: number;
  created_at: number;
}

interface PointRow {
  id: number;
  metric_id: number;
  at: number;
  value: number;
  note: string;
}

export class MetricStore {
  constructor(private readonly db: Db) {}

  async metrics(): Promise<Metric[]> {
    const rows = await this.db.all<MetricRow>("SELECT * FROM metrics ORDER BY name COLLATE NOCASE");
    return rows.map((row) => ({ id: row.id, name: row.name, unit: row.unit, target: row.target, higherIsBetter: row.higher_is_better === 1, createdAt: row.created_at }));
  }

  async points(): Promise<MetricPoint[]> {
    const rows = await this.db.all<PointRow>("SELECT * FROM metric_points ORDER BY at");
    return rows.map((row) => ({ id: row.id, metricId: row.metric_id, at: row.at, value: row.value, note: row.note }));
  }

  async add(input: { name: string; unit: string; target: number | null; higherIsBetter: boolean; at?: number }): Promise<number> {
    if (!input.name.trim()) throw new Error("A metric needs a name.");
    const { lastInsertId } = await this.db.run("INSERT INTO metrics (name, unit, target, higher_is_better, created_at) VALUES (?, ?, ?, ?, ?)", [
      input.name.trim(),
      input.unit,
      input.target,
      input.higherIsBetter ? 1 : 0,
      input.at ?? Date.now(),
    ]);
    return lastInsertId;
  }

  async update(id: number, input: { name: string; unit: string; target: number | null; higherIsBetter: boolean }): Promise<void> {
    await this.db.run("UPDATE metrics SET name = ?, unit = ?, target = ?, higher_is_better = ? WHERE id = ?", [input.name.trim(), input.unit, input.target, input.higherIsBetter ? 1 : 0, id]);
  }

  async remove(id: number): Promise<void> {
    await this.db.run("DELETE FROM metric_points WHERE metric_id = ?", [id]);
    await this.db.run("DELETE FROM metrics WHERE id = ?", [id]);
  }

  async record(metricId: number, value: number, at = Date.now(), note = ""): Promise<number> {
    if (!Number.isFinite(value)) throw new Error("That is not a number.");
    const { lastInsertId } = await this.db.run("INSERT INTO metric_points (metric_id, at, value, note) VALUES (?, ?, ?, ?)", [metricId, at, value, note.trim()]);
    return lastInsertId;
  }

  async removePoint(id: number): Promise<void> {
    await this.db.run("DELETE FROM metric_points WHERE id = ?", [id]);
  }
}

export const METRIC_TABLES = [
  `CREATE TABLE IF NOT EXISTS metrics (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     unit TEXT NOT NULL DEFAULT '',
     target REAL,
     higher_is_better INTEGER NOT NULL DEFAULT 1,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS metric_points (
     id INTEGER PRIMARY KEY,
     metric_id INTEGER NOT NULL REFERENCES metrics(id) ON DELETE CASCADE,
     at INTEGER NOT NULL,
     value REAL NOT NULL,
     note TEXT NOT NULL DEFAULT ''
   )`,
];
