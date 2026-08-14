import type { Metadata } from "next";
import HelpTrustLayout from "../components/HelpTrustLayout";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using Sky Drop's New Zealand marketplace.",
  alternates: { canonical: "/terms" },
};

const toc = [
  ["acceptance", "1. Using Sky Drop"], ["accounts", "2. Accounts"], ["listings", "3. Listings"], ["arrangements", "4. Direct arrangements"], ["conduct", "5. Conduct"], ["reports", "6. Reports"], ["availability", "7. Availability"], ["liability", "8. Liability"], ["changes", "9. Changes and contact"],
] as const;

export default function TermsPage() {
  return (
    <HelpTrustLayout activePath="/terms" eyebrow="Legal" title="Terms of use" intro="These terms govern your use of Sky Drop. Please read them before using the marketplace." toc={toc.map(([id, label]) => ({ id, label }))}>
      <p>Last updated: 15 August 2026.</p>
      <h2 id="acceptance">1. Using Sky Drop</h2>
      <p>Sky Drop is a New Zealand online marketplace that helps users publish listings and communicate with each other. By using Sky Drop, you agree to these terms and applicable law. If you do not agree, do not use the service.</p>

      <h2 id="accounts">2. Accounts</h2>
      <p>You are responsible for information and activity associated with your account and for keeping your credentials secure. Do not share your password or use another person&apos;s account without permission. We may restrict or close accounts that breach these terms, create security risks or appear fraudulent.</p>

      <h2 id="listings">3. Listings</h2>
      <p>Listings must be accurate, lawful and not misleading. You must have the right to offer what you list. Do not list stolen goods, counterfeit goods, illegal goods, prohibited items, deceptive listings, spam or content that infringes another person&apos;s rights. We may remove listings that do not meet these requirements.</p>

      <h2 id="arrangements">4. Direct arrangements between users</h2>
      <p>Sky Drop&apos;s current marketplace model is messaging-first. Buyers and sellers arrange payment, pickup or delivery directly with each other. Sky Drop is not the seller or buyer of a listed item, does not provide marketplace checkout or escrow, does not hold funds, and does not guarantee a transaction, delivery or refund for a direct arrangement.</p>
      <p>Users must make their own decisions about payment, collection, delivery and counterparties. Keep relevant terms in Messages and use reasonable care.</p>

      <h2 id="conduct">5. Conduct</h2>
      <p>Do not scam, harass, impersonate, misrepresent an item, request passwords or one-time codes, interfere with the platform, or use Sky Drop for unlawful activity. You must not pressure another user into an unsafe arrangement. We may suspend or remove access where we reasonably believe this is necessary to protect users or the service.</p>

      <h2 id="reports">6. Reports and enforcement</h2>
      <p>You can report a listing, user or message through available reporting controls. We may review available information and take action under these terms. Reporting does not make Sky Drop a party to a transaction and does not require us to recover money or resolve every dispute.</p>

      <h2 id="availability">7. Availability and changes</h2>
      <p>We aim to keep Sky Drop available and useful, but do not promise uninterrupted or error-free access. Features may change, be paused or be removed. We may update these terms by publishing a revised version; continued use after publication means you accept the updated terms to the extent permitted by law.</p>

      <h2 id="liability">8. Liability</h2>
      <p>To the extent permitted by New Zealand law, Sky Drop is not liable for loss arising from user-generated listings, direct arrangements between users, or your use of the service. Nothing in these terms excludes rights that cannot lawfully be excluded.</p>

      <h2 id="changes">9. Changes and contact</h2>
      <p>If you have a question about these terms, contact <a href="mailto:support@skydrop.co.nz">support@skydrop.co.nz</a>. These terms should be reviewed by qualified New Zealand legal counsel before relying on them as a complete legal agreement.</p>
    </HelpTrustLayout>
  );
}
