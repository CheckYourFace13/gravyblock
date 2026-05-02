import { notFound } from "next/navigation";
import { requireBusinessAccess } from "@/lib/auth/customer-guards";
import { getWorkspaceBundle } from "@/lib/report/repository";
import { normalizePlanTierFromDb, planFeatures } from "@/lib/plans";
import { getAutopilotWorkspace } from "@/lib/autopilot/repository";
import { getAiVisibilityStats } from "@/lib/ai-visibility/llm-probes";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ businessId: string }> };

export default async function PrintReportPage({ params }: Props) {
  const { businessId } = await params;
  await requireBusinessAccess(businessId, `/workspace/${businessId}`);

  const bundle = await getWorkspaceBundle(businessId);
  if (!bundle) notFound();

  const tier = normalizePlanTierFromDb(bundle.business.planTier);
  const features = planFeatures(tier);

  // Agency only
  if (tier !== "agency") notFound();

  const autopilot = await getAutopilotWorkspace(businessId).catch(() => ({
    contentQueue: [], backlinkQueue: [], aiVisibilityChecks: [],
    operatorTasks: [], automationJobs: [], upcomingJobs: [], publishingJobs: [],
    publishedContent: [], citationIssues: [],
  }));

  const aiStats = await getAiVisibilityStats(businessId).catch(() => ({
    total: 0, mentioned: 0, byEngine: {} as Record<string, { total: number; mentioned: number }>, recentChecks: [],
  }));

  const latest = bundle.snapshots[0];
  const previous = bundle.snapshots[1];
  const delta = latest && previous ? latest.overallScore - previous.overallScore : null;

  const score = latest?.overallScore ?? 0;
  const scoreColor = score >= 75 ? "#16a34a" : score >= 55 ? "#d97706" : "#dc2626";

  const topRecs = bundle.recommendations.slice(0, 10);
  const highImpact = topRecs.filter((r) => r.impact === "high");
  const medImpact = topRecs.filter((r) => r.impact === "medium");

  const aiMentionRate = aiStats.total > 0 ? Math.round((aiStats.mentioned / aiStats.total) * 100) : 0;

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const isThisMonth = (v: string) => new Date(v).getTime() >= monthStart.getTime();
  const contentThisMonth = autopilot.contentQueue.filter((i) => isThisMonth(i.createdAt)).length;
  const publishedThisMonth = autopilot.publishedContent.filter((i) => i.status === "published" && isThisMonth(i.createdAt)).length;
  const citationIssues = autopilot.citationIssues.length;
  const backlinkOpps = autopilot.backlinkQueue.length;

  const reportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const website = bundle.business.website ?? "";
  const address = (bundle.business as { address?: string | null }).address ?? "";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{bundle.business.name} — Visibility Report</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #18181b; background: #fff; }
          .page { max-width: 780px; margin: 0 auto; padding: 48px 40px; }
          @media print {
            @page { margin: 20mm 15mm; size: A4; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
            .page { padding: 0; }
          }
          h1 { font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
          h2 { font-size: 15px; font-weight: 700; margin-bottom: 10px; border-bottom: 2px solid #f4f4f5; padding-bottom: 6px; }
          h3 { font-size: 13px; font-weight: 600; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; padding-bottom: 24px; border-bottom: 3px solid #18181b; }
          .header-meta { font-size: 12px; color: #71717a; line-height: 1.6; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; }
          .score-card { background: #f4f4f5; border-radius: 14px; padding: 20px 24px; margin-bottom: 28px; display: flex; align-items: center; gap: 24px; }
          .score-number { font-size: 52px; font-weight: 800; line-height: 1; }
          .score-label { font-size: 12px; color: #71717a; margin-top: 2px; }
          .score-detail { flex: 1; }
          .delta { font-size: 13px; font-weight: 600; }
          .delta-up { color: #16a34a; }
          .delta-down { color: #dc2626; }
          .section { margin-bottom: 28px; }
          .rec-item { padding: 10px 0; border-bottom: 1px solid #f4f4f5; }
          .rec-item:last-child { border-bottom: none; }
          .rec-title { font-weight: 600; font-size: 13px; margin-bottom: 2px; }
          .rec-detail { font-size: 12px; color: #52525b; line-height: 1.5; }
          .impact-high { color: #dc2626; }
          .impact-medium { color: #d97706; }
          .impact-low { color: #16a34a; }
          .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 28px; }
          .stat-box { background: #f4f4f5; border-radius: 10px; padding: 14px 16px; }
          .stat-value { font-size: 22px; font-weight: 800; }
          .stat-label { font-size: 11px; color: #71717a; margin-top: 2px; }
          .engine-row { display: flex; justify-content: space-between; align-items: center; padding: 7px 0; border-bottom: 1px solid #f4f4f5; font-size: 12px; }
          .footer { margin-top: 48px; padding-top: 20px; border-top: 2px solid #f4f4f5; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #a1a1aa; }
          .print-btn { position: fixed; bottom: 24px; right: 24px; background: #18181b; color: #fff; border: none; border-radius: 99px; padding: 12px 24px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
        `}</style>
      </head>
      <body>
        {/* eslint-disable-next-line @next/next/no-before-interactive-script-props */}
        <script dangerouslySetInnerHTML={{ __html: "document.addEventListener('DOMContentLoaded',function(){document.getElementById('printBtn').addEventListener('click',function(){window.print();});});" }} />
        <button id="printBtn" className="print-btn no-print">Print / Save as PDF</button>
        <div className="page">
          {/* Header */}
          <div className="header">
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "#71717a", marginBottom: 6 }}>Local Visibility Report</p>
              <h1>{bundle.business.name}</h1>
              {address ? <p style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>{address}</p> : null}
              {website ? <p style={{ fontSize: 12, color: "#71717a" }}>{website}</p> : null}
            </div>
            <div className="header-meta" style={{ textAlign: "right" }}>
              <p style={{ fontWeight: 600 }}>{reportDate}</p>
              <p>Plan: {features.label}</p>
              <p>Prepared by GravyBlock</p>
            </div>
          </div>

          {/* Score */}
          <div className="score-card">
            <div>
              <div className="score-number" style={{ color: scoreColor }}>{score}</div>
              <div className="score-label">Visibility Score</div>
            </div>
            <div className="score-detail">
              <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Overall local visibility rating</p>
              {delta !== null ? (
                <p className={`delta ${delta >= 0 ? "delta-up" : "delta-down"}`}>
                  {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} points vs. previous scan
                </p>
              ) : null}
              <p style={{ fontSize: 12, color: "#71717a", marginTop: 6 }}>
                {score >= 75 ? "Strong local presence. Focus on maintaining and expanding reach." :
                  score >= 55 ? "Good foundation. Key gaps identified below to accelerate growth." :
                  "Significant opportunity to improve local visibility. Priority actions identified."}
              </p>
              {latest?.opportunityLevel ? (
                <p style={{ marginTop: 8 }}>
                  <span className="badge" style={{ background: "#fef3c7", color: "#92400e" }}>
                    Opportunity level: {latest.opportunityLevel}
                  </span>
                </p>
              ) : null}
            </div>
          </div>

          {/* Automation stats */}
          <div className="section">
            <h2>This Month&apos;s Automation Activity</h2>
            <div className="stats-grid">
              <div className="stat-box">
                <div className="stat-value">{contentThisMonth}</div>
                <div className="stat-label">Content ideas generated</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{publishedThisMonth}</div>
                <div className="stat-label">Articles published</div>
              </div>
              <div className="stat-box">
                <div className="stat-value" style={{ color: scoreColor }}>{aiMentionRate}%</div>
                <div className="stat-label">AI mention rate ({aiStats.mentioned}/{aiStats.total} checks)</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{citationIssues}</div>
                <div className="stat-label">Citation / listing tasks</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{backlinkOpps}</div>
                <div className="stat-label">Backlink opportunities</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{bundle.snapshots.length}</div>
                <div className="stat-label">Scan history records</div>
              </div>
            </div>
          </div>

          {/* AI visibility by engine */}
          {Object.keys(aiStats.byEngine).length > 0 ? (
            <div className="section">
              <h2>AI Search Visibility by Platform</h2>
              {Object.entries(aiStats.byEngine).map(([engine, data]) => (
                <div className="engine-row" key={engine}>
                  <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{engine}</span>
                  <span>
                    <span style={{ fontWeight: 700 }}>{data.total > 0 ? Math.round((data.mentioned / data.total) * 100) : 0}%</span>
                    <span style={{ color: "#71717a", marginLeft: 6 }}>mention rate ({data.mentioned}/{data.total})</span>
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Priority recommendations */}
          {highImpact.length > 0 ? (
            <div className="section">
              <h2>High-Priority Action Items</h2>
              {highImpact.map((rec) => (
                <div className="rec-item" key={rec.id}>
                  <div className="rec-title">
                    <span className="impact-high">● </span>{rec.title}
                  </div>
                  <div className="rec-detail">{rec.detail}</div>
                </div>
              ))}
            </div>
          ) : null}

          {medImpact.length > 0 ? (
            <div className="section">
              <h2>Medium-Priority Improvements</h2>
              {medImpact.map((rec) => (
                <div className="rec-item" key={rec.id}>
                  <div className="rec-title">
                    <span className="impact-medium">● </span>{rec.title}
                  </div>
                  <div className="rec-detail">{rec.detail}</div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Content opportunities */}
          {bundle.content && bundle.content.length > 0 ? (
            <div className="section">
              <h2>Content Opportunities Identified</h2>
              {bundle.content.slice(0, 6).map((opp: { id: string; title: string; angle?: string | null }) => (
                <div className="rec-item" key={opp.id}>
                  <div className="rec-title">{opp.title}</div>
                  {opp.angle ? <div className="rec-detail">{opp.angle}</div> : null}
                </div>
              ))}
            </div>
          ) : null}

          {/* Footer */}
          <div className="footer">
            <span>Confidential — prepared for {bundle.business.name}</span>
            <span>Powered by GravyBlock · gravyblock.com</span>
          </div>
        </div>
      </body>
    </html>
  );
}
