/**
 * GBP is intentionally not used for public lookup.
 * This module exists for owner-authorized enrichment flows.
 */

export async function fetchGoogleBusinessProfileEnrichment() {
  return {
    available: false,
    note: "Google Business Profile enrichment requires owner authorization and is not configured yet.",
  };
}
