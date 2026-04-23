import packageJson from "../../package.json";

const PKG_VERSION = typeof packageJson.version === "string" ? packageJson.version : "0.1.0";

/** Visible build string: CI/deploy env first, then package version. */
export function getBuildVersion(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_BUILD?.trim();
  if (fromEnv) return fromEnv;
  return PKG_VERSION;
}

export function getGitSha(): string | null {
  const v = process.env.GIT_SHA?.trim();
  return v || null;
}

export function getDeployedAt(): string | null {
  const v = process.env.DEPLOYED_AT?.trim();
  return v || null;
}
