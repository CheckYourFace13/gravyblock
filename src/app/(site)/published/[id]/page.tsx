import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, publishedContent } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function PublishedContentPage({ params }: Props) {
  const { id } = await params;
  const db = getDb();
  if (!db) notFound();
  const [row] = await db.select().from(publishedContent).where(eq(publishedContent.id, id)).limit(1);
  if (!row || row.status !== "published") notFound();
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-700">GravyBlock published content</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">{row.title}</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Published {new Date(row.createdAt).toLocaleString()} · channel {row.channel}
      </p>
      <article className="prose prose-zinc mt-8 max-w-none whitespace-pre-wrap text-sm leading-7 text-zinc-800">
        {row.body}
      </article>
    </main>
  );
}
