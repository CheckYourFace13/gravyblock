import type { Metadata } from "next";
import Link from "next/link";
import { CtaLeadForm } from "@/components/cta-lead-form";

export const metadata: Metadata = {
  title: "Support — GravyBlock",
  description:
    "Get help with your GravyBlock account. Billing, access, content questions, and product support — we reply by email.",
};

const helpTopics = [
  { icon: "💳", title: "Billing & payments", desc: "Charges, invoices, cancellation, or refunds" },
  { icon: "🔑", title: "Account access", desc: "Can't log in, password reset, or seat management" },
  { icon: "⚙️", title: "Setup & integrations", desc: "Connecting your website, GSC, or social accounts" },
  { icon: "📝", title: "Content questions", desc: "Editing, pausing, or reviewing published articles" },
  { icon: "📍", title: "GBP & citations", desc: "Claiming profiles, fixing NAP inconsistencies" },
  { icon: "📊", title: "Reports & data", desc: "Understanding your visibility score or rank data" },
];

export default function SupportPage() {
  return (
    <div className="bg-white">
      {/* Header */}
      <section className="border-b border-zinc-100 bg-zinc-50 px-4 py-12 sm:px-6 text-center">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-widest text-red-700 mb-2">We're here to help</p>
          <h1 className="text-3xl font-bold text-zinc-900 sm:text-4xl">Support</h1>
          <p className="mt-3 text-zinc-500 text-sm">
            We reply to every message by email, usually within one business day.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">

          {/* Left: contact form */}
          <div>
            <h2 className="text-lg font-bold text-zinc-900 mb-1">Send us a message</h2>
            <p className="text-sm text-zinc-500 mb-5">
              For billing, access, or product questions. Not a demo booking form.
            </p>
            <CtaLeadForm
              source="support_inquiry"
              title="Contact support"
              subtitle="Fill out the form and we'll get back to you by email."
              buttonLabel="Send message"
              className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 shadow-sm"
            />
            <p className="mt-3 text-xs text-zinc-400">
              You can also email us directly at{" "}
              <a href="mailto:support@gravyblock.com" className="font-medium text-zinc-600 hover:underline">
                support@gravyblock.com
              </a>
            </p>
          </div>

          {/* Right: help topics + self-serve */}
          <div>
            <h2 className="text-lg font-bold text-zinc-900 mb-1">Common topics</h2>
            <p className="text-sm text-zinc-500 mb-5">Tell us what you need help with and we'll route it to the right team.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {helpTopics.map((topic) => (
                <div key={topic.title} className="rounded-xl border border-zinc-200 bg-white p-4">
                  <p className="text-xl mb-1">{topic.icon}</p>
                  <p className="text-sm font-semibold text-zinc-900">{topic.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{topic.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 space-y-3">
              <p className="text-sm font-semibold text-zinc-800">Self-serve options</p>
              <ul className="space-y-2 text-sm text-zinc-600">
                <li>
                  <Link href="/faq" className="font-medium text-red-600 hover:underline">
                    Browse the FAQ →
                  </Link>{" "}
                  for answers to the most common questions
                </li>
                <li>
                  <Link href="/login" className="font-medium text-red-600 hover:underline">
                    Log in to your dashboard →
                  </Link>{" "}
                  to manage billing and settings
                </li>
                <li>
                  <Link href="/scan" className="font-medium text-red-600 hover:underline">
                    Run a new free scan →
                  </Link>{" "}
                  to re-check your visibility score
                </li>
              </ul>
            </div>

            <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
              <p className="text-sm font-semibold text-emerald-800">30-day money-back guarantee</p>
              <p className="mt-1 text-xs text-emerald-700 leading-relaxed">
                Not happy in your first 30 days? Email us and we'll refund you in full. No forms, no hassle.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
