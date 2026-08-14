import type { Metadata } from "next";
import HelpTrustLayout from "../components/HelpTrustLayout";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Sky Drop handles account, listing, message and service data.",
  alternates: { canonical: "/privacy" },
};

const toc = [
  ["scope", "1. Scope"], ["information", "2. Information we handle"], ["use", "3. How we use it"], ["services", "4. Service providers"], ["sharing", "5. Sharing"], ["storage", "6. Browser storage"], ["retention", "7. Retention and deletion"], ["rights", "8. Your rights"], ["contact", "9. Contact"],
] as const;

export default function PrivacyPage() {
  return (
    <HelpTrustLayout activePath="/privacy" eyebrow="Legal" title="Privacy policy" intro="This policy explains the information Sky Drop handles to operate the marketplace and the choices available to you." toc={toc.map(([id, label]) => ({ id, label }))}>
      <p>Last updated: 15 August 2026.</p>
      <h2 id="scope">1. Scope</h2>
      <p>This policy applies to Sky Drop&apos;s website, accounts and marketplace features. It should be read with the Terms of use. It describes current product data flows and is not a substitute for a completed privacy compliance review.</p>

      <h2 id="information">2. Information we handle</h2>
      <p>Information you provide may include your account email, profile and contact details, listings, listing images, messages, reports, reviews and settings. Where you choose to use verification features, verification-related information may also be handled. We also receive technical and security information used to operate and protect the service, such as account identifiers, device or browser context, IP-related request data and security events.</p>
      <p>When you use Āwhina, we handle the text you provide and any listing information or images you submit for that feature. Āwhina can use that information to generate a listing draft or reply. Check the output before publishing.</p>

      <h2 id="use">3. How we use it</h2>
      <p>We use information to create and secure accounts, display listings and profiles, deliver Messages, operate reviews and reporting controls, respond to support requests, prevent abuse, and maintain or improve the service. We may use service logs and limited analytics to understand site performance and usage.</p>

      <h2 id="services">4. Service providers</h2>
      <p>Sky Drop uses Firebase services for authentication, database and storage functions. We use OpenAI services for Āwhina features when those features are used. The site also loads Plausible Analytics. These providers process information to provide their services under their own terms and privacy documentation. Do not enter unnecessary sensitive personal information into a listing or AI prompt.</p>

      <h2 id="sharing">5. Sharing</h2>
      <p>Information in your public listing or profile is visible to people using Sky Drop. Message content is shared with the people in that conversation. We may disclose information to service providers, professional advisers, regulators or law enforcement where reasonably necessary, required by law, or needed to protect users, the platform or the public.</p>
      <p>Sky Drop does not operate marketplace checkout in the current messaging-first model. Buyers and sellers arrange payment directly, so do not share banking credentials or one-time codes in Messages.</p>

      <h2 id="storage">6. Browser storage, cookies and analytics</h2>
      <p>Sky Drop uses browser storage for functions such as theme preference, recently viewed items and in-progress listing drafts. Authentication and site features may also rely on browser storage or cookies supplied by service providers. You can clear browser storage or change browser cookie settings, but some features may stop working. Plausible Analytics is loaded to measure site use.</p>

      <h2 id="retention">7. Retention and deletion</h2>
      <p>We retain information for as long as needed to run the service, meet legal obligations, resolve reports, prevent fraud or enforce our terms. Account controls may let you remove account information, but some records can remain where retention is necessary for those purposes. Retention periods and deletion workflows need formal privacy review before this policy can make more specific commitments.</p>

      <h2 id="rights">8. Your privacy rights</h2>
      <p>Under the New Zealand Privacy Act 2020, you may have rights to ask for access to and correction of personal information we hold about you. You can update some information through your profile. To request access, correction or help with deletion, email us using the address below.</p>

      <h2 id="contact">9. Contact</h2>
      <p>Email privacy questions to <a href="mailto:support@skydrop.co.nz">support@skydrop.co.nz</a>. A New Zealand privacy professional should review this policy, including international provider transfers, retention schedules, verification data handling, incident response and user-request procedures.</p>
    </HelpTrustLayout>
  );
}
