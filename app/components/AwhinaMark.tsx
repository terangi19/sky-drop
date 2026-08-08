/** Āwhina sparkle mark — recognisable at launcher sizes (~16–20px). */
type Props = {
  className?: string;
  size?: number;
};

export default function AwhinaMark({ className = "", size = 18 }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      aria-hidden
    >
      {/* Primary four-point sparkle */}
      <path
        d="M12 2.25l1.55 6.2 6.2 1.55-6.2 1.55L12 17.75l-1.55-6.2-6.2-1.55 6.2-1.55L12 2.25z"
        fill="currentColor"
        opacity="0.95"
      />
      {/* Secondary accent spark */}
      <path
        d="M18.75 3.5l0.55 2.05 2.05 0.55-2.05 0.55-0.55 2.05-0.55-2.05-2.05-0.55 2.05-0.55 0.55-2.05z"
        fill="currentColor"
        opacity="0.72"
      />
    </svg>
  );
}
