import type { Metadata } from "next";
import Link from "next/link";
import HelpTrustLayout from "../components/HelpTrustLayout";

export const metadata: Metadata = {
  title: "About",
  description: "Learn how Sky Drop helps people across New Zealand list, discover and arrange purchases directly.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <HelpTrustLayout activePath="/about" eyebrow="Help" title="About Sky Drop" intro="A New Zealand marketplace for discovering listings, connecting with people and arranging purchases directly.">
      <h2 id="what-is-sky-drop">A marketplace built for local trade</h2>
      <p>Sky Drop helps people in Aotearoa list items and services, discover what they need, and connect directly with each other. Listings use NZD, and buyers and sellers make their own arrangements.</p>

      <h2 id="how-it-works">How it works</h2>
      <ol>
        <li><strong>Find or list.</strong> Browse, search, or create a listing with a clear title, description, price and photos.</li>
        <li><strong>Message.</strong> Use Message Seller to ask questions and agree the details in one place.</li>
        <li><strong>Arrange the trade.</strong> Buyers and sellers agree payment, pickup or delivery directly. Sky Drop does not provide marketplace checkout, hold funds or guarantee refunds for these arrangements.</li>
      </ol>

      <h2 id="awhina">Meet Āwhina</h2>
      <p>Āwhina is Sky Drop&apos;s listing assistant. Describe what you are selling and it can help select a listing type, draft a title and description, and fill relevant listing details. Photo-assisted listing help is available when enabled. Review every generated detail, price and description before you publish.</p>
      <p><Link href="/post/ai">Create a listing with Āwhina</Link></p>

      <h2 id="community">For buyers and sellers</h2>
      <p>Keep important questions and agreements in Sky Drop Messages. This gives both people a record of the listing and conversation. Use good judgement when arranging a trade, especially for higher-value or physical items.</p>
      <p><Link href="/buyer-protection">Read practical safety advice</Link> or <Link href="/seller-guidelines">learn how to create a useful listing</Link>.</p>

      <h2 id="new-zealand">Built for New Zealand</h2>
      <p>Sky Drop is operated in New Zealand and designed around the way local buyers and sellers connect. For questions about the service, email <a href="mailto:support@skydrop.co.nz">support@skydrop.co.nz</a>.</p>
    </HelpTrustLayout>
  );
}
