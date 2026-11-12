import { ACTION_LABELS, OVERALL_SHORTCUTS, SCENE_ACTIONS, type OverallShortcut, type SceneAction, type SceneEditView, type SceneView } from "@/lib/marketing-studio/revisions/scene-edits";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function Choice({ scene, action, disabled }: { scene: SceneView; action: SceneAction; disabled?: boolean }) {
  return (
    <label className={`rounded-full border px-3 py-1.5 text-sm ${disabled ? "cursor-not-allowed border-zinc-200 text-zinc-400" : "cursor-pointer border-zinc-300 has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-900 has-[:checked]:text-white"}`}>
      <input type="radio" name={`action_${scene.id}`} value={action} defaultChecked={action === "keep"} disabled={disabled} className="sr-only" />
      {ACTION_LABELS[action]}
    </label>
  );
}

function SceneCard({ scene, structure }: { scene: SceneView; structure: SceneEditView["structure"] }) {
  const editable = scene.kind === "screen" || scene.lines.length > 0;
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm" aria-label={scene.label}>
      <div className="flex gap-3">
        <div className="w-24 shrink-0">
          {scene.frame ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={scene.frame} alt={`${scene.label} frame`} className="aspect-[3/4] w-24 rounded-lg border border-zinc-200 object-cover" />
          ) : (
            <div className="flex aspect-[3/4] w-24 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-center text-xs text-zinc-500">{scene.kind === "end" ? "Closing card" : "Preview appears on newer videos"}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold">
            {scene.label} <span className="font-normal text-zinc-500">· {fmt(scene.startSec)} to {fmt(scene.endSec)} ({Math.round((scene.endSec - scene.startSec) * 10) / 10}s)</span>
          </h2>
          <p className="mt-1 text-xs text-zinc-600">
            <span className="font-semibold">Visual:</span> {scene.visual}
          </p>
          {scene.onScreen.length ? (
            <p className="mt-1 text-xs text-zinc-600">
              <span className="font-semibold">On screen:</span> {scene.onScreen.join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
      {editable
        ? scene.lines.map((l) => (
            <div key={l.id} className="mt-3 space-y-2">
              <label className="block text-sm font-semibold text-zinc-700" htmlFor={`spoken_${l.id}`}>
                What the voice says
              </label>
              <textarea id={`spoken_${l.id}`} name={`spoken_${l.id}`} defaultValue={l.spoken} rows={2} maxLength={400} className="w-full rounded-xl border border-zinc-300 p-2.5 text-base" />
              {l.caption.trim().toLowerCase() !== l.spoken.trim().toLowerCase() ? (
                <>
                  <label className="block text-sm font-semibold text-zinc-700" htmlFor={`caption_${l.id}`}>
                    What the caption shows
                  </label>
                  <textarea id={`caption_${l.id}`} name={`caption_${l.id}`} defaultValue={l.caption} rows={1} maxLength={400} className="w-full rounded-xl border border-zinc-300 p-2.5 text-base" />
                </>
              ) : null}
            </div>
          ))
        : null}
      <label className="mt-3 block text-sm font-semibold text-zinc-700" htmlFor={`note_${scene.id}`}>
        What is wrong with this scene?
      </label>
      <textarea id={`note_${scene.id}`} name={`note_${scene.id}`} rows={2} maxLength={600} placeholder="Optional. For example: too repetitive, show a different example, I do not know this place." className="w-full rounded-xl border border-zinc-300 p-2.5 text-base" />
      <fieldset className="mt-3">
        <legend className="sr-only">What to do with {scene.label}</legend>
        <div className="flex flex-wrap gap-2">
          {SCENE_ACTIONS.map((a) => (
            <Choice key={a} scene={scene} action={a} disabled={(a === "remove" && !scene.canRemove) || (a === "visual" && !scene.canReplaceVisual)} />
          ))}
        </div>
        {structure === "hand_written" ? <p className="mt-2 text-xs text-zinc-500">This video was made by hand, so wording can be changed here; to replace a visual or remove a scene, describe it in the note and GravyBlock will handle it.</p> : null}
      </fieldset>
    </section>
  );
}

/** The page behind Request Changes: the video as scenes, each with its words, its note and what to do with it. No markers, timing or scripts are shown. */
export function SceneEditor({ view, token, txn, error, productName, watchUrl, thumbUrl }: { view: SceneEditView; token: string; txn: string; error?: string; productName: string; watchUrl: string; thumbUrl: string }) {
  return (
    <form action="/api/video-review/changes" method="post" className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="txn" value={txn} />
      <input type="hidden" name="editor" value="1" />
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{productName}</p>
        <h1 className="mt-1 text-xl font-bold">Edit your video</h1>
        <p className="mt-1 text-sm text-zinc-700">
          {view.title} · {Math.round(view.durationSec)} seconds. Change anything below; leave a scene on Keep and it stays exactly as it is.
        </p>
        <a href={watchUrl} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl} alt="Watch the current video" className="block w-full" />
        </a>
        {error ? <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">{error}</p> : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label htmlFor="overall" className="block text-base font-semibold">
          Overall changes
        </label>
        <p className="text-xs text-zinc-600">Instructions that apply to the whole video.</p>
        <textarea id="overall" name="overall" rows={3} maxLength={1200} placeholder="For example: make this less repetitive, shorten the whole video, use U.S. examples, make it more exciting." className="mt-2 w-full rounded-xl border border-zinc-300 p-2.5 text-base" />
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(OVERALL_SHORTCUTS) as OverallShortcut[]).map((k) => (
            <label key={k} className="cursor-pointer rounded-full border border-zinc-300 px-3 py-1.5 text-sm has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-900 has-[:checked]:text-white">
              <input type="checkbox" name={`overall_${k}`} className="sr-only" />
              {OVERALL_SHORTCUTS[k].label}
            </label>
          ))}
        </div>
      </section>

      {view.scenes.map((sc) => (
        <SceneCard key={sc.id} scene={sc} structure={view.structure} />
      ))}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label htmlFor="cta_text" className="block text-sm font-semibold text-zinc-700">
          Call to action button
        </label>
        <input id="cta_text" name="cta_text" defaultValue={view.ctaText} maxLength={60} className="mt-1 w-full rounded-xl border border-zinc-300 p-2.5 text-base" />
      </section>

      <div className="sticky bottom-0 -mx-4 border-t border-zinc-200 bg-zinc-50/95 px-4 py-3 backdrop-blur">
        <button className="w-full rounded-xl bg-zinc-900 px-5 py-3.5 text-base font-bold text-white">Submit changes</button>
        <p className="mt-2 text-center text-xs text-zinc-500">Your current video stays unlisted. GravyBlock makes the new version, checks it, and emails you when it is ready to review.</p>
      </div>
    </form>
  );
}
