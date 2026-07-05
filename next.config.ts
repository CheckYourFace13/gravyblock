import { execSync } from "node:child_process";
import type { NextConfig } from "next";

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
  env: {
    GIT_SHA: resolveGitSha(),
    DEPLOYED_AT: new Date().toISOString(),
  },
};

export default nextConfig;
