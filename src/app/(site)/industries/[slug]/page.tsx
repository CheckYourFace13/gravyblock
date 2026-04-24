import { IndustryPageShell } from "@/components/industry-page";
import { INDIVIDUAL_INDUSTRY_PAGES, INDIVIDUAL_INDUSTRY_SLUGS } from "@/lib/content/industries/individual";
import { getIndustryPage, INDUSTRY_SLUGS } from "@/lib/content/industries/registry";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return [...INDUSTRY_SLUGS, ...INDIVIDUAL_INDUSTRY_SLUGS].map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const individual = INDIVIDUAL_INDUSTRY_PAGES[slug];
  if (individual) {
    return {
      title: individual.metaTitle,
      description: individual.metaDescription,
    };
  }
  const page = getIndustryPage(slug);
  if (!page) return { title: "Industries" };
  return {
    title: page.metaTitle,
    description: page.metaDescription,
  };
}

export default async function IndustrySlugPage({ params }: Props) {
  const { slug } = await params;
  const individual = INDIVIDUAL_INDUSTRY_PAGES[slug];
  if (individual) {
    return (
      <div>
        <nav className="border-b border-zinc-200 bg-zinc-50/80">
          <div className="mx-auto max-w-3xl px-4 py-3 text-sm text-zinc-600 sm:px-6">
            <Link href="/industries" className="font-medium text-red-800 hover:underline">
              Industries
            </Link>
            <span className="mx-2 text-zinc-400">/</span>
            <Link href={`/industries/${individual.parentSlug}`} className="font-medium text-red-800 hover:underline">
              {getIndustryPage(individual.parentSlug)?.eyebrow ?? "Group"}
            </Link>
            <span className="mx-2 text-zinc-400">/</span>
            <span className="text-zinc-800">{individual.name}</span>
          </div>
        </nav>
        <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">{individual.name}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">{individual.h1}</h1>
          <p className="mt-4 text-lg text-zinc-600">{individual.intro}</p>

          <section className="mt-10 border-t border-zinc-200 pt-10">
            <h2 className="text-xl font-semibold text-zinc-900">Why GravyBlock fits this business type</h2>
            <p className="mt-3 text-zinc-700">{individual.fit}</p>
          </section>

          <section className="mt-10 border-t border-zinc-200 pt-10">
            <h2 className="text-xl font-semibold text-zinc-900">Common visibility and conversion problems</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
              {individual.problems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mt-10 border-t border-zinc-200 pt-10">
            <h2 className="text-xl font-semibold text-zinc-900">What the free scan checks</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
              {individual.scanChecks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mt-10 border-t border-zinc-200 pt-10">
            <h2 className="text-xl font-semibold text-zinc-900">What Base improves each month</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
              {individual.baseImprovements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mt-10 border-t border-zinc-200 pt-10">
            <h2 className="text-xl font-semibold text-zinc-900">What Pro automates further</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
              {individual.proAutomations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mt-10 border-t border-zinc-200 pt-10">
            <h2 className="text-xl font-semibold text-zinc-900">
              Google profile, website trust, reviews, social presence, and AI visibility
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
              {individual.discoveryNotes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-700">
              <span className="font-semibold text-zinc-900">What this means for your business:</span> keep facts
              consistent and conversion paths simple so discovery becomes calls, bookings, and qualified leads.
            </p>
          </section>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/scan"
              className="inline-flex rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Run the free scan
            </Link>
            <Link
              href={`/industries/${individual.parentSlug}`}
              className="inline-flex rounded-full border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
            >
              Back to {getIndustryPage(individual.parentSlug)?.eyebrow ?? "industry group"}
            </Link>
          </div>

          <div className="mt-12 rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Related guides</p>
            <ul className="mt-3 space-y-2 text-sm font-medium text-zinc-800">
              {individual.guideLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-red-800 hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </article>
      </div>
    );
  }
  const model = getIndustryPage(slug);
  if (!model) notFound();
  const childPages = Object.values(INDIVIDUAL_INDUSTRY_PAGES).filter((item) => item.parentSlug === slug);

  return (
    <div>
      <nav className="border-b border-zinc-200 bg-zinc-50/80">
        <div className="mx-auto max-w-3xl px-4 py-3 text-sm text-zinc-600 sm:px-6">
          <Link href="/industries" className="font-medium text-red-800 hover:underline">
            Industries
          </Link>
          <span className="mx-2 text-zinc-400">/</span>
          <span className="text-zinc-800">{model.eyebrow}</span>
        </div>
      </nav>
      <IndustryPageShell model={model} />
      {childPages.length ? (
        <section className="mx-auto mb-14 max-w-3xl rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
          <h2 className="text-lg font-semibold text-zinc-900">High-intent pages in this industry</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {childPages.map((item) => (
              <li key={item.slug}>
                <Link href={`/industries/${item.slug}`} className="text-sm font-medium text-red-800 hover:underline">
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
