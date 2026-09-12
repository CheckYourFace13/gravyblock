import type { Metadata } from "next";
import Link from "next/link";
import { CtaLeadForm } from "@/components/cta-lead-form";

export const metadata: Metadata = {
  title: "Contact — GravyBlock",
  description:
    "Questions about GravyBlock, pricing, or getting started? Reach us directly at chris@gravyblock.com or send a message below.",
  alternates: { canonical: "https://gravyblock.com/contact" },
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
            Questions about pricing, what the product does, or getting started — send a message and you'll hear
            back from the person actually running GravyBlock.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 mb-1">Send a message</h2>
            <p className="text-sm text-zinc-500 mb-5">Sales questions, product questions, anything else.</p>
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
              <h2 className="text-lg font-bold text-zinc-900 mb-1">Direct email</h2>
              <p className="text-sm text-zinc-500 mb-2">Prefer email? Reach us directly.</p>
              <a href="mailto:chris@gravyblock.com" className="font-semibold text-red-700 hover:underline">
                chris@gravyblock.com
              </a>
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
                  for current plans and what's included
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
