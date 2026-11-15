import type { LucideIcon } from "lucide-react";
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

/** A ring that fills to `value` (0 to 1) after mounting. */
export function CircularProgress({ value, label, caption }: { value: number; label: string; caption: string }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <div className="ring" role="img" aria-label={`${label} ${caption}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="ring-track" cx="60" cy="60" r={radius} />
        <circle
          className="ring-value"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(Math.max(shown, 0), 1))}
        />
      </svg>
      <div className="ring-text" aria-hidden="true">
        <strong>{label}</strong>
        <span>{caption}</span>
      </div>
    </div>
  );
}

/** A tiny trend line with no axes; the numbers it summarizes are stated beside it. */
export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const width = 96;
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
  children?: ReactNode;
}) {
  const content = (
    <>
      <span className="stat-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-detail">{detail}</span>
      {children}
    </>
  );
  const style = { "--i": index } as React.CSSProperties;
  return onClick ? (
    <button className="glass stat lift" style={style} onClick={onClick} aria-label={`${label}: ${value}. ${actionLabel}`}>
      {content}
    </button>
  ) : (
    <div className="glass stat" style={style}>
      {content}
    </div>
  );
}
