import { Alert, Button, Modal, Segmented } from "antd";
import { Copy, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { REVIEW_SYSTEM, reviewPacket, reviewPacketText } from "../core/leading";
import type { Capture, Person } from "../core/models";
import type { WorkItem } from "../core/work";
import type { Agents } from "./useAgents";
import { useSensitiveGuard } from "./useSensitiveGuard";
import { message } from "./useStore";

/** Everything the app holds about one PM over a period, and a first draft of the review from it. */
export function ReviewPrep({
  person,
  captures,
  work,
  now,
  ask,
  onClose,
}: {
  person: Person;
  captures: Capture[];
  work: WorkItem[];
  now: number;
  ask: Agents["ask"];
  onClose: () => void;
}) {
  const [months, setMonths] = useState(6);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"packet" | "draft" | null>(null);
  const [guard, guardHolder] = useSensitiveGuard();
  const packet = useMemo(() => reviewPacket(person, captures, work, now, months), [person, captures, work, now, months]);
  const text = reviewPacketText(packet);
  const thin = packet.wins.length + packet.feedback.length + packet.delivered.length + packet.oneOnOnes.length < 3;

  const copy = (which: "packet" | "draft", value: string) =>
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(which);
        setTimeout(() => setCopied(null), 2000);
      },
      () => setError("Could not copy."),
    );

  return (
    <Modal open title={`Review prep: ${person.name}`} width={780} footer={null} onCancel={onClose}>
      {guardHolder}
      <div className="job-form">
        <div className="note-actions start">
          <Segmented<number>
            aria-label="Period"
            value={months}
            onChange={(value) => {
              setMonths(value);
              setDraft(null);
            }}
            options={[
              { value: 3, label: "3 months" },
              { value: 6, label: "6 months" },
              { value: 12, label: "12 months" },
            ]}
          />
        </div>
        <p className="muted small">
          {packet.wins.length} wins and praise, {packet.feedback.length} feedback, {packet.delivered.length} delivered when asked,{" "}
          {packet.oneOnOnes.length} 1:1 notes.
          {thin ? " That is thin evidence for a review; capture wins and feedback as they happen." : ""}
        </p>
        <div className="run-output review-packet" tabIndex={0}>
          {text}
        </div>
        {draft && (
          <>
            <h3 className="draft-heading">First draft from Claude</h3>
            <div className="run-output" tabIndex={0}>
              {draft}
            </div>
          </>
        )}
        {error && <Alert type="error" showIcon title={error} />}
        <div className="note-actions">
          <Button icon={<Copy size={14} aria-hidden="true" />} onClick={() => void copy("packet", text)}>
            {copied === "packet" ? "Copied" : "Copy the evidence"}
          </Button>
          {draft ? (
            <Button type="primary" icon={<Copy size={14} aria-hidden="true" />} onClick={() => void copy("draft", draft)}>
              {copied === "draft" ? "Copied" : "Copy the draft"}
            </Button>
          ) : (
            <Button
              type="primary"
              loading={busy}
              icon={<Sparkles size={14} aria-hidden="true" />}
              onClick={() => {
                setBusy(true);
                setError(null);
                guard((allowSensitive) => ask({ purpose: "review-prep", system: REVIEW_SYSTEM, prompt: text, allowSensitive }))
                  .then((answer) => answer !== null && setDraft(answer), (cause) => setError(message(cause)))
                  .finally(() => setBusy(false));
              }}
            >
              Draft the review with Claude
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
