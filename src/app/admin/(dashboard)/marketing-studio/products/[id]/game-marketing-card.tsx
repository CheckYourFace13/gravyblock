import { requireStudioDb } from "@/lib/marketing-studio/db";
import { PRODUCT_TYPES } from "@/lib/marketing-studio/config";
import { getSetting } from "@/lib/marketing-studio/runtime";
import { getMaxPending, targetStats } from "@/lib/marketing-studio/video-target";
import { GAME_FORMATS, GAME_LIBRARY_ORDER, type GameFormat } from "@/lib/marketing-studio/video/game/engine";
import { ENERGIES, ENERGY_LABEL, GAME_PLATFORMS, getGameProfile, ORIENTATIONS, profileGaps } from "@/lib/marketing-studio/video/game/profile";
import { gameVoiceFor, gameVoices } from "@/lib/marketing-studio/video/game/script";
import { readinessKey, type GameReadiness } from "@/lib/marketing-studio/video/game/production";
import { saveGameProfileAction, setProductTypeAction } from "../../actions";

const field = "mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm";
const ghost = "rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-800";

/** The Game Marketing controls: what the game is, how it should sound, which videos it supports and whether its gameplay is ready. No worker internals. */
export async function GameMarketingCard({ product }: { product: { id: string; slug?: string; kind: string; ownerKind: string } }) {
  const db = requireStudioDb();
  const profile = await getGameProfile(db, product.id);
  const tp = { id: product.id, slug: product.slug ?? "", kind: product.kind, ownerKind: product.ownerKind };
  const stats = await targetStats(db, tp);
  const pending = await getMaxPending(db, tp);
  const ready = await getSetting<GameReadiness | null>(readinessKey(product.slug ?? ""), null, db);
  const gaps = profileGaps(profile);
  const voice = gameVoiceFor({ voice: profile.voice, energy: profile.energy }, product.slug ?? "");
  const voices = gameVoices();
  const offered = (ready?.supported ?? GAME_LIBRARY_ORDER.slice(0, 7)) as GameFormat[];
  const chosen = new Set(profile.preferredFormats);
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-base font-semibold text-zinc-900">Game marketing</h2>
      <p className="mt-1 text-xs text-zinc-600">Games sell the fun first: real gameplay at once, a stretch you can follow, a payoff, and a voice that is excited about what is happening.</p>

      <form action={setProductTypeAction} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="productId" value={product.id} />
        <label className="text-zinc-700" htmlFor="ptype">What are we marketing?</label>
        <select id="ptype" name="kind" defaultValue={product.kind === "mobile_game" || product.kind === "web_game" ? "game" : product.kind} className="rounded-md border border-zinc-300 px-2 py-1.5">
          {PRODUCT_TYPES.map((t) => <option key={t.kind} value={t.kind}>{t.label}</option>)}
        </select>
        <button className={ghost}>Save</button>
      </form>

      <div className="mt-4 rounded-md bg-zinc-50 p-3">
        <p className="text-sm font-medium text-zinc-900">Gameplay readiness</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-zinc-500">Gameplay capture</dt><dd className="font-medium">{ready?.ready ? "Ready" : ready?.source === "none" ? "Needs a capture method" : ready ? "Capturing soon" : "Checking"}</dd></div>
          <div><dt className="text-xs text-zinc-500">Sessions captured</dt><dd className="font-medium">{ready?.sessions ?? 0}</dd></div>
          <div><dt className="text-xs text-zinc-500">Levels captured</dt><dd className="font-medium">{ready?.levels ?? 0}</dd></div>
          <div><dt className="text-xs text-zinc-500">Distinct mechanics captured</dt><dd className="font-medium">{ready?.mechanics ?? 0}</dd></div>
          <div><dt className="text-xs text-zinc-500">Game audio</dt><dd className="font-medium">{ready?.audio ? "Available" : "Not captured yet (music and voice are used)"}</dd></div>
          <div><dt className="text-xs text-zinc-500">Store destination</dt><dd className="font-medium">{ready?.storeVerified ? "Verified" : "Not live yet (videos invite people to follow)"}</dd></div>
          <div><dt className="text-xs text-zinc-500">Videos created</dt><dd className="font-medium">{stats.approved + stats.waiting}</dd></div>
          <div><dt className="text-xs text-zinc-500">Pending review</dt><dd className="font-medium">{stats.waiting} of {pending.max} allowed</dd></div>
          <div><dt className="text-xs text-zinc-500">Published</dt><dd className="font-medium">{stats.approved}</dd></div>
        </dl>
        {ready && ready.unsupported.length ? <p className="mt-2 text-xs text-zinc-500">Not offered for this game yet: {ready.unsupported.map((u) => `${GAME_FORMATS[u.format].label} (${u.reason})`).join("; ")}.</p> : null}
      </div>

      <form action={saveGameProfileAction} className="mt-5 border-t border-zinc-100 pt-4">
        <p className="text-sm font-medium text-zinc-900">Game voice and sound</p>
        <p className="mt-1 text-xs text-zinc-600">Currently {profile.voice === "auto" ? `Auto (${voice.voice})` : profile.voice}, {ENERGY_LABEL[profile.energy].toLowerCase()}. Previews play at the saved energy.</p>
        <input type="hidden" name="productId" value={product.id} />
        <input type="hidden" name="section" value="voice" />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer flex-col gap-1 rounded-lg border border-zinc-200 p-3 text-sm has-[:checked]:border-zinc-900">
            <span className="flex items-center gap-2"><input type="radio" name="voice" value="auto" defaultChecked={profile.voice === "auto"} /><span className="font-medium">Auto</span></span>
            <span className="text-xs text-zinc-600">Picks a voice that suits this game and keeps it steady across its videos.</span>
          </label>
          {voices.map((v) => (
            <label key={v.id} className="flex cursor-pointer flex-col gap-1 rounded-lg border border-zinc-200 p-3 text-sm has-[:checked]:border-zinc-900">
              <span className="flex items-center gap-2"><input type="radio" name="voice" value={v.id} defaultChecked={profile.voice === v.id} /><span className="font-medium">{v.label}</span><span className="text-xs text-zinc-500">{v.accent}, {v.gender}</span></span>
              <audio controls preload="none" src={`/api/admin/marketing-studio/voice-preview/game-${v.id}-${profile.energy}`} className="h-8 w-full" />
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="text-zinc-700" htmlFor="energy">Energy</label>
          <select id="energy" name="energy" defaultValue={profile.energy} className="rounded-md border border-zinc-300 px-2 py-1.5">{ENERGIES.map((e) => <option key={e} value={e}>{ENERGY_LABEL[e]}</option>)}</select>
          <label className="flex items-center gap-1"><input type="checkbox" name="narrationDefault" defaultChecked={profile.narrationDefault} /> Narration by default</label>
          <label className="flex items-center gap-1"><input type="checkbox" name="keepGameAudio" defaultChecked={profile.keepGameAudio} /> Keep the game&apos;s own sound</label>
          <button className={ghost}>Save voice</button>
        </div>
      </form>

      <form action={saveGameProfileAction} className="mt-5 border-t border-zinc-100 pt-4">
        <p className="text-sm font-medium text-zinc-900">Preferred formats</p>
        <p className="mt-1 text-xs text-zinc-600">Only formats this game&apos;s real gameplay supports are offered. Leave all unticked for every supported format.</p>
        <input type="hidden" name="productId" value={product.id} />
        <input type="hidden" name="section" value="formats" />
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          {GAME_LIBRARY_ORDER.filter((f) => offered.includes(f)).map((f) => (
            <label key={f} className="flex items-center gap-1"><input type="checkbox" name="format" value={f} defaultChecked={chosen.has(f)} /> {GAME_FORMATS[f].label}</label>
          ))}
          <button className={ghost}>Save formats</button>
        </div>
      </form>

      <form action={saveGameProfileAction} className="mt-5 border-t border-zinc-100 pt-4">
        <p className="text-sm font-medium text-zinc-900">About the game</p>
        <p className="mt-1 text-xs text-zinc-600">{gaps.length ? `Still needed before videos can be planned: ${gaps.join(", ")}.` : "Everything needed to plan videos is set."} What can be verified (store listing, name) comes from Product Truth; these answers set the creative direction.</p>
        <input type="hidden" name="productId" value={product.id} />
        <input type="hidden" name="section" value="setup" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm">
          <div className="sm:col-span-2 flex flex-wrap gap-3">
            <span className="text-zinc-700">Platforms</span>
            {GAME_PLATFORMS.map((p) => <label key={p} className="flex items-center gap-1"><input type="checkbox" name="platform" value={p} defaultChecked={profile.platforms.includes(p)} /> {p === "ios" ? "iOS" : p === "pc" ? "PC" : p.charAt(0).toUpperCase() + p.slice(1)}</label>)}
          </div>
          <label>Basic objective<input name="objective" defaultValue={profile.objective} placeholder="fill the page to hit the target" className={field} /></label>
          <label>What makes it fun<input name="funFactor" defaultValue={profile.funFactor} placeholder="every cut changes the whole page" className={field} /></label>
          <label>Gameplay controls<input name="controls" defaultValue={profile.controls} placeholder="hold and drag a finger to draw a cut" className={field} /></label>
          <label>Genre<input name="genre" defaultValue={profile.genre} className={field} /></label>
          <label>Major mechanics (comma separated)<input name="mechanics" defaultValue={profile.mechanics.join(", ")} className={field} /></label>
          <label>Characters and collectibles<input name="characters" defaultValue={profile.characters.join(", ")} className={field} /></label>
          <label>Progression and rewards<input name="progression" defaultValue={profile.progression} className={field} /></label>
          <label>Levels and modes<input name="levelsModes" defaultValue={profile.levelsModes} className={field} /></label>
          <label>Visual style<input name="visualStyle" defaultValue={profile.visualStyle} className={field} /></label>
          <label>Target audience<input name="audience" defaultValue={profile.audience} className={field} /></label>
          <label>Orientation<select name="orientation" defaultValue={profile.orientation} className={field}>{ORIENTATIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
          <label>Preferred length (seconds, optional)<input name="preferredSeconds" type="number" min={8} max={60} defaultValue={profile.preferredSeconds ?? ""} className={field} /></label>
          <label>Tester or live game URL<input name="testerUrl" defaultValue={profile.testerUrl} className={field} /></label>
          <label>Call to action destination (when not the store)<input name="ctaDestination" defaultValue={profile.ctaDestination} className={field} /></label>
          <label className="sm:col-span-2">Store listings (one per line)<textarea name="storeListings" defaultValue={profile.storeListings.join("\n")} rows={2} className={field} /></label>
        </div>
        <button className={`${ghost} mt-3`}>Save game setup</button>
      </form>
    </section>
  );
}
