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
  };
}

export default async function QuestionGuidePage({ params }: Props) {
  const { slug } = await params;
  const page = QUESTION_GUIDES[slug];
  if (!page) notFound();

  return (
    <div>
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
