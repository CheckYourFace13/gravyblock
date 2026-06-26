import { desc, eq } from "drizzle-orm";
import { getDb, testimonials } from "@/lib/db";

/** Server component. Renders approved testimonials; renders nothing if there are none. */
export async function TestimonialsSection() {
  const db = getDb();
  if (!db) return null;

  let rows: Array<{
    authorName: string;
    businessName: string | null;
    role: string | null;
    city: string | null;
    quote: string;
    rating: number | null;
  }> = [];

  try {
    rows = await db
      .select({
        authorName: testimonials.authorName,
        businessName: testimonials.businessName,
        role: testimonials.role,
        city: testimonials.city,
        quote: testimonials.quote,
        rating: testimonials.rating,
      })
      .from(testimonials)
      .where(eq(testimonials.status, "approved"))
      .orderBy(desc(testimonials.createdAt))
      .limit(6);
  } catch {
    return null; // table may not exist yet on older DBs
  }

  if (rows.length === 0) return null; // no empty testimonials block

  return (
    <section className="border-y border-zinc-100 bg-zinc-50 px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-red-700">
          What customers say
        </p>
        <h2 className="mt-2 text-center text-3xl font-bold tracking-tight text-zinc-900">
          Real businesses, real results
        </h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((t, i) => (
            <figure key={i} className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              {t.rating ? (
                <div className="mb-2 text-yellow-400" aria-label={`${t.rating} out of 5 stars`}>
                  {"★".repeat(t.rating)}<span className="text-zinc-200">{"★".repeat(5 - t.rating)}</span>
                </div>
              ) : null}
              <blockquote className="flex-1 text-sm leading-relaxed text-zinc-700">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-4 text-sm">
                <span className="font-semibold text-zinc-900">{t.authorName}</span>
                {(t.role || t.businessName) && (
                  <span className="block text-xs text-zinc-500">
                    {[t.role, t.businessName].filter(Boolean).join(", ")}
                    {t.city ? ` · ${t.city}` : ""}
                  </span>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
