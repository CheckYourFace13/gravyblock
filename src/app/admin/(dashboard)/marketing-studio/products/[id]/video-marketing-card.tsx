import { requireStudioDb } from "@/lib/marketing-studio/db";
import { kidsFor, getPolicy } from "@/lib/marketing-studio/publishing/video-policy";
import { declareKidsAction, pauseVideoMarketingAction, resumeVideoMarketingAction } from "../../actions";

/** Pause, resume and the one-time YouTube declaration for one product. Resume lives only here, behind the GravyBlock login. */
export async function VideoMarketingCard({ product }: { product: { id: string; ownerKind: string } }) {
  const db = requireStudioDb();
  const policy = await getPolicy(db, product.id);
  const kids = await kidsFor(db, product);
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-base font-semibold text-zinc-900">Video marketing</h2>
      {policy.paused ? (
        <form action={resumeVideoMarketingAction} className="mt-2">
          <p className="text-sm text-zinc-700">Paused{policy.pausedAt ? ` on ${policy.pausedAt.slice(0, 10)}` : ""}. No new videos are being made. Published videos stay live.</p>
          <input type="hidden" name="productId" value={product.id} />
          <button className="mt-3 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Resume video marketing</button>
        </form>
      ) : (
        <form action={pauseVideoMarketingAction} className="mt-2">
          <p className="text-sm text-zinc-700">Active. New videos are made automatically and sent to you for review.{policy.waiting ? ` Waiting for a new opportunity since ${policy.waiting.since.slice(0, 10)}: ${policy.waiting.reason}` : ""}</p>
          <input type="hidden" name="productId" value={product.id} />
          <button className="mt-3 rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800">Pause new videos</button>
        </form>
      )}
      <form action={declareKidsAction} className="mt-5 border-t border-zinc-100 pt-4">
        <p className="text-sm font-medium text-zinc-900">YouTube: are this product&apos;s videos &ldquo;made for kids&rdquo;?</p>
        <p className="mt-1 text-xs text-zinc-600">
          YouTube asks for this on every upload. You declare it once here and it is reused. Currently: {kids === null ? "not declared yet, uploads wait for it" : kids ? "Yes, made for kids" : "No, not made for kids"}.
        </p>
        <input type="hidden" name="productId" value={product.id} />
        <div className="mt-2 flex gap-2">
          <button name="kids" value="no" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">No, not made for kids</button>
          <button name="kids" value="yes" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">Yes, made for kids</button>
        </div>
      </form>
    </section>
  );
}
