type UserBadgeProps = {
  verified?: boolean;
  trusted?: boolean;
};

export default function UserBadge({
  verified,
  trusted,
}: UserBadgeProps) {

  return (
    <div className="flex items-center gap-2">

      {verified && (
        <div className="flex items-center gap-1 rounded-md bg-sky-500/[0.08] px-2 py-1">

          <div className="h-1.5 w-1.5 rounded-full bg-sky-400" />

          <span className="text-[10px] font-medium text-sky-300">

            Verified

          </span>

        </div>
      )}

      {!verified && trusted && (
        <div className="flex items-center gap-1 rounded-md bg-emerald-500/[0.08] px-2 py-1">

          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />

          <span className="text-[10px] font-medium text-emerald-300">

            Trusted

          </span>

        </div>
      )}

    </div>
  );
}