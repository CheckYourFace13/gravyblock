import type { Metadata } from "next";
import Link from "next/link";
import { getAllBlogPosts } from "@/lib/blog/posts";

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

// This page used to also merge in autopilot-generated posts from the house
// account (businessId = GRAVYBLOCK_SELF_BUSINESS_ID) at /published/[id].
// Confirmed live in production (2026-09-12) that surface was carrying
// broken/template content ("Why your area Residents Choose Gravy Block",
// "online_brand Services in your area") straight into this indexed page.
// The editorial blog is GravyBlock-written educational content — house-
// account automation output belongs on /proof (as evidence of real
// activity), never merged into the editorial index. See also the
// strengthened containsPlaceholderArtifact guard in
// src/lib/content-gen/quality-guard.ts, now applied to titles too, so
// future house-account content can't reach "published" in this state
// regardless of where it's surfaced.

export default function BlogPage() {
  const posts = getAllBlogPosts();

  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <header className="mb-12 space-y-3 border-b border-zinc-200 pb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-800">GravyBlock</p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">Local SEO Blog</h1>
        <p className="max-w-2xl text-zinc-600">
          Practical guides, tips, and strategies for small business owners who want to rank higher in Google, show up in AI search, and grow without hiring an agency.
        </p>
      </header>

      <div className="grid gap-8 sm:grid-cols-2">
        {posts.map((post) => {
          const dateStr = new Date(post.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
          const href = `/blog/${post.slug}`;

          return (
            <article key={post.slug} className="group flex flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-2 bg-gradient-to-r from-red-500 to-red-700" />
              <div className="flex flex-1 flex-col p-5">
                <p className="text-xs text-zinc-400 mb-2">{dateStr}</p>
                <h2 className="text-base font-semibold text-zinc-900 group-hover:text-red-700 transition-colors leading-snug">
                  <Link href={href}>{post.title}</Link>
                </h2>
                <p className="mt-2 flex-1 text-sm text-zinc-500 leading-relaxed">{post.metaDescription}</p>
                <Link href={href} className="mt-4 text-xs font-semibold text-red-700 hover:text-red-800">
                  Read article →
                </Link>
              </div>
            </article>
          );
        })}
      </div>

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
