import { useState, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
export type ToastType = "error" | "warning" | "success" | "info";

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

// ── Module-level singleton ────────────────────────────────────────────────────
// Any component or hook can call toast() without needing Context or prop-drilling.
const listeners = new Set<(t: ToastItem) => void>();
let nextId = 0;

export function toast(message: string, type: ToastType = "info") {
  const item: ToastItem = { id: nextId++, message, type };
  listeners.forEach(fn => fn(item));
}

/** Mount this once at the App root to receive all toasts. */
export function useToastListener() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const fn = (t: ToastItem) => setToasts(prev => [...prev, t]);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const dismiss = (id: number) =>
    setToasts(prev => prev.filter(t => t.id !== id));

  return { toasts, dismiss };
}
