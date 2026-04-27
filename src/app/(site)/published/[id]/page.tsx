import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { marked } from "marked";
import { getDb, publishedContent, businesses } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

async function getContent(id: string) {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(publishedContent)
    .where(eq(publishedContent.id, id))
    .limit(1);
  if (!row || row.status !== "published") return null;

  let businessName: string | null = null;
  if (row.businessId) {
    const [biz] = await db
      .select({ name: businesses.name })
      .from(businesses)
      .where(eq(businesses.id, row.businessId))
      .limit(1);
    businessName = biz?.name ?? null;
  }
  return { ...row, businessName };
}

function plainExcerpt(markdown: string, length = 160): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`[\]()#>-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, length);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const content = await getContent(id);
  if (!content) return { title: "Content not found" };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = `${siteUrl}/published/${id}`;
  const description = plainExcerpt(content.body);
  return {
    title: content.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: content.title,
      description,
      url,
      type: "article",
      publishedTime: new Date(content.createdAt).toISOString(),
      siteName: "GravyBlock",
    },
    twitter: {
      card: "summary",
      title: content.title,
      description,
    },
  };
}

export default async function PublishedContentPage({ params }: Props) {
  const { id } = await params;
  const content = await getContent(id);
  if (!content) notFound();

  const htmlBody = marked.parse(content.body) as string;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = `${siteUrl}/published/${id}`;
  const publishedDate = new Date(content.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: content.title,
    datePublished: new Date(content.createdAt).toISOString(),
    url,
    publisher: {
      "@type": "Organization",
      name: "GravyBlock",
      url: siteUrl,
    },
    ...(content.businessName
      ? { about: { "@type": "LocalBusiness", name: content.businessName } }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <nav className="mb-8 flex items-center gap-2 text-xs text-zinc-400">
          <a href="/" className="hover:text-zinc-700">GravyBlock</a>
          <span>·</span>
          <span>Local Content</span>
        </nav>

        <header className="mb-8">
          {content.businessName && (
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.22em] text-red-700">
              {content.businessName}
            </p>
          )}
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
            {content.title}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">Published {publishedDate}</p>
        </header>

        <article
          className="article-body"
          dangerouslySetInnerHTML={{ __html: htmlBody }}
        />

        <footer className="mt-12 border-t border-zinc-100 pt-6">
          <p className="text-xs text-zinc-400">
            Published by{" "}
            <a href={siteUrl} className="underline hover:text-zinc-700">
              GravyBlock
            </a>{" "}
            automated local visibility content.
          </p>
        </footer>
      </main>
    </>
  );
}
