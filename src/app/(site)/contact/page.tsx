import type { Metadata } from "next";
import Link from "next/link";
import { CtaLeadForm } from "@/components/cta-lead-form";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Questions about GravyBlock, pricing, or getting started? Send us a message using the form: sales, support, billing and refunds, or privacy requests.",
  alternates: { canonical: "/contact" },
};

const schema = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact GravyBlock",
  url: "https://gravyblock.com/contact",
};

export default function ContactPage() {
  return (
    <div className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <section className="border-b border-zinc-100 bg-zinc-50 px-4 py-12 sm:px-6 text-center">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-widest text-red-700 mb-2">Get in touch</p>
          <h1 className="text-3xl font-bold text-zinc-900 sm:text-4xl">Contact GravyBlock</h1>
          <p className="mt-3 text-zinc-500 text-sm">
            Questions about pricing, what the product does, or getting started — send a message and our team will reply by email.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 mb-1">Send a message</h2>
            <p className="text-sm text-zinc-500 mb-5">Sales, support, billing and refunds, and privacy requests all start here.</p>
            <CtaLeadForm
              source="contact_form"
              title="Contact GravyBlock"
              subtitle="We'll reply by email."
              buttonLabel="Send message"
              className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 shadow-sm"
            />
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 mb-1">How requests are routed</h2>
              <p className="text-sm text-zinc-500">
                Pick the topic that fits (general or sales, account support, billing or refund, privacy or data request) and we
                reply to the email address you give us.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 space-y-3">
              <p className="text-sm font-semibold text-zinc-800">Before you reach out</p>
              <ul className="space-y-2 text-sm text-zinc-600">
                <li>
                  <Link href="/scan" className="font-medium text-red-600 hover:underline">
                    Run a free scan →
                  </Link>{" "}
                  to see your visibility score first, no account needed
                </li>
                <li>
                  <Link href="/pricing" className="font-medium text-red-600 hover:underline">
                    Check pricing →
                  </Link>{" "}
                  for the $39.99/month price and what's included
                </li>
                <li>
                  <Link href="/faq" className="font-medium text-red-600 hover:underline">
                    Browse the FAQ →
                  </Link>{" "}
                  for answers to common questions
                </li>
                <li>
                  Existing customer with an account or billing issue?{" "}
                  <Link href="/support" className="font-medium text-red-600 hover:underline">
                    Go to Support →
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
