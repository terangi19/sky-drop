"use client";

import { useEffect, useState } from "react";
import { TOAST_STACK_POSITION } from "../lib/floating-ui-layout";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

let toastId = 0;
let addToastFn: ((msg: string, type?: "success" | "error" | "info") => void) | null = null;

export function showToast(message: string, type: "success" | "error" | "info" = "success") {
  addToastFn?.(message, type);
}

const icons = {
  success: "✓",
  error: "✕",
  info: "i",
};

const typeClass = {
  success: "border-[var(--success)]/25 bg-[var(--success-muted)] text-[var(--success)]",
  error: "border-[var(--danger)]/25 bg-[var(--danger-muted)] text-[var(--danger)]",
  info: "border-[var(--info)]/25 bg-[var(--info-muted)] text-[var(--info)]",
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    addToastFn = (message, type = "success") => {
      const id = ++toastId;
      const duration = type === "error" ? 6000 : 3000;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    };
    return () => {
      addToastFn = null;
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className={`${TOAST_STACK_POSITION} pointer-events-none flex flex-col gap-2`}
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold shadow-[var(--shadow-md)] backdrop-blur-xl animate-toast-in ${typeClass[t.type]}`}
        >
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full bg-black/10 text-[10px] font-bold"
            aria-hidden
          >
            {icons[t.type]}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
