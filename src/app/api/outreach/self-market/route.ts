// GravyBlock's own outreach engine — runs one city+industry combo per call,
// rotating through the top 5 cities x top 5 industries list.
// Rotation state is persisted in the jobs table with type = "outreach_rotation_state".

import { verifyAutopilotOperatorRequest } from "@/lib/autopilot/operator-auth";
import { runOutreachBatch } from "@/lib/outreach/run-outreach-batch";
import { getDb, jobs } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { CITIES, INDUSTRIES } from "@/lib/local-seo/markets";

// Top 5 cities and top 5 industries for GravyBlock's own customer acquisition
const TOP_CITIES = CITIES.slice(0, 5); // Austin TX, Dallas TX, Houston TX, San Antonio TX, Phoenix AZ
const TOP_INDUSTRIES = INDUSTRIES.slice(0, 5); // plumber, dentist, restaurant, gym, salon

// Flattened rotation list: 25 combos total
const ROTATION: Array<{ city: string; state: string; industry: string }> = TOP_CITIES.flatMap((city) =>
  TOP_INDUSTRIES.map((industry) => ({
    city: city.name,
    state: city.state,
    industry: industry.slug,
  })),
);

const ROTATION_JOB_TYPE = "outreach_rotation_state";

async function getNextRotationIndex(): Promise<number> {
  const db = getDb();
  if (!db) return 0;

  const last = await db
    .select({ payload: jobs.payload })
    .from(jobs)
    .where(eq(jobs.type, ROTATION_JOB_TYPE))
    .orderBy(desc(jobs.createdAt))
    .limit(1);

  if (last.length === 0) return 0;

  const payload = last[0].payload as { lastIndex?: number } | null;
  const lastIndex = typeof payload?.lastIndex === "number" ? payload.lastIndex : -1;
  return (lastIndex + 1) % ROTATION.length;
}

async function saveRotationIndex(index: number): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db.insert(jobs).values({
    type: ROTATION_JOB_TYPE,
    payload: { lastIndex: index },
    status: "done",
  });
}

export async function POST(req: Request) {
  const denied = verifyAutopilotOperatorRequest(req);
  if (denied) return denied;

  const index = await getNextRotationIndex();
  const combo = ROTATION[index];

  if (!combo) {
    return Response.json({ error: "Rotation list is empty" }, { status: 500 });
  }

  console.info("[self-market] Running outreach for combo", {
    index,
    city: combo.city,
    state: combo.state,
    industry: combo.industry,
  });

  const result = await runOutreachBatch({
    city: combo.city,
    state: combo.state,
    industry: combo.industry,
    // No agencyName — this is GravyBlock's own outreach
  });

  await saveRotationIndex(index);

  return Response.json({
    ok: true,
    combo: { city: combo.city, state: combo.state, industry: combo.industry },
    rotationIndex: index,
    rotationTotal: ROTATION.length,
    ...result,
  });
}
