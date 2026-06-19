"use client";

import Link from "next/link";
import { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-[var(--foreground)] sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8 lg:gap-3">
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string | number;
  href?: string;
}) {
  const inner = (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2.5">
      <p className="text-lg font-bold tabular-nums text-[var(--foreground)] sm:text-xl">{value}</p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)] sm:text-[11px]">
        {label}
      </p>
    </div>
  );
  if (href) return <Link href={href} className="transition hover:opacity-90">{inner}</Link>;
  return inner;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-[var(--card-border)] bg-[var(--card)] ${className}`}>
      {children}
    </div>
  );
}

export function PanelHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[var(--card-border)] px-4 py-3">
      <h2 className="text-sm font-bold text-[var(--foreground)]">{title}</h2>
      {right}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "sky" | "amber" | "red" | "green";
}) {
  const tones = {
    neutral: "bg-white/5 text-[var(--muted)] border-white/10",
    sky: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  };
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Btn({
  children,
  onClick,
  variant = "neutral",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "neutral" | "sky" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const styles = {
    neutral: "border-[var(--card-border)] bg-[var(--soft-card)] text-[var(--foreground)] hover:bg-white/5",
    sky: "border-sky-500/30 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20",
    danger: "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition disabled:opacity-50 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onSubmit?.()}
      placeholder={placeholder}
      className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-sky-500/50"
    />
  );
}

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="border-b border-[var(--card-border)] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`border-b border-[var(--card-border)] px-3 py-2.5 align-top text-[var(--foreground)] ${className}`}>{children}</td>;
}

export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-[var(--muted)]">
        {message}
      </td>
    </tr>
  );
}

export function LoadingBlock({ message = "Loading..." }: { message?: string }) {
  return <div className="px-4 py-12 text-center text-sm text-[var(--muted)]">{message}</div>;
}

export async function confirmAction(message: string) {
  return window.confirm(message);
}
