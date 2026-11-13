import { requireStudioDb } from "@/lib/marketing-studio/db";
import { kidsFor, getPolicy } from "@/lib/marketing-studio/publishing/video-policy";
import { getBrandKit } from "@/lib/marketing-studio/brand/brand-kit";
import { allowanceFor, attributionFor, entitlementFor, outcomesFor } from "@/lib/marketing-studio/entitlements";
import { contactSummary } from "@/lib/marketing-studio/publishing/review-contact";
import { listReviews } from "@/lib/marketing-studio/publishing/video-review";
import { youtubeConnectionFor } from "@/lib/marketing-studio/publishing/youtube-share";
import { OFFERED_VOICES, TONES, voiceCards, voiceSettingFor } from "@/lib/marketing-studio/video/voices";
import { productStatus } from "@/lib/marketing-studio/portfolio-loop";
import { isGame, PRESET_TARGETS, targetStats } from "@/lib/marketing-studio/video-target";
import { changeReviewEmailAction, changeVoiceAction, declareKidsAction, generateNextVideoAction, pauseVideoMarketingAction, resumeVideoMarketingAction, setVideoTargetAction } from "../../actions";

/** Pause, resume and the one-time YouTube declaration for one product. Resume lives only here, behind the GravyBlock login. */
export async function VideoMarketingCard({ product }: { product: { id: string; ownerKind: string; slug?: string; kind?: string } }) {
  const db = requireStudioDb();
  const tp = { id: product.id, slug: product.slug ?? "", kind: product.kind, ownerKind: product.ownerKind };
  const stats = await targetStats(db, tp);
  const state = await productStatus(db, tp as never).catch(() => ({ status: "ACTIVE", detail: null as string | null }));
  const policy = await getPolicy(db, product.id);
  const kids = await kidsFor(db, product);
  const voice = await voiceSettingFor(db, product.id);
  const cards = await voiceCards(db);
  const ent = await entitlementFor(db, product);
  const allow = await allowanceFor(db, product);
  const outcome = await outcomesFor(db, product.id, Date.now(), ent);
  const contact = await contactSummary(db, product.id);
  const kit = await getBrandKit(db, product.id);
  const channel = await youtubeConnectionFor(db, product.id);
  const attribution = await attributionFor(db, product);
  const reviews = (await listReviews(db)).filter((r) => r.productId === product.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const date = (iso: string | null) => (iso ? iso.slice(0, 10) : "when a strong opportunity exists");
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
      <div className="mt-5 border-t border-zinc-100 pt-4">
        <p className="text-sm font-medium text-zinc-900">Video target</p>
        <p className="mt-1 text-xs text-zinc-600">
          {stats.target === null ? "No target set: videos follow the plan's pace." : `Target: ${stats.target} distinct video${stats.target === 1 ? "" : "s"}.`} GravyBlock keeps making different, approved-quality videos by itself until the target is reached or you pause.
          {isGame(tp) ? " Games are made only from real gameplay by the game video engine." : ""} A change request never reduces what is left.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {PRESET_TARGETS.map((n) => (
            <form key={n} action={setVideoTargetAction}>
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="preset" value={n} />
              <button className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${stats.target === n ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-800"}`}>{n}</button>
            </form>
          ))}
          <form action={setVideoTargetAction} className="flex items-center gap-2">
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="preset" value="custom" />
            <input name="custom" type="number" min={1} max={50} placeholder="Custom" className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
            <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-800">Set</button>
          </form>
          <form action={generateNextVideoAction}>
            <input type="hidden" name="productId" value={product.id} />
            <button className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" disabled={Boolean(policy.paused)}>Generate Next Video</button>
          </form>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-5">
          <div><dt className="text-xs text-zinc-500">Approved / public</dt><dd className="font-medium">{stats.approved}</dd></div>
          <div><dt className="text-xs text-zinc-500">Waiting for review</dt><dd className="font-medium">{stats.waiting}</dd></div>
          <div><dt className="text-xs text-zinc-500">Rendering</dt><dd className="font-medium">{stats.making}</dd></div>
          <div><dt className="text-xs text-zinc-500">Remaining target</dt><dd className="font-medium">{stats.remaining ?? "none set"}</dd></div>
          <div><dt className="text-xs text-zinc-500">State</dt><dd className="font-medium">{policy.paused ? "Paused" : "Active"} · {state.status.replace(/_/g, " ").toLowerCase()}</dd></div>
        </dl>
        {state.detail ? <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{state.detail}</p> : null}
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-zinc-100 pt-4 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-zinc-500">Plan</dt><dd className="font-medium">{ent.label}</dd></div>
        <div><dt className="text-xs text-zinc-500">New videos this {allow.period}</dt><dd className="font-medium">{allow.generated} of {allow.allowance ?? "no limit"}</dd></div>
        <div><dt className="text-xs text-zinc-500">Allowance (plan + add-on)</dt><dd className="font-medium">{allow.base ?? "no limit"} + {allow.addOnPerPeriod + allow.creditsRemaining} = {allow.allowance ?? "no limit"} per {allow.period}{allow.carried ? `, ${allow.carried} carried` : ""}</dd></div>
        <div><dt className="text-xs text-zinc-500">Remaining this {allow.period}</dt><dd className="font-medium">{allow.remaining ?? "no limit"}</dd></div>
        <div><dt className="text-xs text-zinc-500">Billing period</dt><dd className="font-medium">{date(allow.periodStart)} to {date(allow.periodEnd)}</dd></div>
        <div><dt className="text-xs text-zinc-500">Corrections made</dt><dd className="font-medium">{allow.replacements} (free)</dd></div>
        <div><dt className="text-xs text-zinc-500">Approved / published</dt><dd className="font-medium">{outcome.approved} / {outcome.published}</dd></div>
        <div><dt className="text-xs text-zinc-500">Next new video</dt><dd className="font-medium">{allow.eligible ? "eligible now, when a strong idea exists" : date(allow.nextEligibleAt)}</dd></div>
        <div><dt className="text-xs text-zinc-500">Publishing channel</dt><dd className="font-medium">{channel ? "YouTube connected" : "No channel connected"}</dd></div>
        <div><dt className="text-xs text-zinc-500">Logo on file</dt><dd className="font-medium">{kit?.logos.length ? `Yes, used exactly as supplied (${kit.logos.length})` : "NEEDS BRAND ASSET"}</dd></div>
        <div><dt className="text-xs text-zinc-500">End-card credit</dt><dd className="font-medium">{attribution ?? "None"}</dd></div>
        <div><dt className="text-xs text-zinc-500">Videos reviewed so far</dt><dd className="font-medium">{reviews.length}</dd></div>
      </dl>
      <form action={changeReviewEmailAction} className="mt-5 border-t border-zinc-100 pt-4">
        <p className="text-sm font-medium text-zinc-900">Marketing review email</p>
        <p className="mt-1 text-xs text-zinc-600">
          Review, replacement and attention messages go to {contact.current ?? "nobody yet (add an address)"}.{contact.pending ? ` Waiting for ${contact.pending} to confirm.` : ""} A new address is only used after it is confirmed from a link sent to it.
        </p>
        <input type="hidden" name="productId" value={product.id} />
        <div className="mt-2 flex gap-2">
          <input type="email" name="email" required placeholder="name@yourcompany.com" className="w-64 rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">Send confirmation</button>
        </div>
      </form>
      <form action={changeVoiceAction} className="mt-5 border-t border-zinc-100 pt-4">
        <p className="text-sm font-medium text-zinc-900">Brand voice</p>
        <p className="mt-1 text-xs text-zinc-600">One narrator for every video. Free, offline voices only. Tone changes the pace. Currently {voice.voice}, {voice.tone}, {voice.variation === "none" ? "never varied" : voice.variation === "pacing" ? "same narrator, pace varied slightly" : "approved alternate narrators allowed"}.</p>
        <input type="hidden" name="productId" value={product.id} />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {cards.map((c) => (
            <label key={c.id} className="flex cursor-pointer flex-col gap-1 rounded-lg border border-zinc-200 p-3 text-sm has-[:checked]:border-zinc-900">
              <span className="flex items-center gap-2"><input type="radio" name="voice" value={c.id} defaultChecked={voice.voice === c.id} /><span className="font-medium">{c.label}</span><span className="text-xs text-zinc-500">{c.locale}</span></span>
              <span className="text-xs text-zinc-600">{c.style ?? "Preview coming"}</span>
              <audio controls preload="none" src={c.previewUrl} className="h-8 w-full" />
            </label>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <select name="tone" defaultValue={voice.tone} className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">{Object.entries(TONES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}</select>
          <select name="variation" defaultValue={voice.variation} className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"><option value="none">Never vary the narrator</option><option value="pacing">Same narrator, vary pace</option><option value="alternate">Allow an alternate narrator</option></select>
          <select name="alternate" defaultValue="" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"><option value="">Alternate narrator: none</option>{OFFERED_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select>
          <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">Save voice</button>
        </div>
        <textarea name="pronunciations" defaultValue={Object.entries(voice.pronunciations ?? {}).map(([k, v]) => `${k}=${v}`).join(String.fromCharCode(10))} placeholder={"Pronunciations, one per line: Knird=nerd"} className="mt-2 w-full max-w-md rounded-md border border-zinc-300 px-3 py-1.5 text-xs" rows={2} />
      </form>
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
