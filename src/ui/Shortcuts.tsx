import { Modal } from "antd";
import { useEffect } from "react";

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const COMMAND = isMac ? "Command" : "Control";

const SHORTCUTS: [string, string][] = [
  ["Control-Option-Space", "Quick capture, from any app"],
  ["Return", "Save a capture"],
  ["Shift-Return", "New line in a capture"],
  ["Escape", "Close a dialog, or leave a 1:1 workspace"],
  [`${COMMAND}-Z`, "Undo the last done, clear or delete, while its notice shows"],
  ["?", "Show these shortcuts"],
];

/** The keyboard shortcuts, opened with "?" or from the sidebar. */
export function Shortcuts({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      onOpenChange(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  // Rendered only while open: reopening an Ant Design dialog during its closing animation can
  // leave an invisible layer over the page that swallows clicks.
  if (!open) return null;
  return (
    <Modal open title="Keyboard shortcuts" footer={null} onCancel={() => onOpenChange(false)} width={460}>
      <dl className="shortcuts">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={keys}>
            <dt>
              {keys.split(/-(?=.)/).map((key, index) => (
                <kbd key={index}>{key}</kbd>
              ))}
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
