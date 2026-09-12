import { timingSafeEqual, createHmac, randomUUID } from "node:crypto";
import { getSqlClient, getDb, jobs } from "@/lib/db";
import { isOptedOut } from "@/lib/email/optout";
import { assertOutreachSendingAllowed } from "@/lib/outreach/pause-guard";

/** TEMPORARY, secret-gated. One-time approved final follow-up to Sammy Tantawy + Tabatha Nolan. Remove after use. */
function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!expected || !provided) return false;
  const a = createHmac("sha256", "warm-lead-followup").update(provided).digest();
  const b = createHmac("sha256", "warm-lead-followup").update(expected).digest();
  return timingSafeEqual(a, b);
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
const SENDER_NAME = "Chris";
const SENDER_TITLE = "GravyBlock";

type Target = "sammy" | "tabatha";

const TARGETS: Record<Target, { email: string; businessId: string; businessNameFallback: string }> = {
  sammy: { email: "sammy@unicornmedispa.com", businessId: "af881ef1-9773-4081-8402-03663153e7fe", businessNameFallback: "Unicorn Medical Weight Loss & Medi Spa" },
  tabatha: { email: "nolansappliance@yahoo.com", businessId: "c4ddb947-0db0-492a-92bd-9ebec3e94a25", businessNameFallback: "Nolan's A/C & Heating Repair" },
};

async function latestReportFor(businessId: string) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql.unsafe(
    `select r.public_id, r.overall_score, r.payload, r.created_at, b.name as business_name, b.city
     from reports r
     join scans s on s.id = r.scan_id
     join businesses b on b.id = s.business_id
     where s.business_id = $1
     order by r.created_at desc
     limit 1`,
    [businessId],
  );
  return (rows as unknown as Array<Record<string, unknown>>)[0] ?? null;
}

function resendConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.OUTREACH_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL ?? `${SENDER_NAME} at GravyBlock <hello@gravyblock.com>`,
  };
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const [sammyReport, tabathaReport] = await Promise.all([
    latestReportFor(TARGETS.sammy.businessId),
    latestReportFor(TARGETS.tabatha.businessId),
  ]);
  return Response.json({ sammyReport, tabathaReport });
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { target?: Target } | null;
  const target = body?.target;
  if (!target || !TARGETS[target]) return Response.json({ error: "invalid target" }, { status: 400 });

  const { email, businessId, businessNameFallback } = TARGETS[target];

  if (await isOptedOut(email)) {
    return Response.json({ ok: false, skipped: true, reason: "opted out" });
  }
  const pauseCheck = await assertOutreachSendingAllowed(email);
  if (!pauseCheck.allowed) {
    return Response.json({ ok: false, skipped: true, reason: pauseCheck.reason });
  }

  const report = await latestReportFor(businessId);
  if (!report) {
    return Response.json({ ok: false, skipped: true, reason: "no report found for business" }, { status: 404 });
  }

  const businessName = (report.business_name as string) || businessNameFallback;
  const score = report.overall_score as number;
  const publicId = report.public_id as string;
  const payload = report.payload as { topFixes?: Array<{ title?: string; description?: string }> } | null;
  const topFinding = payload?.topFixes?.[0];

  const attributionToken = randomUUID();
  const reportUrl = `${SITE_URL}/report/${publicId}?src=${encodeURIComponent(attributionToken)}`;

  const findingLine = topFinding?.title
    ? `${topFinding.title} — that's the biggest thing holding ${businessName} back on Google right now (scored ${score}/100).`
    : `${businessName} scored ${score}/100 on our latest scan — the report below shows exactly where the room to improve is.`;

  const subject = `${businessName} — one last note from me directly`;

  const text = `Hi,

I know I've reached out before about ${businessName}'s Google visibility, so I'll keep this short and make it personal — this is genuinely the last one.

${findingLine}

Here's the current report, already run, no signup needed:
${reportUrl}

If you want it handled automatically, Autopilot is $74.99/mo, locked for as long as you stay subscribed — not just the first month — with a 30-day money-back guarantee, so there's no real risk in trying it.

Just reply to this email if you want me to set it up, or if you'd rather I leave you alone — either is fine, no hard feelings.

${SENDER_NAME}
${SENDER_TITLE} — https://gravyblock.com`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.65;color:#1a1a1a;max-width:560px;margin:0 auto;padding:32px 20px;background:#fff">
  <p style="margin:0 0 18px">Hi,</p>
  <p style="margin:0 0 18px">I know I've reached out before about <strong>${businessName}</strong>'s Google visibility, so I'll keep this short and make it personal — this is genuinely the last one.</p>
  <p style="margin:0 0 18px">${findingLine}</p>
  <p style="margin:0 0 24px;text-align:center">
    <a href="${reportUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:999px">See the current report →</a>
  </p>
  <p style="margin:0 0 18px;font-size:14px;color:#555">If you want it handled automatically, Autopilot is <strong>$74.99/mo, locked</strong> for as long as you stay subscribed — not just the first month — with a <strong>30-day money-back guarantee</strong>, so there's no real risk in trying it.</p>
  <p style="margin:0 0 18px">Just reply to this email if you want me to set it up, or if you'd rather I leave you alone — either is fine, no hard feelings.</p>
  <p style="margin:0 0 6px;font-size:14px">${SENDER_NAME}<br/><a href="https://gravyblock.com" style="color:#dc2626;text-decoration:none">${SENDER_TITLE}</a></p>
</body>
</html>`;

  const cfg = resendConfig();
  if (!cfg.apiKey) return Response.json({ ok: false, error: "RESEND_API_KEY not set" }, { status: 500 });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      from: cfg.from,
      to: [email],
      subject,
      html,
      text,
      tags: [{ name: "type", value: "manual_founder_final_followup" }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    return Response.json({ ok: false, error: `Resend API error: ${res.status} ${errBody}` }, { status: 502 });
  }

  const resBody = (await res.json().catch(() => null)) as { id?: string } | null;
  const resendEmailId = resBody?.id ?? null;

  const db = getDb();
  if (db) {
    await db.insert(jobs).values({
      type: "manual_founder_followup_sent",
      status: "completed",
      payload: { to: email, businessName, sentAt: new Date().toISOString(), resendEmailId, attributionToken, target, publicId },
    });
  }

  return Response.json({ ok: true, resendEmailId, businessName, reportUrl, score });
}
