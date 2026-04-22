export function GET() {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
  return Response.json({
    ok: true,
    service: "gravyblock",
    env: process.env.NODE_ENV ?? "unknown",
    databaseConfigured: hasDatabaseUrl,
  });
}
