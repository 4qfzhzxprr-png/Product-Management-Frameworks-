import { Alert, Button, Checkbox, Input, Segmented, Select, Tag } from "antd";
import { Copy, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildPreread,
  exportNarrative,
  narrativeBank,
  ONE_PAGE_WORDS,
  prereadGaps,
  QUIET_DAYS,
  stakeholderMap,
  STORY_LABELS,
  STORY_TYPES,
  storyType,
  wordCount,
  type Preread,
  type PrereadFields,
  type Stakeholder,
  type StakeholderProfile,
  type StoryType,
} from "../core/influence";
import type { Capture, CaptureKind, Person, Project } from "../core/models";
import type { CaptureStore } from "../core/store";
import { GlassCard } from "./components";
import { AddLine } from "./OneOnOnePage";
import { message } from "./useStore";

type Tab = "bank" | "stakeholders" | "prereads";

const TABS: { value: Tab; label: string }[] = [
  { value: "bank", label: "Narrative bank" },
  { value: "stakeholders", label: "Stakeholders" },
  { value: "prereads", label: "Pre-reads" },
];

/** Dropdowns cannot hold null, so "none" is stored as -1 while choosing. Ids start at 1. */
const NONE = -1;
const fromChoice = (value: number): number | null => (value === NONE ? null : value);

