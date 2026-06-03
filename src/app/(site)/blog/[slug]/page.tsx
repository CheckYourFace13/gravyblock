import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { marked } from "marked";
import { getBlogPostBySlug, getAllBlogPosts } from "@/lib/blog/posts";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllBlogPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) return { title: "Not found" };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
  return {
    title: `${post.title} — GravyBlock`,
    description: post.metaDescription,
    alternates: { canonical: `${siteUrl}/blog/${slug}` },
    openGraph: {
      title: post.title,
      description: post.metaDescription,
      url: `${siteUrl}/blog/${slug}`,
      type: "article",
      publishedTime: new Date(post.publishedAt).toISOString(),
      siteName: "GravyBlock",
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();

  const htmlBody = marked.parse(post.body) as string;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.metaDescription,
    datePublished: new Date(post.publishedAt).toISOString(),
    url: `${siteUrl}/blog/${slug}`,
    publisher: {
      "@type": "Organization",
      name: "GravyBlock",
      url: siteUrl,
    },
    author: {
      "@type": "Organization",
      name: "GravyBlock",
    },
  };

  const allPosts = getAllBlogPosts();
  const related = allPosts.filter((p) => p.slug !== slug).slice(0, 3);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <nav className="mb-8 flex items-center gap-2 text-xs text-zinc-400">
          <Link href="/" className="hover:text-zinc-700">GravyBlock</Link>
          <span>·</span>
          <Link href="/blog" className="hover:text-zinc-700">Blog</Link>
        </nav>

        <header className="mb-10">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-red-700">
            {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl leading-snug">
            {post.title}
          </h1>
          <p className="mt-3 text-lg text-zinc-500 leading-relaxed">{post.metaDescription}</p>
        </header>

        <article
          className="article-body"
          dangerouslySetInnerHTML={{ __html: htmlBody }}
        />

        {/* CTA */}
        <section className="mt-12 rounded-2xl border border-red-200 bg-red-50/60 p-7 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-800">Try it free</p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-900">See how your business ranks right now</h2>
          <p className="mt-2 text-sm text-zinc-600 max-w-md mx-auto">
            Free visibility scan. 60 seconds. Get your GBP score, top issues, and a prioritized fix list.
          </p>
          <Link
            href="/scan"
            className="mt-5 inline-block rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-500 transition-colors"
          >
            Get my free score →
          </Link>
        </section>

        {/* Related posts */}
        {related.length > 0 && (
          <section className="mt-14">
            <h2 className="text-base font-semibold text-zinc-900 mb-5">More from the blog</h2>
            <div className="space-y-4">
              {related.map((p) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-300 hover:shadow-sm transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-zinc-900 text-sm leading-snug">{p.title}</p>
                    <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{p.metaDescription}</p>
                  </div>
                  <span className="text-zinc-300 text-sm shrink-0 mt-0.5">→</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
