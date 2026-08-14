import type { Metadata } from "next";
import Link from "next/link";
import HelpTrustLayout from "../components/HelpTrustLayout";

export const metadata: Metadata = {
  title: "Selling on Sky Drop",
  description: "Create clear listings, communicate with buyers and arrange sales directly on Sky Drop.",
  alternates: { canonical: "/seller-guidelines" },
};

export default function SellerGuidelinesPage() {
  return (
    <HelpTrustLayout activePath="/seller-guidelines" eyebrow="Help" title="Selling on Sky Drop" intro="Create an accurate listing, communicate clearly and arrange each sale directly with the buyer.">
      <h2 id="create-listing">Create a listing people can trust</h2>
      <ul>
        <li>Use a specific title, clear NZD price and the correct category.</li>
        <li>Add current photos that show the item and any significant wear or faults.</li>
        <li>Describe condition, included accessories, location and collection or delivery options honestly.</li>
        <li>Do not list prohibited, illegal, stolen, counterfeit or misleading items.</li>
      </ul>

      <h2 id="awhina">Use Āwhina as a starting point</h2>
      <p>Āwhina can help turn a description or supported photo input into a draft listing. Check every generated title, description, price suggestion and field before publishing. You are responsible for making sure your listing is accurate.</p>
      <p><Link href="/post/ai">Start a listing with Āwhina</Link></p>

      <h2 id="photos-and-pricing">Photos and pricing</h2>
      <p>Good photos help buyers make a decision. Use enough light, show important angles and include damage rather than hiding it. A price suggestion is not a valuation or a promise that an item will sell. Consider condition, demand and comparable local listings when choosing your price.</p>

      <h2 id="messages">Messages and arranging a sale</h2>
      <p>Buyers contact you through Message Seller. Keep the item, price, payment method and pickup or delivery plan clear in Messages. Sky Drop does not process marketplace payment or hold funds, so you and the buyer decide how to complete the arrangement.</p>
      <ul>
        <li>Do not send an item or hand it over until you are satisfied the agreed arrangement is complete.</li>
        <li>For collection, use a safe location and be clear about the time and any conditions.</li>
        <li>Do not ask buyers for passwords, banking logins or one-time codes.</li>
      </ul>

      <h2 id="after-sale">After the sale</h2>
      <p>Update or remove a listing when it is no longer available. Eligible completed transaction records may support reviews; reviews are not a substitute for accurate information or safe trading practices.</p>

      <h2 id="responsibilities">Your responsibilities</h2>
      <p>Be truthful, respectful and compliant with New Zealand law. Whether consumer-law obligations apply can depend on whether you are trading or selling privately and on the circumstances. This guide is not legal advice. For general information, see <a href="https://www.consumerprotection.govt.nz/general-help/consumer-laws/consumer-guarantees-act" target="_blank" rel="noreferrer">Consumer Protection&apos;s Consumer Guarantees Act guidance</a>.</p>
      <p><Link href="/buyer-protection">Read safety advice</Link> before arranging collection, delivery or payment.</p>
    </HelpTrustLayout>
  );
}
