// Operator tool for the permanent Game pipeline. It only calls the pipeline's own functions; it never edits a video.
//   migrate                  classify the owner's known games as Product Type = Game, seed their profiles, refresh readiness
//   status                   one line per game: type, profile gaps, readiness, supported formats, angles
//   capture <slug>           capture fresh real gameplay into the library (the same call the pipeline makes when it needs more footage)
//   next <slug>              queue the next video through the normal path (the same as Generate Next Video)
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-game-pipeline.ts <command> [slug]
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { isGameKind } from "../../src/lib/marketing-studio/config";
import { getAngles } from "../../src/lib/marketing-studio/library-store";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { getGameProfile, profileGaps } from "../../src/lib/marketing-studio/video/game/profile";
import { classifyOwnedGames, ensureSession, gameTick, refreshReadiness, seedKnownGame } from "../../src/lib/marketing-studio/video/game/production";

async function main() {
  const [cmd, slug] = process.argv.slice(2);
  const db = requireStudioDb();
  const log = (m: string) => console.log(m);
  const products = (await listProducts(INTERNAL_SCOPE, db)) as unknown as Array<{ id: string; slug: string; name: string; kind: string; ownerKind: string; publicUrl?: string }>;
  if (cmd === "migrate") {
    console.log("classified:", await classifyOwnedGames(db, log));
    for (const p of products.filter((x) => isGameKind(x.kind) || x.slug === "bloxmigos")) {
      const fresh = (await listProducts(INTERNAL_SCOPE, db)).find((x) => x.id === p.id) as unknown as typeof p;
      await seedKnownGame(db, fresh);
      const r = await refreshReadiness(db, fresh);
      console.log(`${p.slug}: ${fresh.kind}, gaps ${JSON.stringify(profileGaps(await getGameProfile(db, p.id)))}, sessions ${r.sessions}, levels ${r.levels}, supported ${r.supported.join(",")}`);
    }
  } else if (cmd === "status") {
    for (const p of products.filter((x) => isGameKind(x.kind))) {
      const r = await refreshReadiness(db, p);
      const angles = await getAngles(db, p.slug);
      console.log(JSON.stringify({ slug: p.slug, kind: p.kind, gaps: profileGaps(await getGameProfile(db, p.id)), capture: r.source, sessions: r.sessions, levels: r.levels, mechanics: r.mechanics, audio: r.audio, supported: r.supported, unsupported: r.unsupported.map((u) => `${u.format}: ${u.reason}`), angles: angles.map((a) => `${a.specId?.split(":game-")[1] ?? a.id}=${a.status}`) }));
    }
  } else if (cmd === "capture" && slug) {
    const dir = await ensureSession(slug, log, { fresh: true, levels: Number(process.env.LEVELS ?? 12) });
    console.log("captured into", dir);
  } else if (cmd === "next" && slug) {
    const p = products.find((x) => x.slug === slug);
    if (!p) throw new Error(`${slug} is not a Studio product`);
    console.log(await gameTick(db, p as never, { force: true, review: [], activeJobs: 0 }, log));
  } else throw new Error("usage: migrate | status | capture <slug> | next <slug>");
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => closeStudioDb());
