import { ARRANGE_KYC_SUPPORT_EMAIL } from "../lib/arrange-payment-details";

type Props = {
  className?: string;
};

export default function KycBuyerAssuranceBanner({ className = "" }: Props) {
  return (
    <div
      className={`rounded-lg border border-sky-500/15 bg-sky-500/[0.04] px-3 py-2.5 ${className}`}
      role="note"
    >
      <p className="text-[11px] leading-relaxed text-zinc-400">
        <span className="font-semibold text-sky-400/90">Trusted seller.</span>{" "}
        If your item doesn&apos;t arrive, contact{" "}
        <a
          href={`mailto:${ARRANGE_KYC_SUPPORT_EMAIL}`}
          className="font-medium text-sky-400/90 underline decoration-sky-500/30 underline-offset-2 hover:text-sky-300"
        >
          {ARRANGE_KYC_SUPPORT_EMAIL}
        </a>{" "}
        — we&apos;ll investigate and do our best to help you recover your payment.
      </p>
    </div>
  );
}
