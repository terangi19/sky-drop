"use client";

import { useState } from "react";
import { parseCopyablePaymentLines } from "../lib/arrange-payment-details";

export default function ArrangePaymentCopyBar({ text }: { text: string }) {
  const lines = parseCopyablePaymentLines(text || "");
  const [copied, setCopied] = useState<string | null>(null);

  if (lines.length === 0) return null;

  async function copyValue(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-sky-400/90">Quick copy</p>
      {lines.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[11px] text-zinc-400">
            <span className="text-zinc-500">{row.label}:</span> {row.value}
          </span>
          <button
            type="button"
            onClick={() => copyValue(row.label, row.value)}
            className="shrink-0 rounded-md bg-sky-500/15 px-2 py-1 text-[10px] font-bold text-sky-400 hover:bg-sky-500/25"
          >
            {copied === row.label ? "Copied" : "Copy"}
          </button>
        </div>
      ))}
    </div>
  );
}
