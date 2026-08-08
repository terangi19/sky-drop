/** Compact Āwhina mark for launchers — readable at ~20–24px. */
type Props = {
  className?: string;
  size?: number;
};

export default function AwhinaMark({ className = "", size = 22 }: Props) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      fill="none"
      aria-hidden
    >
      <rect
        x="7"
        y="10"
        width="18"
        height="15"
        rx="4.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M16 5.5v4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="16" cy="4.25" r="1.75" fill="currentColor" />
      <circle cx="12.25" cy="16.5" r="1.6" fill="currentColor" />
      <circle cx="19.75" cy="16.5" r="1.6" fill="currentColor" />
      <path
        d="M12.5 21.25h7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
