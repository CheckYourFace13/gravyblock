import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import { MERGED_URLS } from "./src/lib/seo/merged-urls";

/**
 * Resolve the commit SHA at build time so /api/health can report what's live.
 * Prefer the CI-provided SHA (Vercel), else shell out to git. Never throw —
 * a missing SHA must not break the build on the VPS self-deploy.
 */
function resolveGitSha(): string {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/privacy-policy", destination: "/privacy", permanent: true },
      // pages merged into fuller pages answer with a 301 (see src/lib/seo/merged-urls.ts)
      ...MERGED_URLS.map((m) => ({ source: m.source, destination: m.destination, statusCode: 301 as const })),
    ];
  },
  env: {
    GIT_SHA: resolveGitSha(),
    DEPLOYED_AT: new Date().toISOString(),
  },
};

export default nextConfig;
