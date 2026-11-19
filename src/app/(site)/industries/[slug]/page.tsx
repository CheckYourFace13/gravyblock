import { IndustryPageShell } from "@/components/industry-page";
import { industriesUnder } from "@/lib/seo/merged-urls";
import { getIndustryPage, INDUSTRY_SLUGS } from "@/lib/content/industries/registry";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return INDUSTRY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getIndustryPage(slug);
  if (!page) return { title: "Industries" };
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: `https://gravyblock.com/industries/${slug}` },
  };
}

export default async function IndustrySlugPage({ params }: Props) {
  const { slug } = await params;
  const model = getIndustryPage(slug);
  if (!model) notFound();
  const covered = industriesUnder(slug);

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
      {covered.length ? (
        <section className="mx-auto mb-14 max-w-3xl rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
          <h2 className="text-lg font-semibold text-zinc-900">Business types this page covers</h2>
          <p className="mt-2 text-sm text-zinc-700">{covered.join(", ")}.</p>
        </section>
      ) : null}
    </div>
  );
}
