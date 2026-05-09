import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeoContentPage } from "@/components/seo-content-page";
import { COMPARE_PAGES, COMPARE_SLUGS } from "@/lib/content/compare-pages";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return COMPARE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = COMPARE_PAGES[slug];
  if (!page) return { title: "Compare" };
  return {
    title: page.metaTitle,
    description: page.metaDescription,
  };
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  const page = COMPARE_PAGES[slug];
  if (!page) notFound();

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.model.title,
    description: page.metaDescription,
    url: `https://gravyblock.com/compare/${slug}`,
    publisher: {
      "@type": "Organization",
      name: "GravyBlock",
      url: "https://gravyblock.com",
      logo: "https://gravyblock.com/brand/favicon.png",
    },
    author: {
      "@type": "Organization",
      name: "GravyBlock",
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://gravyblock.com" },
        { "@type": "ListItem", position: 2, name: "Compare", item: "https://gravyblock.com/compare" },
        { "@type": "ListItem", position: 3, name: page.model.title },
      ],
    },
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <nav className="border-b border-zinc-200 bg-zinc-50/80">
        <div className="mx-auto max-w-3xl px-4 py-3 text-sm text-zinc-600 sm:px-6">
          <Link href="/compare" className="font-medium text-red-800 hover:underline">
            Compare
          </Link>
          <span className="mx-2 text-zinc-400">/</span>
          <span className="text-zinc-800">{page.model.title}</span>
        </div>
      </nav>
      <SeoContentPage model={page.model} />
    </div>
  );
}
