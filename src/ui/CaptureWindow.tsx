import { useEffect, useState } from "react";
import { hideThisWindow, notifyDataChanged, onCaptureOpened } from "../platform";
import { CaptureForm } from "./CaptureForm";
import { useStore } from "./useStore";

/** The floating window opened by the global shortcut. */
export function CaptureWindow() {
  const { store, error } = useStore();
  // Bumped each time the window is shown, so the form starts empty.
  const [opened, setOpened] = useState(0);

  useEffect(() => onCaptureOpened(() => setOpened((count) => count + 1)), []);

  if (error) return <p className="error capture-window">{error}</p>;
  if (!store) return null;

  return (
    <div className="capture-window" data-tauri-drag-region>
      <CaptureForm
        key={opened}
        store={store}
        onSaved={() => {
          void notifyDataChanged();
          void hideThisWindow();
        }}
        onCancel={() => void hideThisWindow()}
      />
    </div>
  );
}
