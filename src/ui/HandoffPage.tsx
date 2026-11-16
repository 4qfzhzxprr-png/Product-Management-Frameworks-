import { Button, Input, Select } from "antd";
import { Copy, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  defaultHandoffSettings,
  draftHandoffNote,
  handoffItems,
  overlap,
  type HandoffSettings,
} from "../core/handoff";
import type { Capture } from "../core/models";
import type { CaptureStore } from "../core/store";
import type { WorkItem } from "../core/work";
import { GlassCard } from "./components";
import { message } from "./useStore";

const SETTINGS_KEY = "handoff";

const ZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
})();

// Some systems list a zone under an older city name. These let a search for the current name find it.
const ALSO_KNOWN_AS: Record<string, string> = {
  "Asia/Calcutta": "Kolkata, India",
  "Asia/Saigon": "Ho Chi Minh City",
  "Asia/Katmandu": "Kathmandu",
  "Asia/Rangoon": "Yangon",
  "Europe/Kiev": "Kyiv",
};

function zoneLabel(zone: string): string {
  const name = zone.replace(/_/g, " ");
  return ALSO_KNOWN_AS[zone] ? `${name} (${ALSO_KNOWN_AS[zone]})` : name;
}

function timeIn(zone: string, at: number): string {
  return new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(at);
}

