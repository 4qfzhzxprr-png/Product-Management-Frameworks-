import { Button, Dropdown, Tag } from "antd";
import { ArrowUpRight, Check, MoveRight } from "lucide-react";
import { BUCKET_LABELS, BUCKETS, type Bucket, type SourceItem } from "../core/items";
import { openExternal } from "../platform";

function ago(time: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** One synced item: where it came from, what it says, and what David can do with it. */
export function ItemRow({
  item,
  now,
  onMove,
  onDismiss,
}: {
  item: SourceItem;
  now: number;
  onMove: (item: SourceItem, bucket: Bucket) => void;
  onDismiss: (item: SourceItem) => void;
}) {
  return (
    <li className="item">
      <div className="item-text">
        <p className="item-meta">
          <Tag variant="filled">{item.sourceName}</Tag>
          <span>
            {[item.kind, item.fromMe ? "You" : item.author, ago(item.occurredAt, now)]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </p>
        <button className="item-title" onClick={() => void openExternal(item.url)} title="Open in its own system">
          {item.title} <ArrowUpRight size={14} aria-hidden="true" />
        </button>
        {item.snippet && <p className="item-snippet">{item.snippet}</p>}
      </div>
      <div className="item-actions">
        <Dropdown
          trigger={["click"]}
          menu={{
            items: BUCKETS.filter((bucket) => bucket !== item.bucket).map((bucket) => ({
              key: bucket,
              label: BUCKET_LABELS[bucket],
            })),
            onClick: ({ key }) => onMove(item, key as Bucket),
          }}
        >
          <Button type="text" shape="circle" icon={<MoveRight size={16} aria-hidden="true" />} aria-label="Move to another list" title="Move to another list" />
        </Dropdown>
        <Button
          type="text"
          shape="circle"
          icon={<Check size={16} aria-hidden="true" />}
          aria-label="Dismiss"
          title="Dismiss"
          onClick={() => onDismiss(item)}
        />
      </div>
    </li>
  );
}
