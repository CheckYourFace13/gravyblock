/**
 * Protects operator/cron POST routes under /api/autopilot/* in production.
 * In non-production, checks are skipped so local workflows keep working.
 */
export function verifyAutopilotOperatorRequest(req: Request): Response | null {
  if (process.env.NODE_ENV !== "production") {
    return null;
  }
  const secret = process.env.AUTOPILOT_OPERATOR_SECRET?.trim();
  if (!secret) {
    return Response.json(
      { error: "AUTOPILOT_OPERATOR_SECRET must be set in production for autopilot POST routes." },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const headerToken = req.headers.get("x-gravyblock-automation-secret")?.trim() ?? "";
  const token = bearer || headerToken;
  if (!token || token !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
