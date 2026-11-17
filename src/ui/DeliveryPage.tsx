import { Button, Progress, Tag } from "antd";
import { ArrowUpRight } from "lucide-react";
import { blockers, deliveryPulse, staleItems, type WorkItem } from "../core/work";
import { openExternal } from "../platform";
import { GlassCard } from "./components";
import { useNavigate } from "./navigation";
import { describeTimeOff, offDuring, workingDays, type TimeOff } from "../core/leading";
import type { Person } from "../core/models";

function daysSince(time: number, now: number): string {
  const days = Math.floor((now - time) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "1 day" : `${days} days`;
}

function sprintEnd(time: number | null, now: number): string {
  if (time === null) return "no end date";
  const days = Math.ceil((time - now) / 86_400_000);
  return days < 0 ? "ended" : days === 0 ? "ends today" : days === 1 ? "ends tomorrow" : `ends in ${days} days`;
}

function WorkRow({ item, now, note }: { item: WorkItem; now: number; note: string }) {
  return (
    <li className="item">
      <div className="item-text">
        <p className="item-meta">
          <Tag variant="filled">{item.team || item.sourceName}</Tag>
          <span>{[item.externalId, item.statusLabel, item.ownerName].filter(Boolean).join(" · ")}</span>
        </p>
        <button className="item-title" onClick={() => void openExternal(item.url)} title="Open in its own system">
          {item.title} <ArrowUpRight size={14} aria-hidden="true" />
        </button>
        <p className="item-snippet">
          {note} · last changed {daysSince(item.updatedAt, now)}
          {daysSince(item.updatedAt, now) === "today" ? "" : " ago"}
        </p>
      </div>
    </li>
  );
}

/** Sprint progress per team, what is stuck, and what has gone quiet. */
export function DeliveryPage({ work, now, timeOff = [], people = [] }: { work: WorkItem[]; now: number; timeOff?: TimeOff[]; people?: Person[] }) {
  const pulse = deliveryPulse(work, now);
  const stuck = blockers(work);
  const quiet = staleItems(work, now);
  const navigate = useNavigate();
  // Who is out between now and the latest sprint end (or the next two weeks without sprints).
  const horizon = Math.max(now + 14 * 86_400_000, ...work.map((item) => item.sprintEndsAt ?? 0));
  const away = offDuring(timeOff, now, horizon);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Delivery</h1>
        <p>Sprint progress per team, what is stuck, and what has gone quiet.</p>
      </header>

      {away.length > 0 && (
        <section className="slip-banner time-off-banner" aria-label="Time off this sprint">
          <p>
            <strong>Out before the sprint ends:</strong>{" "}
            {away
              .map((entry) => `${describeTimeOff(entry, people)} (${workingDays(Math.max(entry.startsAt, now), Math.min(entry.endsAt, horizon))} working days)`)
              .join("; ")}
            .
          </p>
        </section>
      )}

      {work.length === 0 ? (
        <GlassCard className="team-empty">
          <h2>No tickets synced yet</h2>
          <p className="muted">
            This page fills from an issue tracker. None is connected yet, so there is no sprint progress, blockers or
            stale tickets to show. A CSV export from any tracker is enough.
          </p>
          <Button type="primary" onClick={() => navigate("connections")}>
            Import tickets
          </Button>
        </GlassCard>
      ) : (
        <>
          {pulse.length === 0 ? (
            <GlassCard>
              <p className="muted">No team has tickets in a sprint right now.</p>
            </GlassCard>
          ) : (
            <div className="pulse-grid">
              {pulse.map((team, index) => (
                <GlassCard key={team.team} className="pulse" index={index} aria-label={`${team.team} sprint`}>
                  <header>
                    <h2>{team.team}</h2>
                    <p className="muted small">
                      {team.sprint} · {sprintEnd(team.sprintEndsAt, now)}
                    </p>
                  </header>
                  <div className="pulse-figure">
                    <span className="stat-value">{Math.round((team.done / team.total) * 100)}%</span>
                    <span className="muted">
                      {team.done} of {team.total} done
                    </span>
                  </div>
                  <Progress
                    percent={Math.round((team.done / team.total) * 100)}
                    showInfo={false}
                    strokeColor="var(--bar)"
                    aria-label={`${team.done} of ${team.total} done`}
                  />
                  <p className="muted small">
                    {team.inProgress} in progress · {team.blocked} blocked · {team.todo} not started
                  </p>
                  <div className="pm-section">
                    <h3>
                      At risk {team.atRisk.length > 0 && <span className="count">{team.atRisk.length}</span>}
                    </h3>
                    {team.atRisk.length === 0 ? (
                      <p className="muted small">Nothing looks likely to miss.</p>
                    ) : (
                      <ul className="items">
                        {team.atRisk.map(({ item, reason }) => (
                          <WorkRow key={item.id} item={item} now={now} note={reason} />
                        ))}
                      </ul>
                    )}
                  </div>
                </GlassCard>
              ))}
            </div>
          )}

          <div className="brief-grid">
            <GlassCard className="brief-section" index={2} aria-label="Blocked or waiting on product">
              <h2>
                Blocked or waiting on product {stuck.length > 0 && <span className="count">{stuck.length}</span>}
              </h2>
              {stuck.length === 0 ? (
                <p className="muted">Nothing is blocked.</p>
              ) : (
                <ul className="items">
                  {stuck.map((item) => (
                    <WorkRow
                      key={item.id}
                      item={item}
                      now={now}
                      note={item.waitingOnProduct ? "Waiting on a product answer" : "Blocked"}
                    />
                  ))}
                </ul>
              )}
            </GlassCard>
            <GlassCard className="brief-section" index={3} aria-label="Gone quiet">
              <h2>Gone quiet {quiet.length > 0 && <span className="count">{quiet.length}</span>}</h2>
              {quiet.length === 0 ? (
                <p className="muted">Everything in progress has moved in the last week.</p>
              ) : (
                <ul className="items">
                  {quiet.map((item) => (
                    <WorkRow key={item.id} item={item} now={now} note="In progress, untouched for a week or more" />
                  ))}
                </ul>
              )}
            </GlassCard>
          </div>
        </>
      )}
    </div>
  );
}