function duration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${minutes} min` : minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}

/** Shared hours with the offshore team, what to send before signing off, and a draft note. */
export function HandoffPage({
  store,
  work,
  captures,
  now,
}: {
  store: CaptureStore;
  work: WorkItem[];
  captures: Capture[];
  now: number;
}) {
  const myZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [settings, setSettings] = useState<HandoffSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    store.settings.get<HandoffSettings>(SETTINGS_KEY).then(
      (saved) => setSettings({ ...defaultHandoffSettings(myZone), ...saved }),
      (cause) => setError(message(cause)),
    );
  }, [store, myZone]);

  const items = useMemo(
    () => (settings ? handoffItems(work, captures, settings, now) : null),
    [work, captures, settings, now],
  );
  const draft = items ? draftHandoffNote(items, now) : "";

  if (error) return <p className="error page-message">{error}</p>;
  if (!settings || !items) return null;

  function update(change: Partial<HandoffSettings>) {
    const next = { ...settings!, ...change };
    setSettings(next);
    store.settings.set(SETTINGS_KEY, next).catch((cause) => setError(message(cause)));
  }

  const ready = settings.offshoreZone !== "";
  const hours = ready ? overlap(settings, now) : null;
  const time = (key: "myStart" | "myEnd" | "offshoreStart" | "offshoreEnd", label: string) => (
    <label>
      {label}
      <input type="time" value={settings[key]} onChange={(event) => update({ [key]: event.target.value })} />
    </label>
  );

  return (
    <div className="page">
      <header className="page-head">
        <h1>Handoff</h1>
        <p>When your day and the offshore team's overlap, and what to send them before you sign off.</p>
      </header>

      <div className="handoff-grid">
        <div className="brief-side">
          <GlassCard className="workspace-card" index={0} aria-labelledby="hours-title">
            <h2 id="hours-title">Working hours</h2>
            {!hours ? (
              <p className="muted">Choose the offshore team's time zone below to see when your days overlap.</p>
            ) : (
              <dl className="facts">
                <div>
                  <dt>Their time now</dt>
                  <dd>
                    {timeIn(settings.offshoreZone, now)} · {hours.offshoreWorkingNow ? "at work" : "off"}
                  </dd>
                </div>
                <div>
                  <dt>Shared hours today</dt>
                  <dd>
                    {hours.window
                      ? `${timeIn(settings.myZone, hours.window[0])} to ${timeIn(settings.myZone, hours.window[1])} your time (${duration(hours.window[1] - hours.window[0])})`
                      : "None. Everything goes in the note."}
                  </dd>
                </div>
                <div>
                  <dt>Your day ends</dt>
                  <dd>
                    {timeIn(settings.myZone, hours.myDayEndsAt)}
                    {hours.myDayEndsAt > now ? ` · ${duration(hours.myDayEndsAt - now)} left` : " · already over"}
                  </dd>
                </div>
                <div>
                  <dt>They start next</dt>
                  <dd>{timeIn(settings.myZone, hours.offshoreStartsAt)} your time</dd>
                </div>
              </dl>
            )}

            <div className="pm-section">
              <h3>Settings</h3>
              <div className="handoff-settings">
                <label className="wide">
                  Offshore time zone
                  <Select
                    showSearch
                    placeholder="Choose a time zone"
                    value={settings.offshoreZone || undefined}
                    onChange={(offshoreZone) => update({ offshoreZone })}
                    options={ZONES.map((zone) => ({ value: zone, label: zoneLabel(zone) }))}
                    optionFilterProp="label"
                  />
                </label>
                {time("offshoreStart", "They start")}
                {time("offshoreEnd", "They finish")}
                {time("myStart", "I start")}
                {time("myEnd", "I finish")}
                <label className="wide">
                  Offshore team name in the tracker
                  <Input
                    value={settings.offshoreTeam}
                    placeholder="Leave empty for every team"
                    onChange={(event) => update({ offshoreTeam: event.target.value })}
                  />
                </label>
              </div>
              <p className="muted small">Your time zone is {settings.myZone.replace(/_/g, " ")}, taken from this Mac.</p>
            </div>
          </GlassCard>
        </div>

        <GlassCard className="workspace-card" index={1} aria-labelledby="send-title">
          <h2 id="send-title">Before you sign off</h2>
          <div className="pm-section">
            <h3>
              Waiting on a product answer {items.answers.length > 0 && <span className="count">{items.answers.length}</span>}
            </h3>
            {work.length === 0 ? (
              <p className="muted small">No issue tracker is connected yet, so blocked tickets are not shown.</p>
            ) : items.answers.length === 0 ? (
              <p className="muted small">Nothing is waiting on you.</p>
            ) : (
              <ul className="workspace-list">
                {items.answers.map((item) => (
                  <li key={item.id}>
                    <div>
                      <p>
                        {item.externalId} {item.title}
                      </p>
                      <p className="muted small">{item.team}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="pm-section">
            <h3>
              Promised for today or late {items.promised.length > 0 && <span className="count">{items.promised.length}</span>}
            </h3>
            {items.promised.length === 0 ? (
              <p className="muted small">Nothing due.</p>
            ) : (
              <ul className="workspace-list">
                {items.promised.map((capture) => (
                  <li key={capture.id}>
                    <p>{capture.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="pm-section">
            <h3>Still waiting on from others {items.asks.length > 0 && <span className="count">{items.asks.length}</span>}</h3>
            {items.asks.length === 0 ? (
              <p className="muted small">Nothing open.</p>
            ) : (
              <ul className="workspace-list">
                {items.asks.map((capture) => (
                  <li key={capture.id}>
                    <p>{capture.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </GlassCard>

        <GlassCard className="workspace-card" index={2} aria-labelledby="note-title">
          <h2 id="note-title">Draft handoff note</h2>
          <p className="muted small">A starting point built from the lists. Edit it, copy it, and send it yourself.</p>
          <Input.TextArea
            aria-label="Draft handoff note"
            autoSize={{ minRows: 12, maxRows: 22 }}
            value={note ?? draft}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="note-actions">
            {note !== null && note !== draft && (
              <Button icon={<RotateCcw size={14} aria-hidden="true" />} onClick={() => setNote(null)}>
                Start over
              </Button>
            )}
            <Button
              type="primary"
              icon={<Copy size={14} aria-hidden="true" />}
              onClick={() => {
                navigator.clipboard.writeText(note ?? draft).then(
                  () => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  },
                  () => setError("Could not copy. Select the text and copy it by hand."),
                );
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
