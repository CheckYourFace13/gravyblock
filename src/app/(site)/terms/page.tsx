import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — GravyBlock",
  description: "The terms that apply to GravyBlock subscriptions, including the one-time outreach authorization.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Terms of Service</h1>
      <p className="mt-3 text-sm text-zinc-500">Last updated September 2026</p>

      <section className="mt-8 space-y-3 text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">The service</h2>
        <p>
          GravyBlock works on your business&apos;s online visibility: it checks your public presence, publishes content and page
          improvements to the website you connect, posts to profiles you connect, and reports what it verified. It only states facts
          about your business that your own website, Google profile, connected accounts or you have provided.
        </p>
      </section>

      <section className="mt-8 space-y-3 text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">One-time outreach authorization</h2>
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
      </section>

      <section className="mt-8 space-y-3 text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">Billing and guarantee</h2>
        <p>Subscriptions renew until cancelled. The 30-day money-back guarantee on the pricing page applies to your first payment.</p>
      </section>

      <section className="mt-8 space-y-3 text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">Results</h2>
        <p>
          GravyBlock reports actions it completed and verified. Search rankings, links and traffic depend on third parties and are
          not guaranteed.
        </p>
      </section>
    </div>
  );
}
