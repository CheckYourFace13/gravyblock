import { desc, eq } from "drizzle-orm";
import { listConnections } from "@/lib/marketing-studio/credentials";
import { ms, requireStudioDb } from "@/lib/marketing-studio/db";
import { evaluateHealth } from "@/lib/marketing-studio/publishing/connections";
import { facebookOAuthConfigured } from "@/lib/marketing-studio/publishing/oauth-facebook";
import { youtubeOAuthConfigured } from "@/lib/marketing-studio/publishing/oauth-youtube";
import { PLATFORM_SPECS } from "@/lib/marketing-studio/publishing/platforms";
import { approvedSetting, LIVE_SETTING, listPublications } from "@/lib/marketing-studio/publishing/queue";
import { getSetting } from "@/lib/marketing-studio/runtime";
import { INTERNAL_SCOPE } from "@/lib/marketing-studio/scope";
import { approvePublicationAction, cancelPublicationAction, connectAccountAction, createPublicationAction, markDeletedAction, refreshHealthAction, revokeAccountAction, schedulePublicationAction } from "../../actions";

const btn = "rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white";
const input = "mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-xs";

const tone = (s: string) => (["published", "exported", "approved", "scheduled"].includes(s) ? "bg-emerald-100 text-emerald-800" : ["failed", "revoked", "cancelled", "deleted"].includes(s) ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800");

export async function PublishingSections({ productId }: { productId: string }) {
  const db = requireStudioDb();
  const [creatives, videos, pubs, connections, live, platformApproved] = await Promise.all([
    db.select().from(ms.msCreatives).where(eq(ms.msCreatives.productId, productId)).orderBy(desc(ms.msCreatives.createdAt)),
    db.select().from(ms.msVideos).where(eq(ms.msVideos.productId, productId)).orderBy(desc(ms.msVideos.createdAt)),
    listPublications(INTERNAL_SCOPE, productId, db),
    listConnections(INTERNAL_SCOPE, productId, db),
    getSetting<boolean>(LIVE_SETTING, false, db),
    Promise.all((Object.keys(PLATFORM_SPECS) as Array<keyof typeof PLATFORM_SPECS>).map(async (p) => [p, await getSetting<boolean>(approvedSetting(p), false, db)] as const)),
  ]);
  const approvedCreatives = creatives.filter((c) => c.status === "approved");
  const approvedVideos = videos.filter((v) => v.status === "approved");
  const attested = Object.fromEntries(platformApproved);

  return (
    <>
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Publishing</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Everything starts as <strong>approval required</strong>. Live posting is <strong className={live ? "text-red-700" : "text-emerald-700"}>{live ? "ON" : "OFF"}</strong> (it is off by default; no automatic public
          posting exists in this phase). Where direct posting is not available, export a bundle and upload manually.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-1 pr-3">Platform</th>
                <th className="pr-3">Media</th>
                <th className="pr-3">Direct posting</th>
                <th className="pr-3">Limits</th>
                <th>Needs</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(PLATFORM_SPECS).map((sp) => (
                <tr key={sp.platform} className="border-t border-zinc-100 align-top">
                  <td className="py-1.5 pr-3 font-medium">{sp.label}</td>
                  <td className="pr-3">{[sp.media.image ? "images" : null, sp.media.video ? "video" : null].filter(Boolean).join(", ")}</td>
                  <td className="pr-3">
                    {sp.direct === "available_with_healthy_connection" ? "Available with a healthy connection" : attested[sp.platform] ? "Approval attested" : "Not available: needs platform approval"}
                  </td>
                  <td className="pr-3">
                    cap {sp.rateLimit.ourCap24h}/day{sp.rateLimit.max24h ? ` (platform ${sp.rateLimit.max24h})` : ""}
                  </td>
                  <td>{sp.auth.requiredScopes.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-zinc-500">Details marked VERIFY in the platform notes come from secondary sources and must be checked before an approval is attested.</p>
        </div>

        <h3 className="mt-5 text-sm font-semibold text-zinc-900">Prepare a post</h3>
        {approvedCreatives.length + approvedVideos.length === 0 ? (
          <p className="mt-1 text-xs text-zinc-500">Approve a creative or video above first; only approved media can be prepared.</p>
        ) : (
          <form action={createPublicationAction} className="mt-2 grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="productId" value={productId} />
            <label className="text-xs sm:col-span-2">
              Media
              <select name="media" className={input}>
                {approvedCreatives.map((c) => (
                  <option key={c.id} value={`creative:${c.id}`}>
                    Image {c.sizeKey} ({c.templateFamily.replaceAll("_", " ")})
                  </option>
                ))}
                {approvedVideos.map((v) => (
                  <option key={v.id} value={`video:${v.id}`}>
                    Video: {v.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Platform
              <select name="platform" className={input}>
                {Object.values(PLATFORM_SPECS).map((sp) => (
                  <option key={sp.platform} value={sp.platform}>
                    {sp.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              How
              <select name="mode" className={input}>
                <option value="export">Export bundle (manual upload)</option>
                <option value="direct">Direct (needs approval and a healthy connection)</option>
              </select>
            </label>
            <label className="text-xs sm:col-span-2">
              Connection (direct only)
              <select name="connectionId" className={input}>
                <option value="">None</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.platform}: {c.accountLabel}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs sm:col-span-2">
              Title (YouTube)
              <input name="title" className={input} />
            </label>
            <label className="text-xs sm:col-span-4">
              Caption (leave empty to use the concept caption)
              <textarea name="caption" rows={2} className={input} />
            </label>
            <div className="sm:col-span-4">
              <button className={btn}>Prepare (approval required)</button>
            </div>
          </form>
        )}

        <h3 className="mt-5 text-sm font-semibold text-zinc-900">Queue and history</h3>
        <ul className="mt-2 divide-y divide-zinc-100 text-xs">
          {pubs.map((p) => (
            <li key={p.id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{PLATFORM_SPECS[p.platform as keyof typeof PLATFORM_SPECS]?.label ?? p.platform}</span> · {p.mode} ·{" "}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tone(p.status)}`}>{p.status.replaceAll("_", " ")}</span>
                  {p.scheduledFor ? ` · ${p.scheduledFor.toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}
                  {p.attempts ? ` · attempt ${p.attempts}/${p.maxAttempts}` : ""}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {["approval_required", "draft"].includes(p.status) ? (
                    <form action={approvePublicationAction}>
                      <input type="hidden" name="productId" value={productId} />
                      <input type="hidden" name="publicationId" value={p.id} />
                      <button className="rounded-full bg-emerald-700 px-2 py-0.5 font-semibold text-white">Approve</button>
                    </form>
                  ) : null}
                  {p.status === "approved" && p.mode === "direct" ? (
                    <form action={schedulePublicationAction} className="flex items-center gap-1">
                      <input type="hidden" name="productId" value={productId} />
                      <input type="hidden" name="publicationId" value={p.id} />
                      <input type="datetime-local" name="when" required className="rounded border border-zinc-300 px-1 py-0.5" />
                      <button className="rounded-full bg-zinc-900 px-2 py-0.5 font-semibold text-white">Schedule</button>
                    </form>
                  ) : null}
                  {["approved", "scheduled", "exported"].includes(p.status) ? (
                    <a className="underline" href={`/api/admin/marketing-studio/export/${p.id}`}>
                      Export bundle
                    </a>
                  ) : null}
                  {["published", "exported"].includes(p.status) ? (
                    <form action={markDeletedAction}>
                      <input type="hidden" name="productId" value={productId} />
                      <input type="hidden" name="publicationId" value={p.id} />
                      <button className="underline text-zinc-600">Mark deleted</button>
                    </form>
                  ) : null}
                  {!["published", "publishing", "deleted", "cancelled", "revoked"].includes(p.status) ? (
                    <form action={cancelPublicationAction}>
                      <input type="hidden" name="productId" value={productId} />
                      <input type="hidden" name="publicationId" value={p.id} />
                      <button className="underline text-zinc-600">Cancel</button>
                    </form>
                  ) : null}
                </span>
              </div>
              {p.failureReason ? <p className="text-red-800">Reason: {p.failureReason}</p> : null}
              {p.externalUrl ? (
                <p className="text-zinc-600">
                  Posted: <a className="underline" href={p.externalUrl}>{p.externalPostId}</a>
                </p>
              ) : null}
            </li>
          ))}
          {pubs.length === 0 ? <li className="py-2 text-zinc-500">Nothing prepared yet.</li> : null}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Platform connections</h2>
        <p className="mt-1 text-sm text-zinc-600">Each connection belongs to this product only. Tokens are stored encrypted and never shown; revoking destroys the stored token and stops its pending posts. No account is connected by default.</p>
        <ul className="mt-3 divide-y divide-zinc-100 text-xs">
          {connections.map((c) => {
            const h = evaluateHealth({ status: c.status, revokedAt: c.revokedAt, tokenExpiresAt: c.tokenExpiresAt, healthStatus: c.healthStatus });
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {c.platform}: {c.accountLabel} <span className="text-zinc-500">({c.externalAccountId})</span> · health <strong>{h}</strong>
                  {c.tokenExpiresAt ? ` · expires ${c.tokenExpiresAt.toISOString().slice(0, 10)}` : ""}
                  {c.healthDetail ? <span className="block text-amber-800">{c.healthDetail}</span> : null}
                </span>
                <span className="flex gap-2">
                  <form action={refreshHealthAction}>
                    <input type="hidden" name="productId" value={productId} />
                    <input type="hidden" name="connectionId" value={c.id} />
                    <button className="underline">Check health</button>
                  </form>
                  {h !== "revoked" ? (
                    <form action={revokeAccountAction}>
                      <input type="hidden" name="productId" value={productId} />
                      <input type="hidden" name="connectionId" value={c.id} />
                      <button className="underline text-red-800">Revoke</button>
                    </form>
                  ) : null}
                </span>
              </li>
            );
          })}
          {connections.length === 0 ? <li className="py-2 text-zinc-500">None connected.</li> : null}
        </ul>
        <div className="mt-3 rounded-xl border border-zinc-200 p-3 text-xs">
          <p className="font-semibold text-zinc-900">Connect a Facebook Page (official sign-in, nothing is typed or pasted)</p>
          {facebookOAuthConfigured() ? (
            <form action="/api/admin/marketing-studio/connect/facebook/start" method="get" className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="productId" value={productId} />
              <label>
                Page username (optional, picks the right Page if you manage several)
                <input name="handle" className={input} placeholder="for example drinkknird" />
              </label>
              <button className={btn}>Connect with Facebook</button>
            </form>
          ) : (
            <p className="mt-1 text-amber-800">Not available yet: the Studio Meta app id and secret are not configured on the web server.</p>
          )}
          <p className="mt-2 text-zinc-500">Requests only: pages_show_list, pages_read_engagement, pages_manage_posts, read_insights. Instagram and TikTok stay export-only until each platform approves direct posting.</p>
        </div>
        <div className="mt-3 rounded-xl border border-zinc-200 p-3 text-xs">
          <p className="font-semibold text-zinc-900">Connect the YouTube channel (official Google sign-in, nothing is typed or pasted)</p>
          {youtubeOAuthConfigured() ? (
            <form action="/api/admin/marketing-studio/connect/youtube/start" method="get" className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="productId" value={productId} />
              <label>
                Exact channel handle or name you are connecting (required; any other channel is refused)
                <input name="channel" required defaultValue="iscreamstudio" className={input} />
              </label>
              <button className={btn}>Connect with YouTube</button>
            </form>
          ) : (
            <p className="mt-1 text-amber-800">Not available yet: the Studio Google OAuth client id and secret are not configured on the web server.</p>
          )}
          <p className="mt-2 text-zinc-500">Requests only: youtube.upload (upload) and youtube.readonly (identify the channel, confirm the uploaded video, read its public counts). Uploads go only to the channel shown on the connection above; videos are sent to YouTube only for products where the owner has enabled it, and direct upload stays off until the platform approval is attested.</p>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-zinc-700">Register a connection (token from the platform; minimal scopes only)</summary>
          <form action={connectAccountAction} className="mt-3 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="productId" value={productId} />
            <label className="text-xs">
              Platform
              <select name="platform" className={input}>
                {Object.values(PLATFORM_SPECS).map((sp) => (
                  <option key={sp.platform} value={sp.platform}>
                    {sp.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Account label
              <input name="accountLabel" required className={input} />
            </label>
            <label className="text-xs">
              Platform account or Page id
              <input name="externalAccountId" required className={input} />
            </label>
            <label className="text-xs sm:col-span-2">
              Access token (stored encrypted, never displayed)
              <input name="accessToken" type="password" autoComplete="off" required className={input} />
            </label>
            <label className="text-xs">
              Token expires (optional)
              <input name="expiresAt" type="date" className={input} />
            </label>
            <fieldset className="text-xs sm:col-span-3">
              <legend>Granted scopes (only these can be used; extras are refused)</legend>
              <div className="mt-1 flex flex-wrap gap-3">
                {[...new Set(Object.values(PLATFORM_SPECS).flatMap((sp) => sp.auth.allowedScopes))].map((sc) => (
                  <label key={sc} className="flex items-center gap-1">
                    <input type="checkbox" name="scopes" value={sc} /> {sc}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="sm:col-span-3">
              <button className={btn}>Register connection</button>
            </div>
          </form>
        </details>
      </section>
    </>
  );
}
