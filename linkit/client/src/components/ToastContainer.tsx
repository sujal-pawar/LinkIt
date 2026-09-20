import { useEffect, useRef } from "react";
import { useToastListener } from "../hooks/useToast";
import type { ToastItem, ToastType } from "../hooks/useToast";

const COLORS: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  error:   { bg: "rgba(244,33,46,0.12)",   border: "rgba(244,33,46,0.35)",   text: "var(--color-error)",   icon: "✕" },
  warning: { bg: "rgba(255,212,0,0.12)",   border: "rgba(255,212,0,0.35)",   text: "var(--color-warning)", icon: "⚠" },
  success: { bg: "rgba(47,211,154,0.12)",   border: "rgba(47,211,154,0.35)",   text: "var(--color-success)", icon: "✓" },
  info:    { bg: "rgba(160,139,255,0.14)",  border: "rgba(160,139,255,0.35)",  text: "var(--color-accent)",  icon: "ℹ" },
};

const AUTO_DISMISS_MS: Record<ToastType, number> = {
  error: 6000, warning: 5000, success: 3000, info: 4000,
};

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const c = COLORS[item.type];
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, AUTO_DISMISS_MS[item.type]);
    return () => clearTimeout(timerRef.current);
  }, [item.type, onDismiss]);

  return (
    <div
      className="animate-fade-in flex items-start gap-3 px-4 py-3 rounded-xl text-sm max-w-xs w-full shadow-lg"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}
      role="alert"
    >
      <span className="font-bold text-base leading-none mt-0.5 flex-shrink-0" style={{ color: c.text }}>
        {c.icon}
      </span>
      <p className="flex-1 leading-snug" style={{ color: c.text }}>{item.message}</p>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 text-xs leading-none opacity-60 hover:opacity-100 transition-opacity"
        style={{ color: c.text }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

/** Mount once at the App root — renders all active toasts in the top-right corner. */
export function ToastContainer() {
  const { toasts, dismiss } = useToastListener();

  return (
    <div
      style={{
        position: "fixed",
        top: "1rem",
        right: "1rem",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        pointerEvents: "none",
      }}
    >
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: "auto" }}>
          <Toast item={t} onDismiss={() => dismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}
