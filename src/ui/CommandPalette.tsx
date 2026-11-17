import { Input, Modal, type InputRef } from "antd";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { search, type SearchData, type SearchTarget } from "../core/search";

/**
 * Command-K: type to find captures, people, projects, tickets, roadmap items and agent runs, or
 * to jump to a page. Arrow keys move, Return opens, Escape closes. Rendered only while open.
 */
export function CommandPalette({ data, onPick, onClose }: { data: SearchData; onPick: (target: SearchTarget) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<InputRef>(null);
  const results = useMemo(() => search(query, data), [query, data]);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    // The dialog's own focus handling runs first; take the focus back for the box.
    const timer = setTimeout(() => input.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (index: number) => {
    const result = results[index];
    if (!result) return;
    onClose();
    onPick(result.target);
  };

  return (
    <Modal open footer={null} closable={false} onCancel={onClose} width={620} className="palette" title={null}>
      <Input
        ref={input}
        size="large"
        variant="borderless"
        prefix={<Search size={18} aria-hidden="true" />}
        placeholder="Search captures, people, tickets, agent runs, or go to a page"
        aria-label="Search everything"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="palette-results"
        aria-activedescendant={results.length > 0 ? `palette-${active}` : undefined}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => Math.min(results.length - 1, index + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(0, index - 1));
          } else if (event.key === "Enter") {
            event.preventDefault();
            pick(active);
          }
        }}
      />
      {query.trim() && (
        <ul id="palette-results" className="palette-results" role="listbox" aria-label="Results" ref={list}>
          {results.length === 0 ? (
            <li className="muted small palette-empty">Nothing matches “{query.trim()}”.</li>
          ) : (
            results.map((result, index) => (
              <li
                key={`${result.group}-${index}`}
                id={`palette-${index}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? "active" : ""}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(index)}
              >
                <span className="palette-group">{result.group}</span>
                <span className="palette-title">{result.title}</span>
                <span className="muted small palette-detail">{result.detail}</span>
              </li>
            ))
          )}
        </ul>
      )}
      <p className="muted small palette-hint">Up and down to move, Return to open, Escape to close.</p>
    </Modal>
  );
}
