import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/company";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that apply to GravyBlock subscriptions: the service, connected accounts, the one-time outreach authorization, billing, cancellation and the 30-day guarantee.",
  alternates: { canonical: "/terms" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 space-y-3 text-zinc-700">
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      {children}
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Terms of Service</h1>
      <p className="mt-3 text-sm text-zinc-500">Last updated October 2026</p>

      <Section title="Agreement">
        <p>
          These terms apply when you use gravyblock.com, run a free scan, or subscribe to a GravyBlock plan. By subscribing or
          using the service you agree to them. If you use GravyBlock for a business, you confirm you are authorized to act for that
          business. Please also read our{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section title="The service">
        <p>
          GravyBlock works on your business&apos;s online visibility: it checks your public presence, publishes content and page
          improvements to the website you connect, posts to profiles you connect, and reports what it verified. It only states
          facts about your business that your own website, Google profile, connected accounts or you have provided. What each plan
          includes is described on the{" "}
          <Link href="/pricing" className="underline">
            pricing
          </Link>{" "}
          and{" "}
          <Link href="/features" className="underline">
            features
          </Link>{" "}
          pages, including which work needs a one-time connection.
        </p>
      </Section>

      <Section title="Connected accounts">
        <p>
          When you connect a website, Google account, Facebook Page or other system, you authorize GravyBlock to act on it as needed
          to perform your plan, and you confirm you have the right to grant that access. You can disconnect or revoke access at any
          time from the account&apos;s own settings or by emailing support. Work that depends on a connection pauses until it is
          available; unrelated work continues.
        </p>
      </Section>

      <Section title="One-time outreach authorization">
        <p>
          By subscribing you authorize GravyBlock, once and for the life of your subscription, to contact relevant local
          organizations, associations, publications and businesses on your behalf to ask whether they would mention or link to a
          genuinely useful page on your website. This is how GravyBlock earns backlinks; you do not approve individual messages.
        </p>
        <p>The authorization is limited by these rules, which GravyBlock applies automatically:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Messages go only to contact addresses the recipient has published on its own website. Addresses are never guessed.</li>
          <li>Each message is relevant to the recipient and built only from verified facts about your business.</li>
          <li>Every message carries a working opt-out; opted-out and suppressed addresses are never contacted again.</li>
          <li>Volume is low per business and shares a global daily ceiling.</li>
          <li>Outreach stops after a reply, a decline, an unsubscribe or a confirmed link.</li>
          <li>GravyBlock never buys links, posts in comments or forums, creates fake accounts, or promises that a link will result.</li>
        </ul>
        <p>You can revoke this authorization at any time by emailing support; outreach for your business stops immediately.</p>
      </Section>

      <Section title="Billing, cancellation and the 30-day guarantee">
        <p>
          Subscriptions are billed monthly (or annually if you choose an annual plan) and renew until cancelled. Prices and any promo
          rate you signed up with are shown at checkout; a promo marked as locked applies for as long as your subscription stays
          active. You can cancel at any time from the billing portal in your workspace, with no cancellation fee. You keep access
          until the end of the period you have paid for.
        </p>
        <p>
          If you are not satisfied within 30 days of your first payment, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
            {SUPPORT_EMAIL}
          </a>{" "}
          and we will refund that payment.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>
          Do not use GravyBlock to misrepresent a business, to publish unlawful or deceptive content, to infringe others&apos; rights,
          or to disrupt or attempt to gain unauthorized access to the service. We may suspend an account that does.
        </p>
      </Section>

      <Section title="Content GravyBlock publishes">
        <p>
          Content GravyBlock publishes for you is generated from information about your business and is published to your own
          website and profiles. You may edit, unpublish or remove it at any time. You remain responsible for your business&apos;s
          information being accurate; tell us if something published is wrong and we will help correct it.
        </p>
      </Section>

      <Section title="Third-party services">
        <p>
          GravyBlock relies on services we do not control, such as Google, Facebook, your website platform, Stripe and email
          providers. Their availability, rules and changes can affect what GravyBlock can do, and GravyBlock is not responsible for
          their actions.
        </p>
      </Section>

      <Section title="Results">
        <p>
          GravyBlock reports actions it completed and verified. Search rankings, links, reviews and traffic depend on third parties
          and are not guaranteed.
        </p>
      </Section>

      <Section title="Disclaimer and limits">
        <p>
          The service is provided &quot;as is&quot; to the extent permitted by law. To the extent permitted by law, GravyBlock is not
          liable for indirect, incidental or consequential damages, or for lost profits or revenue, arising from your use of the
          service.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          We may update these terms as the service changes; the date above shows the latest revision. Questions:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </div>
  );
}
