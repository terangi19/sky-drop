"use client";

import { useEffect, useState } from "react";

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

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    addToastFn = (message, type) => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    };
    return () => { addToastFn = null; };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-24 md:bottom-6 right-6 z-[99999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-bold shadow-2xl backdrop-blur-xl pointer-events-auto ${
            t.type === "success"
              ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-400"
              : t.type === "error"
                ? "border-red-500/25 bg-red-500/15 text-red-400"
                : "border-sky-500/25 bg-sky-500/15 text-sky-400"
          } animate-toast-in`}
        >
          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
            t.type === "success" ? "bg-emerald-500/20" :
            t.type === "error" ? "bg-red-500/20" :
            "bg-sky-500/20"
          }`}>
            {icons[t.type]}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
