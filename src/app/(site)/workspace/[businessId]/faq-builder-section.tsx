"use client";

import { useState } from "react";
import { generateFAQSchema } from "@/lib/schema-generator";

type BusinessProps = {
  name: string;
  vertical?: string | null;
  primaryCategory?: string | null;
};

type TabId = "html" | "schema";

const TABS: { id: TabId; label: string }[] = [
  { id: "html", label: "Readable HTML" },
  { id: "schema", label: "Schema Markup (JSON-LD)" },
];

type FaqEntry = { question: string; answer: string };

function extractFaqs(schema: object): FaqEntry[] {
  const s = schema as {
    mainEntity?: Array<{
      name?: string;
      acceptedAnswer?: { text?: string };
    }>;
  };
  if (!Array.isArray(s.mainEntity)) return [];
  return s.mainEntity
    .map((item) => ({
      question: item.name ?? "",
      answer: item.acceptedAnswer?.text ?? "",
    }))
    .filter((f) => f.question && f.answer);
}

function buildHtmlString(faqs: FaqEntry[]): string {
  const items = faqs
    .map(
      (f) =>
        `  <div class="faq-item">\n    <h3>${f.question}</h3>\n    <p>${f.answer}</p>\n  </div>`,
    )
    .join("\n");
  return `<div class="faq-section">\n${items}\n</div>`;
}

function buildSingleHtml(faq: FaqEntry): string {
  return `<div class="faq-item">\n  <h3>${faq.question}</h3>\n  <p>${faq.answer}</p>\n</div>`;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
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
      {copied ? "Copied!" : label}
    </button>
  );
}

export function FaqBuilderSection({ business }: { business: BusinessProps }) {
  const [activeTab, setActiveTab] = useState<TabId>("html");

  const faqSchema = generateFAQSchema(business);
  const faqs = extractFaqs(faqSchema);
  const htmlString = buildHtmlString(faqs);
  const jsonString = `<script type="application/ld+json">\n${JSON.stringify(faqSchema, null, 2)}\n</script>`;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-zinc-900">FAQ Content Builder</h2>
        <p className="text-sm text-zinc-500">
          Ready-to-use FAQ questions and answers for your website. Add these to help Google feature your business in answer boxes and help AI assistants cite you.
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

      {/* Tab content */}
      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        {activeTab === "html" ? (
          <>
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Readable HTML
              </p>
              <CopyButton text={htmlString} label="Copy all as HTML" />
            </div>
            <pre className="overflow-x-auto text-xs leading-relaxed text-zinc-700 font-mono whitespace-pre">
              <code>{htmlString}</code>
            </pre>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Schema Markup (JSON-LD)
              </p>
              <CopyButton text={jsonString} label="Copy" />
            </div>
            <pre className="overflow-x-auto text-xs leading-relaxed text-zinc-700 font-mono whitespace-pre">
              <code>{jsonString}</code>
            </pre>
          </>
        )}
      </div>

      {/* How to use */}
      <div className="mt-5 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
        <p className="text-sm font-semibold text-zinc-800 mb-3">How to use</p>
        <ul className="space-y-2">
          <li className="flex items-start gap-2 text-sm text-zinc-600">
            <span className="mt-0.5 shrink-0 text-zinc-400">•</span>
            <span>Paste the HTML into a new page on your website titled &quot;Frequently Asked Questions&quot;</span>
          </li>
          <li className="flex items-start gap-2 text-sm text-zinc-600">
            <span className="mt-0.5 shrink-0 text-zinc-400">•</span>
            <span>
              Add the Schema Markup to your site&apos;s{" "}
              <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs font-mono text-zinc-700">&lt;head&gt;</code>{" "}
              using the same method as the Schema Markup section above
            </span>
          </li>
          <li className="flex items-start gap-2 text-sm text-zinc-600">
            <span className="mt-0.5 shrink-0 text-zinc-400">•</span>
            <span>Google uses FAQ schema to show expandable Q&amp;As directly in search results</span>
          </li>
        </ul>
      </div>

      {/* Individual FAQ cards */}
      {faqs.length > 0 ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-semibold text-zinc-800">Individual Q&amp;As</p>
          {faqs.map((faq, i) => (
            <div key={i} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900">Q: {faq.question}</p>
                  <p className="mt-1 text-sm text-zinc-600">A: {faq.answer}</p>
                </div>
                <div className="shrink-0">
                  <CopyButton text={buildSingleHtml(faq)} label="Copy Q&A" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
