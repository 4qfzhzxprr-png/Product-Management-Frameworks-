import { Progress, Tag } from "antd";
import { CalendarClock, type LucideIcon } from "lucide-react";
import { nextMeetingWith } from "../core/calendar";
import type { CalendarEventRecord } from "../core/calendar";
import type { Person } from "../core/models";
import { useEffect, useState, type ReactNode } from "react";

/** The shared frosted surface. Every panel in the app is one of these. */
export function GlassCard({
  className = "",
  index = 0,
  children,
  ...rest
}: {
  className?: string;
  /** Position in a group, for a staggered entrance. */
  index?: number;
  children: ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`glass ${className}`} style={{ "--i": index } as React.CSSProperties} {...rest}>
      {children}
    </section>
  );
}

/** A white ring for the coral hero that fills to `value` (0 to 1) after mounting. */
export function CircularProgress({ value, label, caption }: { value: number; label: string; caption: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <div className="ring" role="img" aria-label={`${label} ${caption}`}>
      <Progress
        type="circle"
        aria-hidden="true"
        percent={Math.round(Math.min(Math.max(shown, 0), 1) * 100)}
        size={148}
        strokeWidth={7}
        strokeColor="#ffffff"
        railColor="rgba(255, 255, 255, 0.28)"
        format={() => (
          <span className="ring-text">
            <strong>{label}</strong>
            <span>{caption}</span>
          </span>
        )}
      />
    </div>
  );
}

/** A tiny trend line with no axes; the numbers it summarizes are stated beside it. */
export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const width = 84;
  const height = 28;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * (width - 4) + 2;
    const y = height - 3 - (value / max) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <polyline points={points.join(" ")} />
    </svg>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  index,
  onClick,
  actionLabel,
  chip,
  accent = false,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  index: number;
  onClick?: () => void;
  /** What clicking does, for screen readers. */
  actionLabel?: string;
  /** A short note in the top corner, such as a change since last week. */
  chip?: string;
  /** The one card per row drawn in coral glass. */
  accent?: boolean;
  /** A sparkline, drawn in the bottom corner. */
  children?: ReactNode;
}) {
  const content = (
    <>
      <span className="stat-top">
        <span className="stat-icon" aria-hidden="true">
          <Icon size={17} />
        </span>
        {chip && (
          <Tag className="stat-chip" variant="filled">
            {chip}
          </Tag>
        )}
      </span>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      <span className="stat-detail">{detail}</span>
      {children}
    </>
  );
  const style = { "--i": index } as React.CSSProperties;
  const className = accent ? "glass stat accent" : "glass stat";
  return onClick ? (
    <button
      className={`${className} lift`}
      style={style}
      onClick={onClick}
      aria-label={`${label}: ${value}, ${detail}. ${actionLabel}`}
    >
      {content}
    </button>
  ) : (
    <div className={className} style={style}>
      {content}
    </div>
  );
}

/** "Next meeting: Thu, Nov 19, 10:00 AM · Priya / David 1:1", from meetings that name the person. */
export function NextMeeting({ person, upcoming, now }: { person: Person; upcoming: CalendarEventRecord[]; now: number }) {
  const meeting = nextMeetingWith(person, upcoming, now);
  if (!meeting) return null;
  const when = new Date(meeting.startsAt).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <p className="next-meeting small">
      <CalendarClock size={14} aria-hidden="true" /> Next meeting: {when} · {meeting.title}
    </p>
  );
}
