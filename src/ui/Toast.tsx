import { Button } from "antd";
import { CheckCircle2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface ToastInput {
  text: string;
  /** Shown as an Undo button; the toast closes when it is pressed. */
  undo?: () => Promise<void> | void;
}

interface ToastState extends ToastInput {
  id: number;
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

/** Shows a short confirmation after an action, with Undo where it can be undone. */
export function useToast(): (toast: ToastInput) => void {
  return useContext(ToastContext);
}

/** How long a toast stays, unless the pointer or focus is on it. */
const SHOW_FOR_MS = 6000;

/** One toast at a time: a new one replaces the last, so the latest action is always the one undone. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [held, setHeld] = useState(false);
  const counter = useRef(0);

  const show = useCallback((input: ToastInput) => {
    counter.current += 1;
    setToast({ ...input, id: counter.current });
  }, []);

  useEffect(() => {
    if (!toast || held) return;
    const timer = setTimeout(() => setToast((current) => (current?.id === toast.id ? null : current)), SHOW_FOR_MS);
    return () => clearTimeout(timer);
  }, [toast, held]);

  // Command-Z (Control-Z off the Mac) undoes the action the toast offers, unless typing in a field.
  useEffect(() => {
    if (!toast?.undo) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z" || !(event.metaKey || event.ctrlKey) || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      const undo = toast.undo;
      setToast(null);
      void undo?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div
            key={toast.id}
            className="toast"
            onMouseEnter={() => setHeld(true)}
            onMouseLeave={() => setHeld(false)}
            onFocus={() => setHeld(true)}
            onBlur={() => setHeld(false)}
          >
            <CheckCircle2 size={16} aria-hidden="true" className="toast-icon" />
            <span className="toast-text">{toast.text}</span>
            {toast.undo && (
              <Button
                size="small"
                type="text"
                className="toast-undo"
                onClick={() => {
                  const undo = toast.undo;
                  setToast(null);
                  setHeld(false);
                  void undo?.();
                }}
              >
                Undo
              </Button>
            )}
            <Button
              size="small"
              type="text"
              shape="circle"
              className="toast-close"
              icon={<X size={14} aria-hidden="true" />}
              aria-label="Close"
              onClick={() => {
                setToast(null);
                setHeld(false);
              }}
            />
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

/** Shortens a capture or item title for a toast. */
export function quote(text: string, max = 48): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return `“${clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean}”`;
}
