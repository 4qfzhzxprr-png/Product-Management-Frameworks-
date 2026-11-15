import { Button, Table } from "antd";
import { useState } from "react";
import { axisTicks, type Bucket } from "../core/insights";

const dayFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

function bucketLabel(bucket: Bucket): string {
  const lastDay = new Date(bucket.end - 12 * 3_600_000).getTime();
  const single = bucket.end - bucket.start < 36 * 3_600_000;
  return single ? dayFormat.format(bucket.start) : `${dayFormat.format(bucket.start)} to ${dayFormat.format(lastDay)}`;
}

/** Captures per period as columns, with a hover and focus readout and a table view. */
export function BarChart({ buckets, unit }: { buckets: Bucket[]; unit: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  const ticks = axisTicks(Math.max(...buckets.map((bucket) => bucket.captured)));
  const top = ticks[ticks.length - 1];
  // Label about six columns, always including the last.
  const every = Math.ceil(buckets.length / 6);
  const showLabel = (index: number) => (buckets.length - 1 - index) % every === 0;
  const plural = (count: number) => `${count} ${count === 1 ? "capture" : "captures"}`;

  return (
    <div className="chart">
      <div className="chart-head">
        <p className="chart-note">Captures per {unit}</p>
        <Button type="link" onClick={() => setAsTable(!asTable)}>
          {asTable ? "Show chart" : "Show as table"}
        </Button>
      </div>

      {asTable ? (
        <Table
          className="chart-table"
          size="small"
          pagination={false}
          scroll={{ y: 280 }}
          rowKey="start"
          dataSource={buckets}
          columns={[
            { title: unit === "day" ? "Day" : "Week", key: "period", render: (_, bucket) => bucketLabel(bucket) },
            { title: "Captures", dataIndex: "captured", align: "right", width: 120 },
          ]}
        />
      ) : (
        <div className="plot">
          <div className="plot-axis" aria-hidden="true">
            {[...ticks].reverse().map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
          <div className="plot-area">
            <div className="plot-grid" aria-hidden="true">
              {ticks.map((tick) => (
                <span key={tick} />
              ))}
            </div>
            <ul className="plot-columns" onMouseLeave={() => setActive(null)}>
              {buckets.map((bucket, index) => (
                <li
                  key={bucket.start}
                  className={active === index ? "column active" : "column"}
                  tabIndex={0}
                  aria-label={`${bucketLabel(bucket)}: ${plural(bucket.captured)}`}
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                >
                  <span className="bar" style={{ height: `${(bucket.captured / top) * 100}%` }} />
                  {active === index && (
                    <span
                      className={index > buckets.length / 2 ? "tooltip left" : "tooltip"}
                      style={{ bottom: `calc(${(bucket.captured / top) * 100}% + 8px)` }}
                      aria-hidden="true"
                    >
                      <strong>{plural(bucket.captured)}</strong>
                      {bucketLabel(bucket)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="plot-labels" aria-hidden="true">
              {buckets.map((bucket, index) => (
                <span key={bucket.start}>{showLabel(index) ? dayFormat.format(bucket.start) : ""}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
