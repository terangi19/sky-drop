import Link from "next/link";

/** Banner for historical purchase/sales/dispute pages when listing checkout is off. */
export default function HistoricalOrdersNotice({
  audience = "buyer",
}: {
  audience?: "buyer" | "seller" | "dispute";
}) {
  const body =
    audience === "seller"
      ? "Sky Drop is messaging-first: buyers message you to arrange payment and pickup. Past sales below remain available to you."
      : audience === "dispute"
        ? "Sky Drop is messaging-first. This page is for past orders. Agree on payment and delivery directly with the other party in Messages."
        : "Sky Drop is messaging-first: message sellers and arrange the purchase directly. Past orders below remain available to you.";

  return (
    <div
      role="status"
      className="mb-5 rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100/95"
    >
      <p className="font-semibold text-sky-200">Messaging-first marketplace</p>
      <p className="mt-1 text-sky-100/80">{body}</p>
      <p className="mt-2 text-xs text-sky-200/70">
        Agree on payment, pickup or delivery directly with the seller. Meet in a public place and
        verify the item before paying.{" "}
        <Link href="/messages" className="font-semibold text-sky-300 underline-offset-2 hover:underline">
          Open Messages
        </Link>
      </p>
    </div>
  );
}
