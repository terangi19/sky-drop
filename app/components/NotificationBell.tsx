"use client";

type NotificationBellProps = {
  count?: number;
  onClick?: () => void;
  className?: string;
};

export default function NotificationBell({
  count = 0,
  onClick,
  className = "",
}: NotificationBellProps) {
  const hasNotifications = count > 0;
  const sharedClassName = `relative flex h-9 w-9 items-center justify-center rounded-lg transition ${hasNotifications ? "animate-breathe-glow" : ""} ${className}`;

  const icon = (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>

      {hasNotifications && (
        <span className="absolute -right-1.5 -top-1.5 flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-always-white ring-2 ring-[var(--card)]">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={sharedClassName}>
        {icon}
      </button>
    );
  }

  return <span className={sharedClassName}>{icon}</span>;
}
