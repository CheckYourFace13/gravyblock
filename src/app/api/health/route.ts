import { getBuildVersion, getDeployedAt, getGitSha } from "@/lib/build-metadata";

export function GET() {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
  const environment = process.env.NODE_ENV ?? "unknown";

  return Response.json({
    ok: true,
    appName: "GravyBlock",
    environment,
    databaseConfigured: hasDatabaseUrl,
    gitSha: getGitSha(),
    buildVersion: getBuildVersion(),
    deployedAt: getDeployedAt(),
  });
}
