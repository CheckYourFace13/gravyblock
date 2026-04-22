/** Host-level key for matching returning visitors / same venue across scans. */
export function normalizeWebsiteForLookup(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  try {
    const trimmed = raw.trim();
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProto);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host) return null;
    const path = url.pathname && url.pathname !== "/" ? url.pathname.toLowerCase() : "";
    return `${host}${path}`;
  } catch {
    return null;
  }
}

export function normalizeUrl(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  try {
    const trimmed = raw.trim();
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProto);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeEmail(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const value = raw.trim().toLowerCase();
  return value.includes("@") ? value : null;
}
