"use client";

type NotificationDropdownProps = {
  notifications?: any[];
};

export default function NotificationDropdown({
  notifications = [],
}: NotificationDropdownProps) {

  return (
    <div className="absolute right-0 top-[58px] z-50 w-[340px] overflow-hidden rounded-2xl border border-white/[0.05] bg-[#111318]/95 shadow-2xl backdrop-blur-xl">

      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-3">

        <div>

          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">

            Notifications

          </p>

          <h2 className="mt-1 text-[16px] font-semibold text-white">

            Activity

          </h2>

        </div>

        <button className="text-[11px] text-zinc-500 transition hover:text-white">

          Clear

        </button>

      </div>

      {/* LIST */}
      <div className="max-h-[420px] overflow-y-auto">

        {notifications.length === 0 ? (

          <div className="flex flex-col items-center justify-center px-6 py-10 text-center">

            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04]">

              <span className="text-zinc-500">

                •

              </span>

            </div>

            <p className="mt-4 text-[13px] font-medium text-white">

              No notifications yet

            </p>

            <p className="mt-1 text-[11px] text-zinc-500">

              Marketplace activity will appear here.

            </p>

          </div>

        ) : (

          <div className="p-2">

            {notifications.map(
              (
                notification,
                index
              ) => (

                <div
                  key={index}
                  className="flex gap-3 rounded-xl p-3 transition hover:bg-white/[0.04]"
                >

                  {/* AVATAR */}
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500 text-[12px] font-medium text-white">

                    {notification.user?.[0] || "S"}

                  </div>

                  {/* CONTENT */}
                  <div className="min-w-0 flex-1">

                    <p className="text-[12px] text-white">

                      {notification.message}

                    </p>

                    <p className="mt-1 text-[10px] text-zinc-500">

                      {notification.time || "Now"}

                    </p>

                  </div>

                </div>
              )
            )}

          </div>
        )}

      </div>

    </div>
  );
}