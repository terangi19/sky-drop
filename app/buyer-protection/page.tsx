import type { Metadata } from "next";
import Link from "next/link";
import HelpTrustLayout from "../components/HelpTrustLayout";

export const metadata: Metadata = {
  title: "Stay Safe",
  description: "Practical safety advice for arranging a purchase directly with a seller on Sky Drop.",
  alternates: { canonical: "/buyer-protection" },
};

export default function StaySafePage() {
  return (
    <HelpTrustLayout activePath="/buyer-protection" eyebrow="Trust & safety" title="Stay safe on Sky Drop" intro="Sky Drop is messaging-first: buyers and sellers arrange payment, pickup or delivery directly. Take time to check the details before you commit.">
      <h2 id="before-you-buy">Before you buy</h2>
      <ul>
        <li>Read the listing carefully and ask about condition, availability, location and anything that matters to you.</li>
        <li>Check the seller profile and any available verification or review information, but treat it as one signal—not a guarantee.</li>
        <li>Keep price, item condition, payment and pickup or delivery details in Sky Drop Messages.</li>
      </ul>

      <h2 id="paying-safely">Paying safely</h2>
      <p>Sky Drop does not operate marketplace checkout, hold funds, provide escrow, or automatically refund direct arrangements. Agree the payment method directly with the seller. For a physical item, inspect it before payment where practical.</p>
      <ul>
        <li>Never share your password, bank login, card details or one-time verification code.</li>
        <li>Do not rely only on a screenshot or email claiming a payment was made.</li>
        <li>Be wary of requests for gift cards, cryptocurrency, overpayments or a fee to “release” money.</li>
      </ul>

      <h2 id="meeting-and-delivery">Pickup and delivery</h2>
      <p>Choose a public, well-lit pickup place for physical items where possible. For higher-value items, consider taking someone with you. If delivery is involved, agree who is arranging it, the cost and what happens if it does not arrive before paying.</p>

      <h2 id="scam-signs">Common scam signs</h2>
      <ul>
        <li>Pressure to pay immediately, especially before you have agreed the details.</li>
        <li>A request to move to another app before the terms are clear.</li>
        <li>Links or messages asking you to sign in, verify a bank account or provide a code.</li>
        <li>A price that seems implausibly low, or a seller who will not answer basic questions about the item.</li>
      </ul>

      <h2 id="reporting">Report a concern</h2>
      <p>If a listing, seller or message breaks Sky Drop&apos;s rules, use the Report option on the listing, seller profile or conversation. Include the relevant facts and keep your messages available. Reports can help Sky Drop review account or listing conduct, but they do not reverse payments made directly between users.</p>
      <p><Link href="/faqs">Read the FAQs</Link> for more help using the marketplace.</p>
    </HelpTrustLayout>
  );
}
