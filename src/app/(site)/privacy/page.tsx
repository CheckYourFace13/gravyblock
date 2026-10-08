import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/company";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What information GravyBlock collects, how it is used, who it is shared with, the cookies it sets, and how to ask for access or deletion.",
  alternates: { canonical: "/privacy" },
};

const sections: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "who",
    title: "Who this policy covers",
    body: (
      <p>
        This policy explains how GravyBlock (&quot;we&quot;, &quot;us&quot;) handles information when you visit gravyblock.com, run a
        free scan, subscribe, connect accounts, or receive email from us. It also covers how we handle publicly available business
        information when we prepare visibility reports and contact relevant organizations.
      </p>
    ),
  },
  {
    id: "collect",
    title: "Information we collect",
    body: (
      <ul className="list-disc space-y-2 pl-6">
        <li>
          <strong>Scan and report information.</strong> The business name, city or address, and website you enter, plus public
          information we retrieve about that business (for example its Google listing, public reviews, and the content of its
          website). If you unlock a report we also collect your name and email address.
        </li>
        <li>
          <strong>Account and billing information.</strong> Your email address and business details when you subscribe. Payments
          are processed by Stripe; we do not receive or store your full card number. We keep Stripe customer and subscription
          identifiers and your billing email.
        </li>
        <li>
          <strong>Connections you authorize.</strong> If you connect your website (WordPress, Webflow or Shopify), Google
          account (Search Console and Business Profile), Facebook Page, or a booking or invoicing system, we store the
          credentials or access tokens needed to perform the work you authorized, and the data those connections return (for
          example search queries, reviews, and customer contact details used to send review requests).
        </li>
        <li>
          <strong>Messages you send us.</strong> Anything you submit through the contact, support or feedback forms, or by email.
        </li>
        <li>
          <strong>Usage and device information.</strong> Pages viewed, which steps of the scan, pricing and checkout flow were
          reached, referring page, and basic technical data such as browser type. We use this to run and improve the service.
        </li>
        <li>
          <strong>Email activity.</strong> Whether an email we sent was delivered, bounced, opened or clicked.
        </li>
      </ul>
    ),
  },
  {
    id: "use",
    title: "How we use it",
    body: (
      <ul className="list-disc space-y-2 pl-6">
        <li>To produce your visibility report and perform, verify and report on the work in your plan.</li>
        <li>To process subscriptions, send receipts and service messages, and provide support.</li>
        <li>To send you your report and, if you asked for it or are a prospective customer, related follow-up email. Every marketing email includes an unsubscribe link.</li>
        <li>To measure how visitors move from scan to report to checkout, and to improve the product and site.</li>
        <li>To keep the service secure, prevent abuse, and meet legal obligations.</li>
      </ul>
    ),
  },
  {
    id: "outreach",
    title: "Contacting businesses and organizations",
    body: (
      <>
        <p>
          GravyBlock sends two kinds of outreach email to people who have not signed up. First, we may email a business a short
          note about a visibility report we prepared for it. Second, on behalf of a subscribed customer, we may email a relevant
          local organization, association or publication to ask whether it would mention or link to a useful page.
        </p>
        <p className="mt-3">
          We send these only to an address the recipient has published on its own website, and we do not guess addresses. Each
          message includes a working opt-out. Opted-out and suppressed addresses are never contacted again. To opt out, use the
          link in any message or email {SUPPORT_EMAIL}.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who we share information with",
    body: (
      <>
        <p>We do not sell your personal information. We share information only with service providers that help us run GravyBlock, and only as needed:</p>
        <ul className="mt-3 list-disc space-y-2 pl-6">
          <li>Stripe (payment processing).</li>
          <li>Resend (sending and delivery tracking for email).</li>
          <li>Google (Places, Search Console and Business Profile data you authorize, and Google Analytics for site usage).</li>
          <li>Meta (Facebook Pages and Instagram, if you connect them).</li>
          <li>
            AI model providers, through OpenRouter, which process business information such as website text and public
            listing details to draft content and check AI search visibility. We do not send card numbers or login passwords to
            these providers.
          </li>
          <li>Our hosting and infrastructure providers.</li>
          <li>Authorities or other parties where required by law or to protect rights and safety.</li>
        </ul>
        <p className="mt-3">
          Content GravyBlock publishes for you (articles, Google Business Profile posts, social posts) is public once it is published to
          your website or profiles.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and analytics",
    body: (
      <>
        <p>We use a small number of cookies:</p>
        <ul className="mt-3 list-disc space-y-2 pl-6">
          <li>
            <strong>gb_customer_session</strong>: keeps you signed in to your workspace.
          </li>
          <li>
            <strong>gb_visitor</strong>: a random identifier that lets us connect the steps of one visit (scan, report, pricing,
            checkout). It contains no personal information. It lasts up to 90 days.
          </li>
          <li>
            <strong>gb_attr</strong>: if you arrive from one of our emails, an opaque code that tells us which message led to your
            visit. It is not your email address. It lasts up to 90 days.
          </li>
          <li>
            <strong>Google Analytics</strong>: sets its own cookies to report aggregate site traffic.
          </li>
        </ul>
        <p className="mt-3">You can block or delete cookies in your browser settings; the site works without the analytics cookies.</p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep information",
    body: (
      <p>
        We keep information for as long as it is needed to provide the service, keep business and tax records, resolve disputes and
        meet legal obligations. If you cancel, connected-account credentials stop being used. You can ask us to delete your data at
        any time (see below).
      </p>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        We use access controls, signed and verified webhooks, and fail-closed sending safeguards to protect the service. No system is
        perfectly secure, so we cannot guarantee absolute security. You can revoke GravyBlock&apos;s access to your Google, Facebook
        or website accounts at any time from those accounts&apos; own settings.
      </p>
    ),
  },
  {
    id: "rights",
    title: "Your choices and requests",
    body: (
      <p>
        You can ask us to access, correct or delete the information we hold about you, to stop using a connection, or to stop
        contacting you. Email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
          {SUPPORT_EMAIL}
        </a>{" "}
        and we will respond by email. Depending on where you live, you may have additional rights under local law, and we will honor
        those requests to the extent they apply.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: <p>GravyBlock is a business service and is not directed to children. We do not knowingly collect information from children.</p>,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We may update this policy as the service changes. The date below shows the latest revision. Material changes will be
        reflected on this page.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Privacy questions or requests:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
          {SUPPORT_EMAIL}
        </a>
        . See also our{" "}
        <Link href="/terms" className="underline">
          Terms of Service
        </Link>
        .
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Privacy Policy</h1>
      <p className="mt-3 text-sm text-zinc-500">Last updated October 2026</p>
      {sections.map((s) => (
        <section key={s.id} id={s.id} className="mt-8 space-y-3 text-zinc-700">
          <h2 className="text-lg font-semibold text-zinc-900">{s.title}</h2>
          {s.body}
        </section>
      ))}
    </div>
  );
}
