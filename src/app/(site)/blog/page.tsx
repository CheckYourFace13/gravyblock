import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, and, inArray } from "drizzle-orm";
import { getDb, publishedContent, businesses } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Local SEO Blog — GravyBlock",
  description: "Practical local SEO guides, tips, and automation strategies for small business owners. Written and published automatically by GravyBlock.",
  alternates: { canonical: "https://gravyblock.com/blog" },
  openGraph: {
    title: "Local SEO Blog — GravyBlock",
    description: "Practical local SEO guides for small business owners.",
    url: "https://gravyblock.com/blog",
    type: "website",
  },
};

async function getBlogPosts() {
  const db = getDb();
  if (!db) return [];

  const selfId = process.env.GRAVYBLOCK_SELF_BUSINESS_ID;

  // Get published articles — either from GravyBlock's own business ID,
  // or all internal_site published articles if the self-business is set
  const rows = await db
    .select({
      id: publishedContent.id,
      title: publishedContent.title,
      body: publishedContent.body,
      createdAt: publishedContent.createdAt,
      coverImageUrl: publishedContent.coverImageUrl,
      metaDescription: publishedContent.metaDescription,
    })
    .from(publishedContent)
    .where(
      and(
        selfId ? eq(publishedContent.businessId, selfId) : inArray(publishedContent.channel, ["internal_site"]),
        eq(publishedContent.status, "published"),
        inArray(publishedContent.channel, ["internal_site", "wordpress", "webflow"]),
      ),
    )
    .orderBy(desc(publishedContent.createdAt))
    .limit(50);

  return rows;
}

function excerpt(body: string, length = 160): string {
  return body
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`[\]()#>-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, length)
    .trim() + "…";
}

export default async function BlogPage() {
  const posts = await getBlogPosts();

  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <header className="mb-12 space-y-3 border-b border-zinc-200 pb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-800">GravyBlock</p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">Local SEO Blog</h1>
        <p className="max-w-2xl text-zinc-600">
          Practical guides, tips, and strategies for small business owners who want to rank higher in Google, show up in AI search, and grow without hiring an agency.
        </p>
        <p className="text-xs text-zinc-400">Articles written and published automatically by GravyBlock autopilot.</p>
      </header>

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-6 py-16 text-center">
          <p className="font-semibold text-zinc-700">First articles coming soon.</p>
          <p className="mt-1 text-sm text-zinc-500">GravyBlock autopilot is generating content. Check back shortly.</p>
          <Link href="/scan" className="mt-4 inline-block rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-500">
            Run a free scan while you wait
          </Link>
        </div>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2">
          {posts.map((post) => (
            <article key={post.id} className="group flex flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              {post.coverImageUrl ? (
                <div className="h-40 overflow-hidden bg-zinc-100">
                  <img
                    src={post.coverImageUrl}
                    alt={post.title}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              ) : (
                <div className="h-2 bg-gradient-to-r from-red-500 to-red-700" />
              )}
              <div className="flex flex-1 flex-col p-5">
                <p className="text-xs text-zinc-400 mb-2">
                  {new Date(post.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
                <h2 className="text-base font-semibold text-zinc-900 group-hover:text-red-700 transition-colors leading-snug">
                  <Link href={`/published/${post.id}`}>{post.title}</Link>
                </h2>
                <p className="mt-2 flex-1 text-sm text-zinc-500 leading-relaxed">
                  {post.metaDescription ?? excerpt(post.body)}
                </p>
                <Link
                  href={`/published/${post.id}`}
                  className="mt-4 text-xs font-semibold text-red-700 hover:text-red-800"
                >
                  Read article →
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      <section className="mt-16 rounded-2xl border border-red-200 bg-red-50/50 p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-800">Try it free</p>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-900">See how your business ranks</h2>
        <p className="mt-2 text-sm text-zinc-600 max-w-md mx-auto">
          Free visibility scan. Takes 60 seconds. Get your score, top issues, and a prioritized fix list.
        </p>
        <Link
          href="/scan"
          className="mt-5 inline-block rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-500"
        >
          Get my free score
        </Link>
      </section>
    </div>
  );
}
