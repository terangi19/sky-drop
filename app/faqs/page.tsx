import type { Metadata } from "next";
import Link from "next/link";
import HelpTrustLayout from "../components/HelpTrustLayout";

export const metadata: Metadata = {
  title: "FAQs",
  description: "Answers about listing, messaging, arranging purchases, safety, accounts and Āwhina on Sky Drop.",
  alternates: { canonical: "/faqs" },
};

const groups = [
  ["Getting started", [["What is Sky Drop?", "Sky Drop is a New Zealand marketplace where people browse listings, message each other and arrange purchases directly."], ["How do I create a listing?", "Use the sell flow to add the details yourself, or start with Āwhina and review the drafted information before publishing."]]],
  ["Buying", [["How do I buy something?", "Open the listing and choose Message Seller. Ask questions and agree the price, payment method and pickup or delivery directly with the seller."], ["Does Sky Drop handle my payment?", "No. Marketplace checkout is not active. Sky Drop does not hold or move money for listing purchases, and it does not provide automatic refunds or a buyer guarantee."]]],
  ["Selling", [["What should I include in a listing?", "Use accurate photos, an honest description, the condition, location and a clear NZD price. Include important faults or limitations."], ["How do I complete a sale?", "Keep communication in Messages, agree the arrangement with the buyer, and take reasonable steps to confirm payment or collection before handing over an item."]]],
  ["Payments & arranging", [["Can I arrange bank transfer, cash or delivery?", "You and the other person choose how to arrange the trade. Be clear about payment and delivery or pickup terms in Messages. Sky Drop is not a party to that arrangement."], ["Should I pay before seeing an item?", "For physical items, inspect the item where practical before paying. For expensive items, use extra care and avoid pressure to act quickly."]]],
  ["Pickup & delivery", [["Does Sky Drop provide shipping labels?", "No. Buyers and sellers arrange pickup or delivery themselves."], ["Where should I meet?", "Choose a public, well-lit place for physical items where possible. Take someone with you for a high-value collection if that makes sense."]]],
  ["Āwhina", [["What can Āwhina help with?", "Āwhina can help turn a description into a listing draft, including a listing type, title, description and relevant details. It can also help with platform questions."], ["Are Āwhina suggestions final?", "No. AI-generated text and price suggestions are starting points. Check them for accuracy, condition, availability and price before publishing."]]],
  ["Accounts & reviews", [["Do I need an account?", "You need an account to use account-only features such as messaging, listing and managing your profile."], ["How do reviews work?", "Reviews are available for eligible completed transaction records. A review is not a guarantee of an item, seller or outcome."], ["Can I delete my account?", "Account controls are available in your profile. For privacy questions or help, contact support."]]],
  ["Safety", [["How do I report a problem?", "Use Report on a listing or seller profile, or the report option in a conversation. Include clear details. Sky Drop can review reports and take action under its rules, but cannot reverse a payment arranged outside the platform."], ["What are common scam signs?", "Be cautious of rushed payment requests, requests for passwords or one-time codes, fake payment confirmations, unexpected links and pressure to move the conversation away before terms are agreed."]]],
] as const;

export default function FAQsPage() {
  return (
    <HelpTrustLayout activePath="/faqs" eyebrow="Help" title="Frequently asked questions" intro="Straight answers about using Sky Drop, from your first listing to arranging a purchase safely.">
      {groups.map(([heading, items]) => (
        <section key={heading} aria-labelledby={`faq-${heading}`}>
          <h2 id={`faq-${heading}`}>{heading}</h2>
          {items.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p className="mb-4">{answer}</p>
            </details>
          ))}
        </section>
      ))}
      <p>Looking for practical advice before a trade? <Link href="/buyer-protection">Visit Stay Safe</Link>.</p>
    </HelpTrustLayout>
  );
}
