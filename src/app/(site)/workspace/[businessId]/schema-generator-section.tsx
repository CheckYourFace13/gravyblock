"use client";

import { useState } from "react";
import {
  generateLocalBusinessSchema,
  generateFAQSchema,
  generateServiceSchema,
} from "@/lib/schema-generator";

type BusinessProps = {
  name: string;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  primaryCategory?: string | null;
  vertical?: string | null;
  rating?: string | null;
  reviewCount?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUri?: string | null;
};

type SchemaTabId = "local_business" | "faq" | "service";

const TABS: { id: SchemaTabId; label: string }[] = [
  { id: "local_business", label: "Local Business" },
  { id: "faq", label: "FAQ Page" },
  { id: "service", label: "Service" },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export function SchemaGeneratorSection({ business }: { business: BusinessProps }) {
  const [activeTab, setActiveTab] = useState<SchemaTabId>("local_business");

  const localBusinessSchema = generateLocalBusinessSchema(business);
  const faqSchema = generateFAQSchema(business);
  const serviceSchema = generateServiceSchema(business);

  const schemas: Record<SchemaTabId, object> = {
    local_business: localBusinessSchema,
    faq: faqSchema,
    service: serviceSchema,
  };

  const activeSchema = schemas[activeTab];
  const jsonString = `<script type="application/ld+json">\n${JSON.stringify(activeSchema, null, 2)}\n</script>`;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-zinc-900">Schema Markup</h2>
        <p className="text-sm text-zinc-500">
          Add these to your website&apos;s{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs font-mono text-zinc-700">&lt;head&gt;</code>{" "}
          to help Google and AI search tools understand your business.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="mt-5 flex gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Schema code block */}
      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {TABS.find((t) => t.id === activeTab)?.label} Schema
          </p>
          <div className="flex items-center gap-2">
            <CopyButton text={jsonString} />
            <a
              href={business.website
                ? `https://search.google.com/test/rich-results?url=${encodeURIComponent(business.website)}`
                : "https://search.google.com/test/rich-results"}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
            >
              Test in Google ↗
            </a>
          </div>
        </div>
        <pre className="overflow-x-auto text-xs leading-relaxed text-zinc-700 font-mono whitespace-pre">
          <code>{jsonString}</code>
        </pre>
      </div>

      {/* How to add section */}
      <div className="mt-5 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
        <p className="text-sm font-semibold text-zinc-800 mb-3">How to add this to your site</p>
        <ul className="space-y-3">
          <li className="flex items-start gap-3 text-sm">
            <span className="mt-0.5 shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-700">WordPress</span>
            <span className="text-zinc-600">
              Install the{" "}
              <strong className="text-zinc-800">&quot;Insert Headers and Footers&quot;</strong>{" "}
              plugin, then paste the code in the <strong className="text-zinc-800">Header</strong> section.
            </span>
          </li>
          <li className="flex items-start gap-3 text-sm">
            <span className="mt-0.5 shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-700">Squarespace / Wix</span>
            <span className="text-zinc-600">
              Go to <strong className="text-zinc-800">Settings &rarr; Advanced &rarr; Code Injection &rarr; Header</strong> and paste the code there.
            </span>
          </li>
          <li className="flex items-start gap-3 text-sm">
            <span className="mt-0.5 shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-700">Any site</span>
            <span className="text-zinc-600">
              Paste the code directly inside your{" "}
              <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs font-mono text-zinc-700">&lt;head&gt;</code>{" "}
              tag in your HTML.
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}
