import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeoContentPage } from "@/components/seo-content-page";
import { QUESTION_GUIDES, QUESTION_GUIDE_SLUGS } from "@/lib/content/question-guides";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return QUESTION_GUIDE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = QUESTION_GUIDES[slug];
  if (!page) return { title: "Guides" };
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: `https://gravyblock.com/guides/${slug}` },
  };
}

export default async function QuestionGuidePage({ params }: Props) {
  const { slug } = await params;
  const page = QUESTION_GUIDES[slug];
  if (!page) notFound();

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.model.title,
    description: page.metaDescription,
    url: `https://gravyblock.com/guides/${slug}`,
    datePublished: "2026-01-01",
    dateModified: "2026-05-09",
    publisher: {
      "@type": "Organization",
      name: "GravyBlock",
      url: "https://gravyblock.com",
      logo: "https://gravyblock.com/brand/favicon.png",
    },
    author: {
      "@type": "Person",
      name: "Chris",
      jobTitle: "Founder",
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://gravyblock.com" },
        { "@type": "ListItem", position: 2, name: "Guides", item: "https://gravyblock.com/guides" },
        { "@type": "ListItem", position: 3, name: page.model.title },
      ],
    },
  };

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: page.model.title,
    description: page.metaDescription,
    step: page.model.sections.map((section, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: section.title,
      text: section.body,
    })),
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />
      <nav className="border-b border-zinc-200 bg-zinc-50/80">
        <div className="mx-auto max-w-3xl px-4 py-3 text-sm text-zinc-600 sm:px-6">
          <Link href="/guides" className="font-medium text-red-800 hover:underline">
            Guides
          </Link>
          <span className="mx-2 text-zinc-400">/</span>
          <span className="text-zinc-800">{page.model.title}</span>
        </div>
      </nav>
      <SeoContentPage model={page.model} />
    </div>
  );
}
