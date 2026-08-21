/**
 * Protects operator/cron POST routes under /api/autopilot/* in production.
 * In non-production, checks are skipped so local workflows keep working —
 * but only when no secret is actually configured. Previously gated purely
 * on `NODE_ENV !== "production"`, which meant a deployment where NODE_ENV
 * was ever unset, mistyped, or set to something else (a real, plausible
 * misconfiguration, not just a local-dev scenario) would silently disable
 * this check entirely and leave every autopilot route open to anyone. Now:
 * if a secret is configured at all, it's always enforced regardless of
 * NODE_ENV; the skip only applies to a true local-dev setup with no secret.
 */
export function verifyAutopilotOperatorRequest(req: Request): Response | null {
  const secret = process.env.AUTOPILOT_OPERATOR_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      return null;
    }
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
