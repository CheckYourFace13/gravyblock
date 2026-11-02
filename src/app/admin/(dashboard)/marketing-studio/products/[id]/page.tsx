import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStudioAccess } from "@/lib/marketing-studio/auth";
import { UPLOAD_KINDS, FACT_SOURCES } from "@/lib/marketing-studio/config";
import { StudioAccessError } from "@/lib/marketing-studio/scope";
import { CreativeSections } from "./creative-sections";
import { listConnections } from "@/lib/marketing-studio/credentials";
import { getBrandProfile, listAssets, listCampaigns, listClaims, listFacts, requireProduct, truthReadiness } from "@/lib/marketing-studio/repository";
import {
  addClaimAction,
  addFactAction,
  approveAssetAction,
  campaignStatusAction,
  createCampaignAction,
  deleteProductAction,
  importAssetAction,
  productStatusAction,
  removeClaimAction,
  saveBrandAction,
  verifyFactAction,
} from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketing Studio product", robots: { index: false, follow: false } };

const input = "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm";
const btn = "rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white";

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const { scope } = await requireStudioAccess();
  const { id } = await params;
  const q = await searchParams;
  let product;
  try {
    product = await requireProduct(scope, id);
  } catch (e) {
    if (e instanceof StudioAccessError) notFound();
    throw e;
  }
  const [brand, facts, claims, assets, campaigns, readiness, connections] = await Promise.all([
    getBrandProfile(scope, id),
    listFacts(scope, id),
    listClaims(scope, id),
    listAssets(scope, id),
    listCampaigns(scope, id),
    truthReadiness(scope, id),
    listConnections(scope, id),
  ]);
  const colors = (brand?.colors ?? {}) as Record<string, string>;
  const fonts = (brand?.fonts ?? {}) as Record<string, string>;
  const verifiedFacts = facts.filter((f) => f.status === "current" && f.verifiedAt);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/marketing-studio" className="text-xs text-zinc-500 underline">
          ← Marketing Studio
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{product.name}</h1>
        <p className="text-sm text-zinc-600">
          {product.kind.replace("_", " ")} · {product.ownerKind} · {product.status}
          {product.publicUrl ? (
            <>
              {" "}
              ·{" "}
              <a className="underline" href={product.publicUrl} target="_blank" rel="noreferrer">
                {product.publicUrl}
              </a>
            </>
          ) : null}
        </p>
        <p className="mt-1 text-xs text-zinc-500">This product is read-only to Marketing Studio. The studio never edits its site, app or game.</p>
        <form action={productStatusAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="productId" value={product.id} />
          {["draft", "active", "paused", "archived"].map((s) => (
            <button key={s} name="status" value={s} className={`rounded-full border px-3 py-1 text-xs font-semibold ${product.status === s ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-700"}`}>
              {s}
            </button>
          ))}
        </form>
      </div>
      {q.e ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{q.e}</p> : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Product Truth</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Every future claim must trace to a verified fact. {readiness.verifiedFacts} verified.{" "}
          {readiness.ready ? "Minimum set present." : `Missing before anything can be generated: ${readiness.missing.join(", ")}.`}
        </p>
        <ul className="mt-3 divide-y divide-zinc-100 text-sm">
          {facts.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-mono text-xs text-zinc-500">{f.factKey}</span> {f.factValue}
                <span className="ml-2 text-xs text-zinc-400">
                  {f.sourceKind}
                  {f.status !== "current" ? ` · ${f.status}` : ""}
                </span>
              </span>
              {f.verifiedAt ? (
                <span className="text-xs font-semibold text-emerald-700">verified</span>
              ) : (
                <form action={verifyFactAction}>
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="factId" value={f.id} />
                  <button className={btn}>Mark verified</button>
                </form>
              )}
            </li>
          ))}
          {facts.length === 0 ? <li className="py-2 text-zinc-500">No facts yet.</li> : null}
        </ul>
        <form action={addFactAction} className="mt-4 grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="productId" value={product.id} />
          <label className="text-xs">
            Key
            <input name="factKey" required placeholder="feature" className={input} />
          </label>
          <label className="text-xs sm:col-span-2">
            Value
            <input name="factValue" required className={input} />
          </label>
          <label className="text-xs">
            Source
            <select name="sourceKind" className={input}>
              {FACT_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs sm:col-span-3">
            Source URL (optional)
            <input name="sourceUrl" placeholder="https://" className={input} />
          </label>
          <div className="flex items-end">
            <button className={btn}>Add fact</button>
          </div>
        </form>

        <h3 className="mt-6 text-sm font-semibold text-zinc-900">Claims</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {claims.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <span>
                <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${c.kind === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{c.kind}</span>
                {c.text}
              </span>
              <form action={removeClaimAction}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="claimId" value={c.id} />
                <button className="text-xs text-zinc-500 underline">remove</button>
              </form>
            </li>
          ))}
          {claims.length === 0 ? <li className="text-zinc-500">No claims yet.</li> : null}
        </ul>
        <form action={addClaimAction} className="mt-3 grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="productId" value={product.id} />
          <label className="text-xs">
            Type
            <select name="kind" className={input}>
              <option value="approved">approved (cites verified facts)</option>
              <option value="prohibited">prohibited</option>
            </select>
          </label>
          <label className="text-xs sm:col-span-3">
            Text
            <input name="text" required className={input} />
          </label>
          <fieldset className="text-xs sm:col-span-3">
            <legend>Supporting verified facts (approved claims only)</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {verifiedFacts.map((f) => (
                <label key={f.id} className="flex items-center gap-1">
                  <input type="checkbox" name="factIds" value={f.id} /> {f.factKey}: {f.factValue.slice(0, 30)}
                </label>
              ))}
              {verifiedFacts.length === 0 ? <span className="text-zinc-500">Verify a fact first.</span> : null}
            </div>
          </fieldset>
          <div className="flex items-end">
            <button className={btn}>Add claim</button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Brand profile</h2>
        <form action={saveBrandAction} className="mt-3 grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="productId" value={product.id} />
          {(["primary", "secondary", "accent"] as const).map((k) => (
            <label key={k} className="text-xs capitalize">
              {k} color
              <input name={k} defaultValue={colors[k] ?? ""} placeholder="#dc2626" className={input} />
            </label>
          ))}
          <label className="text-xs">
            Heading font
            <input name="headingFont" defaultValue={fonts.heading ?? ""} className={input} />
          </label>
          <label className="text-xs">
            Body font
            <input name="bodyFont" defaultValue={fonts.body ?? ""} className={input} />
          </label>
          <div />
          <label className="text-xs sm:col-span-3">
            Voice rules
            <textarea name="voiceRules" defaultValue={brand?.voiceRules ?? ""} rows={2} className={input} />
          </label>
          <label className="text-xs sm:col-span-3">
            Never say
            <textarea name="doNotSay" defaultValue={brand?.doNotSay ?? ""} rows={2} className={input} />
          </label>
          <div className="sm:col-span-3">
            <button className={btn}>Save new version{brand ? ` (current v${brand.version})` : ""}</button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Brand and media assets</h2>
        <p className="mt-1 text-sm text-zinc-600">PNG, JPEG, WebP or GIF only, checked by content. Only approved assets may ever be used. Nothing is rendered in this phase.</p>
        <ul className="mt-3 divide-y divide-zinc-100 text-sm">
          {assets.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {a.originalName} <span className="text-xs text-zinc-500">{a.kind} · {a.mimeType} · {a.width ?? "?"}x{a.height ?? "?"} · {(a.bytes / 1024).toFixed(0)} KB · {a.provenance}</span>
              </span>
              {a.approved === "true" ? (
                <span className="text-xs font-semibold text-emerald-700">approved</span>
              ) : (
                <form action={approveAssetAction} className="flex items-center gap-2">
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="assetId" value={a.id} />
                  <input name="licenseNote" placeholder="source or license note" className="rounded border border-zinc-300 px-2 py-1 text-xs" />
                  <button className={btn}>Approve</button>
                </form>
              )}
            </li>
          ))}
          {assets.length === 0 ? <li className="py-2 text-zinc-500">No assets yet.</li> : null}
        </ul>
        <form action="/api/admin/marketing-studio/assets" method="post" encType="multipart/form-data" className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="productId" value={product.id} />
          <label className="text-xs">
            Type
            <select name="kind" className={input}>
              {UPLOAD_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            File
            <input type="file" name="file" accept="image/png,image/jpeg,image/webp,image/gif" required className="mt-1 block text-xs" />
          </label>
          <button className={btn}>Upload</button>
        </form>
        <form action={importAssetAction} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="productId" value={product.id} />
          <label className="text-xs">
            Type
            <select name="kind" className={input}>
              {UPLOAD_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[16rem] flex-1 text-xs">
            Or import a public https image URL
            <input name="url" placeholder="https://" required className={input} />
          </label>
          <button className={btn}>Import</button>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Campaign records</h2>
        <p className="mt-1 text-sm text-zinc-600">Plans only. Nothing is generated, scheduled or published in Phase 1.</p>
        <ul className="mt-3 divide-y divide-zinc-100 text-sm">
          {campaigns.map((c) => (
            <li key={c.id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-zinc-900">{c.name}</span>
                <form action={campaignStatusAction} className="flex items-center gap-1">
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="campaignId" value={c.id} />
                  {["draft", "needs_review", "approved", "complete", "cancelled"].map((s) => (
                    <button key={s} name="status" value={s} className={`rounded-full border px-2 py-0.5 text-[11px] ${c.status === s ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-600"}`}>
                      {s.replace("_", " ")}
                    </button>
                  ))}
                </form>
              </div>
              <p className="text-xs text-zinc-600">
                {c.objective} · level {c.automationLevel} · channels: {(c.channels as string[]).join(", ") || "none yet"}
              </p>
            </li>
          ))}
          {campaigns.length === 0 ? <li className="py-2 text-zinc-500">No campaigns yet.</li> : null}
        </ul>
        <form action={createCampaignAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="productId" value={product.id} />
          <label className="text-xs">
            Name
            <input name="name" required className={input} />
          </label>
          <label className="text-xs">
            Objective
            <input name="objective" required className={input} />
          </label>
          <label className="text-xs">
            Audience
            <input name="audience" className={input} />
          </label>
          <label className="text-xs">
            Automation level
            <select name="automationLevel" className={input}>
              <option value="1">1: manual generation and approval</option>
              <option value="2">2: automatic generation, approval before publishing</option>
            </select>
          </label>
          <fieldset className="text-xs sm:col-span-2">
            <legend>Planned channels (nothing is connected)</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              {["youtube", "facebook", "instagram", "tiktok"].map((c) => (
                <label key={c} className="flex items-center gap-1">
                  <input type="checkbox" name="channels" value={c} /> {c}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-xs sm:col-span-2">
            Notes
            <textarea name="notes" rows={2} className={input} />
          </label>
          <div className="sm:col-span-2">
            <button className={btn}>Add campaign record</button>
          </div>
        </form>
      </section>

      <CreativeSections productId={product.id} />

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Platform connections</h2>
        <p className="mt-1 text-sm text-zinc-600">
          {connections.length === 0 ? "None. Phase 1 connects no platform." : `${connections.length} stored (encrypted; secrets are never shown).`}
        </p>
      </section>

      <section className="rounded-2xl border border-red-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-red-800">Remove product</h2>
        <p className="mt-1 text-xs text-zinc-600">Archives the product and hides it. A later purge removes its files and records.</p>
        <form action={deleteProductAction} className="mt-2">
          <input type="hidden" name="productId" value={product.id} />
          <button className="rounded-full border border-red-300 px-4 py-1.5 text-xs font-semibold text-red-800">Remove from Studio</button>
        </form>
      </section>
    </div>
  );
}