function shortDate(time: number): string {
  return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function age(time: number, now: number): string {
  const days = Math.floor((now - time) / 86_400_000);
  return days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
}

function useCopy(): [string | null, (key: string, text: string) => void, string | null] {
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copy = (key: string, text: string) =>
    navigator.clipboard.writeText(text).then(
      () => {
        setError(null);
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
      },
      () => setError("Could not copy. Select the text and copy it by hand."),
    );
  return [copied, copy, error];
}

interface Props {
  store: CaptureStore;
  people: Person[];
  projects: Project[];
  captures: Capture[];
  profiles: StakeholderProfile[];
  prereads: Preread[];
  now: number;
  change: (work: () => Promise<unknown>) => Promise<void>;
  /** Opens quick capture set to this person and kind. */
  onCapture: (personId: number, kind: CaptureKind) => void;
  onOpenOneOnOne: (personId: number) => void;
}

/** C-suite influence: the stories to tell, who to tell them to, and one-page pre-reads. */
export function InfluencePage(props: Props) {
  const [tab, setTab] = useState<Tab>("bank");
  return (
    <div className="page">
      <header className="page-head with-controls">
        <div>
          <h1>Influence</h1>
          <p>Wins and evidence collected as they happen, what each executive cares about, and pre-reads that lead with the ask.</p>
        </div>
        <Segmented<Tab> aria-label="Section" value={tab} onChange={setTab} options={TABS} />
      </header>
      {tab === "bank" && <NarrativeBank {...props} />}
      {tab === "stakeholders" && <Stakeholders {...props} />}
      {tab === "prereads" && <Prereads {...props} />}
      <p className="muted small private-note">
        Stakeholder notes and pre-reads are private: they are stored on this Mac only and are never synced.
      </p>
    </div>
  );
}

// ---------- Narrative bank ----------

const PERIODS = [
  { value: 30, label: "30 days" },
  { value: 90, label: "Quarter" },
  { value: 365, label: "Year" },
  { value: 0, label: "All" },
];

function NarrativeBank({ store, projects, captures, now, change }: Props) {
  const [type, setType] = useState<StoryType | "all">("all");
  const [days, setDays] = useState(90);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [copied, copy, copyError] = useCopy();

  const [text, setText] = useState("");
  const [newType, setNewType] = useState<StoryType>("win");
  const [newProject, setNewProject] = useState<number | null>(null);

  const entries = narrativeBank(
    captures,
    { type: type === "all" ? undefined : type, projectId: projectId ?? undefined, days: days || undefined },
    now,
  );
  const all = narrativeBank(captures, {}, now);
  const counts = Object.fromEntries(STORY_TYPES.map((key) => [key, all.filter((entry) => storyType(entry) === key).length]));
  const chosen = entries.filter((entry) => selected.has(entry.id));
  const projectName = (id: number | null) => projects.find((project) => project.id === id)?.name;

  function add() {
    if (!text.trim()) return;
    const kind: CaptureKind = newType === "win" ? "note" : newType;
    void change(() => store.addCapture({ body: text, kind, isWin: newType === "win", projectId: newProject }));
    setText("");
  }

  return (
    <>
      <GlassCard aria-labelledby="bank-add">
        <h2 id="bank-add">Add to the bank</h2>
        <p className="muted small">
          Anything captured as a win, customer evidence or a metric lands here too, including from the quick capture shortcut.
        </p>
        <form
          className="bank-form"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <Input
            aria-label="What happened"
            placeholder="A win, a customer quote, or a number worth quoting"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <Select<StoryType>
            aria-label="Type"
            value={newType}
            onChange={setNewType}
            options={STORY_TYPES.map((key) => ({ value: key, label: STORY_LABELS[key] }))}
          />
          <Select<number>
            aria-label="Project"
            value={newProject ?? NONE}
            onChange={(value) => setNewProject(fromChoice(value))}
            options={[{ value: NONE, label: "No project" }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
          />
          <Button htmlType="submit" type="primary" disabled={!text.trim()}>
            Add
          </Button>
        </form>
      </GlassCard>

      <GlassCard className="workspace-card" aria-labelledby="bank-title">
        <div className="chart-head">
          <h2 id="bank-title">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </h2>
          <span className="muted small">
            {counts.win} wins · {counts.evidence} customer evidence · {counts.metric} metrics in total
          </span>
        </div>
        <div className="bank-filters">
          <Segmented<StoryType | "all">
            aria-label="Type"
            value={type}
            onChange={setType}
            options={[{ value: "all", label: "All" }, ...STORY_TYPES.map((key) => ({ value: key, label: STORY_LABELS[key] }))]}
          />
          <Segmented<number> aria-label="Period" value={days} onChange={setDays} options={PERIODS} />
          <Select<number>
            aria-label="Filter by project"
            value={projectId ?? NONE}
            onChange={(value) => setProjectId(fromChoice(value))}
            options={[{ value: NONE, label: "Every project" }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
          />
        </div>

        {entries.length === 0 ? (
          <p className="muted">
            {all.length === 0
              ? "Nothing yet. Tag captures as wins, or add customer evidence and metrics above, and they collect here."
              : "Nothing matches these filters."}
          </p>
        ) : (
          <ul className="items">
            {entries.map((entry) => {
              const kind = storyType(entry)!;
              return (
                <li key={entry.id} className="item">
                  <Checkbox
                    checked={selected.has(entry.id)}
                    aria-label={`Select: ${entry.body}`}
                    onChange={(event) => {
                      const next = new Set(selected);
                      if (event.target.checked) next.add(entry.id);
                      else next.delete(entry.id);
                      setSelected(next);
                    }}
                  />
                  <div className="item-text">
                    <p className="item-meta">
                      <Tag className={`story ${kind}`} variant="filled">
                        {STORY_LABELS[kind]}
                      </Tag>
                      <span>{[projectName(entry.projectId), shortDate(entry.createdAt)].filter(Boolean).join(" · ")}</span>
                    </p>
                    <p>{entry.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {copyError && <p className="error">{copyError}</p>}
        <div className="note-actions">
          {chosen.length > 0 && (
            <Button onClick={() => setSelected(new Set())}>Clear selection</Button>
          )}
          <Button
            icon={<Copy size={14} aria-hidden="true" />}
            disabled={chosen.length === 0}
            onClick={() => copy("selected", exportNarrative(chosen, projects))}
          >
            {copied === "selected" ? "Copied" : `Copy selected (${chosen.length})`}
          </Button>
          <Button
            type="primary"
            icon={<Copy size={14} aria-hidden="true" />}
            disabled={entries.length === 0}
            onClick={() => copy("all", exportNarrative(entries, projects))}
          >
            {copied === "all" ? "Copied" : "Copy everything shown"}
          </Button>
        </div>
      </GlassCard>
    </>
  );
}

// ---------- Stakeholders ----------

function ProfileEditor({
  stakeholder,
  onSave,
  onCancel,
}: {
  stakeholder: Stakeholder;
  onSave: (values: { title: string; goals: string; concerns: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(stakeholder.profile.title);
  const [goals, setGoals] = useState(stakeholder.profile.goals);
  const [concerns, setConcerns] = useState(stakeholder.profile.concerns);
  return (
    <form
      className="note-form profile-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ title, goals, concerns });
      }}
    >
      <label className="field">
        Role
        <Input value={title} placeholder="For example, CFO" onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="field">
        What they are trying to achieve
        <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} value={goals} onChange={(event) => setGoals(event.target.value)} />
      </label>
      <label className="field">
        What worries them
        <Input.TextArea
          autoSize={{ minRows: 2, maxRows: 6 }}
          value={concerns}
          onChange={(event) => setConcerns(event.target.value)}
        />
      </label>
      <span className="note-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button htmlType="submit" type="primary">
          Save
        </Button>
      </span>
    </form>
  );
}

function Stakeholders({ store, people, captures, profiles, now, change, onCapture, onOpenOneOnOne }: Props) {
  const map = stakeholderMap(profiles, people, captures, now);
  const [editing, setEditing] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const onMap = new Set(profiles.map((profile) => profile.personId));
  const candidates = people.filter((person) => !onMap.has(person.id) && !person.isPM);

  const addByName = (name: string) =>
    void change(async () => {
      const person = await store.addPerson(name);
      await store.influence.saveStakeholder(person.id, { title, goals: "", concerns: "" });
      setTitle("");
    });

  return (
    <>
      <GlassCard aria-labelledby="add-stakeholder">
        <h2 id="add-stakeholder">Add an executive</h2>
        <div className="stakeholder-add">
          <Input
            aria-label="Their role"
            placeholder="Role, for example CFO"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <AddLine placeholder="Their name" onAdd={addByName} />
          {candidates.length > 0 && (
            <Select<number>
              showSearch
              aria-label="Or choose someone already in the app"
              placeholder="Or choose someone already in the app"
              value={null as unknown as number}
              optionFilterProp="label"
              onChange={(personId) =>
                void change(async () => {
                  await store.influence.saveStakeholder(personId, { title, goals: "", concerns: "" });
                  setTitle("");
                })
              }
              options={candidates.map((person) => ({ value: person.id, label: person.name }))}
            />
          )}
        </div>
      </GlassCard>

      {map.length === 0 ? (
        <p className="muted">
          No executives on the map yet. Add the people whose support you need, then note what each one is trying to
          achieve and what worries them.
        </p>
      ) : (
        <div className="team-grid">
          {map.map((stakeholder, index) => (
            <GlassCard key={stakeholder.person.id} className="pm-card" index={index} aria-label={stakeholder.person.name}>
              <header className="pm-head">
                <span className="avatar" aria-hidden="true">
                  {stakeholder.person.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <h2>{stakeholder.person.name}</h2>
                  <p className="muted small">
                    {[
                      stakeholder.profile.title,
                      stakeholder.lastContactAt === null ? "Nothing captured yet" : `Last contact ${age(stakeholder.lastContactAt, now)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {stakeholder.quiet && (
                  <Tag className="quiet" variant="filled">
                    {stakeholder.lastContactAt === null ? "No contact yet" : `Quiet ${QUIET_DAYS}+ days`}
                  </Tag>
                )}
              </header>

              {editing === stakeholder.person.id ? (
                <ProfileEditor
                  stakeholder={stakeholder}
                  onCancel={() => setEditing(null)}
                  onSave={(values) =>
                    void change(async () => {
                      await store.influence.saveStakeholder(stakeholder.person.id, values);
                      setEditing(null);
                    })
                  }
                />
              ) : (
                <>
                  <div className="pm-section">
                    <h3>Trying to achieve</h3>
                    <p className={stakeholder.profile.goals ? "pre" : "muted small"}>
                      {stakeholder.profile.goals || "Not noted yet."}
                    </p>
                  </div>
                  <div className="pm-section">
                    <h3>Worried about</h3>
                    <p className={stakeholder.profile.concerns ? "pre" : "muted small"}>
                      {stakeholder.profile.concerns || "Not noted yet."}
                    </p>
                  </div>
                </>
              )}

              <div className="pm-section">
                <h3>Last asked about</h3>
                {stakeholder.lastAsk ? (
                  <>
                    <p>{stakeholder.lastAsk.body}</p>
                    <p className="muted small">
                      {age(stakeholder.lastAsk.createdAt, now)}
                      {stakeholder.lastAsk.doneAt ? " · done" : " · open"}
                    </p>
                  </>
                ) : (
                  <p className="muted small">Nothing captured. Log it when they ask you for something.</p>
                )}
              </div>
              {stakeholder.openAsks.length > 1 && (
                <p className="muted small">{stakeholder.openAsks.length} of their asks are still open.</p>
              )}

              <div className="pm-actions">
                <Button
                  size="small"
                  icon={<Plus size={14} aria-hidden="true" />}
                  onClick={() => onCapture(stakeholder.person.id, "ask_of_me")}
                >
                  Log an ask
                </Button>
                <Button size="small" onClick={() => onOpenOneOnOne(stakeholder.person.id)}>
                  Notes and agenda
                </Button>
                {editing !== stakeholder.person.id && (
                  <Button
                    size="small"
                    type="text"
                    icon={<Pencil size={14} aria-hidden="true" />}
                    aria-label={`Edit ${stakeholder.person.name}`}
                    onClick={() => setEditing(stakeholder.person.id)}
                  />
                )}
                <Button
                  size="small"
                  type="text"
                  icon={<X size={14} aria-hidden="true" />}
                  aria-label={`Take ${stakeholder.person.name} off the map`}
                  title="Take off the map (their captures are kept)"
                  onClick={() => void change(() => store.influence.removeStakeholder(stakeholder.person.id))}
                />
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- Pre-reads ----------

function toFields(preread: Preread): PrereadFields {
  const { title, personId, ask, whyNow, background, options, recommendation, evidenceIds } = preread;
  return { title, personId, ask, whyNow, background, options, recommendation, evidenceIds };
}

function Prereads({ store, people, captures, profiles, prereads, now, change }: Props) {
  const [openId, setOpenId] = useState<number | null>(prereads[0]?.id ?? null);
  const [newTitle, setNewTitle] = useState("");
  const map = stakeholderMap(profiles, people, captures, now);

  // Open the newest pre-read once one exists.
  useEffect(() => {
    if (openId === null && prereads.length > 0) setOpenId(prereads[0].id);
    if (openId !== null && !prereads.some((preread) => preread.id === openId)) setOpenId(prereads[0]?.id ?? null);
  }, [prereads, openId]);

  const open = prereads.find((preread) => preread.id === openId) ?? null;

  return (
    <div className="prereads-layout">
      <GlassCard className="filters" aria-label="Pre-reads">
        <h2>Pre-reads</h2>
        <form
          className="add-field"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newTitle.trim()) return;
            let created: number | null = null;
            // Open it only once the list has reloaded, so the list does not snap back to another one.
            void change(async () => {
              created = await store.influence.createPreread(newTitle, null);
            }).then(() => {
              if (created !== null) setOpenId(created);
            });
            setNewTitle("");
          }}
        >
          <Input
            aria-label="New pre-read"
            placeholder="New pre-read: what is the meeting about?"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
          />
        </form>
        <ul>
          {prereads.map((preread) => (
            <li key={preread.id} className="filter-row">
              <button
                className={preread.id === openId ? "filter-item selected" : "filter-item"}
                aria-current={preread.id === openId ? "true" : undefined}
                onClick={() => setOpenId(preread.id)}
              >
                <span className="filter-label">{preread.title}</span>
              </button>
            </li>
          ))}
        </ul>
        {prereads.length === 0 && <p className="muted small">None yet.</p>}
      </GlassCard>

      {open ? (
        <PrereadEditor key={open.id} preread={open} stakeholders={map} captures={captures} now={now} store={store} change={change} />
      ) : (
        <GlassCard className="team-empty">
          <h2>One page, ask first</h2>
          <p className="muted">
            Name a meeting on the left to start a pre-read. It builds a one-page brief that opens with what you need, and
            reminds you what the person cares about while you write.
          </p>
        </GlassCard>
      )}
    </div>
  );
}

const FIELDS: { key: "ask" | "whyNow" | "background" | "options" | "recommendation"; label: string; hint: string }[] = [
  { key: "ask", label: "The ask", hint: "The decision or help you need, in one or two sentences. It goes first." },
  { key: "whyNow", label: "Why now", hint: "What happens if this waits." },
  { key: "background", label: "Background", hint: "Only what they need to decide." },
  { key: "options", label: "Options", hint: "Two or three, with the trade-off of each." },
  { key: "recommendation", label: "Recommendation", hint: "What you would do, and why." },
];

function PrereadEditor({
  preread,
  stakeholders,
  captures,
  now,
  store,
  change,
}: {
  preread: Preread;
  stakeholders: Stakeholder[];
  captures: Capture[];
  now: number;
  store: CaptureStore;
  change: Props["change"];
}) {
  const [fields, setFields] = useState<PrereadFields>(toFields(preread));
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, copy, copyError] = useCopy();

  const evidence = useMemo(() => narrativeBank(captures, {}, now), [captures, now]);
  const audience = stakeholders.find((entry) => entry.person.id === fields.personId) ?? null;
  const text = buildPreread(fields, { audience, evidence, now });
  const words = wordCount(text);
  const gaps = prereadGaps(fields);

  const update = (values: Partial<PrereadFields>) => {
    setFields({ ...fields, ...values });
    setSaved(false);
  };

  const save = () =>
    change(async () => {
      await store.influence.savePreread(preread.id, fields);
      setSaved(true);
    }).catch((cause) => setError(message(cause)));

  return (
    <div className="prereads-editor">
      <GlassCard className="workspace-card" aria-labelledby="preread-edit">
        <div className="chart-head">
          <h2 id="preread-edit">Write</h2>
          <span className="muted small">{saved ? "Saved" : "Not saved yet"}</span>
        </div>
        <label className="field">
          Title
          <Input value={fields.title} onChange={(event) => update({ title: event.target.value })} />
        </label>
        <label className="field">
          Meeting with
          <Select<number>
            aria-label="Meeting with"
            value={fields.personId ?? NONE}
            onChange={(value) => update({ personId: fromChoice(value) })}
            options={[
              { value: NONE, label: "Not chosen" },
              ...stakeholders.map((entry) => ({
                value: entry.person.id,
                label: `${entry.person.name}${entry.profile.title ? `, ${entry.profile.title}` : ""}`,
              })),
            ]}
          />
        </label>
        {stakeholders.length === 0 && (
          <p className="muted small">Add executives under Stakeholders to choose them here.</p>
        )}
        {audience && (audience.profile.goals || audience.profile.concerns) && (
          <div className="reminder">
            <p className="small">
              <strong>{audience.person.name} is trying to achieve:</strong> {audience.profile.goals || "not noted"}
            </p>
            <p className="small">
              <strong>Worried about:</strong> {audience.profile.concerns || "not noted"}
            </p>
          </div>
        )}
        {FIELDS.map((field) => (
          <label key={field.key} className="field">
            {field.label}
            <Input.TextArea
              aria-label={field.label}
              placeholder={field.hint}
              autoSize={{ minRows: field.key === "ask" ? 2 : 3, maxRows: 10 }}
              value={fields[field.key]}
              onChange={(event) => update({ [field.key]: event.target.value })}
            />
          </label>
        ))}
        <label className="field">
          Evidence from the narrative bank
          <Select<number[]>
            mode="multiple"
            aria-label="Evidence from the narrative bank"
            placeholder={evidence.length === 0 ? "The narrative bank is empty" : "Choose wins, quotes or metrics to cite"}
            value={fields.evidenceIds}
            onChange={(evidenceIds) => update({ evidenceIds })}
            optionFilterProp="label"
            options={evidence.map((entry) => ({
              value: entry.id,
              label: `${STORY_LABELS[storyType(entry)!]}: ${entry.body}`,
            }))}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="note-actions">
          <Button
            danger
            icon={<Trash2 size={14} aria-hidden="true" />}
            onClick={() => void change(() => store.influence.deletePreread(preread.id))}
          >
            Delete
          </Button>
          <Button type="primary" disabled={saved || !fields.title.trim()} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="workspace-card" aria-labelledby="preread-preview">
        <div className="chart-head">
          <h2 id="preread-preview">Preview</h2>
          <span className={words > ONE_PAGE_WORDS ? "small over" : "muted small"}>
            {words} words{words > ONE_PAGE_WORDS ? ` · over one page (about ${ONE_PAGE_WORDS})` : ""}
          </span>
        </div>
        {gaps.length > 0 && (
          <Alert type="warning" showIcon title="Before you send" description={<ul className="reasons">{gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>} />
        )}
        <pre className="preview" aria-label="Pre-read preview">
          {text}
        </pre>
        {copyError && <p className="error">{copyError}</p>}
        <div className="note-actions">
          <Button type="primary" icon={<Copy size={14} aria-hidden="true" />} onClick={() => copy("preread", text)}>
            {copied === "preread" ? "Copied" : "Copy"}
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
