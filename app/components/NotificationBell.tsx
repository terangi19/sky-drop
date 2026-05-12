"use client";

type NotificationBellProps = {
  count?: number;
  onClick?: () => void;
};

export default function NotificationBell({
  count = 0,
  onClick,
}: NotificationBellProps) {

  return (
    <button
      onClick={onClick}
      className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.04] bg-[#111318]/90 transition hover:bg-white/[0.05]"
    >

      {/* ICON */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-4 w-4 text-zinc-400"
      >
        <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
        <path d="M10 21a2 2 0 0 0 4 0" />
      </svg>

      {/* COUNT */}
      {count > 0 && (
        <div className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-medium text-white">

          {count}

        </div>
      )}

    </button>
  );
}