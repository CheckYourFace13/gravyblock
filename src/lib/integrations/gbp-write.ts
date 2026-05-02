import { getFreshAccessToken, getGoogleConnection, updateGoogleConnectionProperty } from "./google-oauth";

// ── Account discovery ─────────────────────────────────────────────────────────

type GbpAccount = { name: string; accountName: string; type: string };

async function listAccounts(accessToken: string): Promise<GbpAccount[]> {
  const res = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { accounts?: GbpAccount[] };
  return json.accounts ?? [];
}

type GbpLocation = { name: string; title: string; websiteUri?: string; storefrontAddress?: { addressLines?: string[] } };

async function listLocations(accessToken: string, accountId: string): Promise<GbpLocation[]> {
  const res = await fetch(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${accountId}/locations?readMask=name,title,websiteUri,storefrontAddress`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { locations?: GbpLocation[] };
  return json.locations ?? [];
}

export async function discoverGbpLocation(businessId: string): Promise<{
  accountId: string | null;
  locationName: string | null;
  title: string | null;
}> {
  const accessToken = await getFreshAccessToken(businessId);
  if (!accessToken) return { accountId: null, locationName: null, title: null };

  const conn = await getGoogleConnection(businessId);
  if (conn?.gbpAccountId && conn?.gbpLocationName) {
    return { accountId: conn.gbpAccountId, locationName: conn.gbpLocationName, title: null };
  }

  const accounts = await listAccounts(accessToken);
  if (!accounts.length) return { accountId: null, locationName: null, title: null };

  const account = accounts[0];
  const locations = await listLocations(accessToken, account.name);
  if (!locations.length) return { accountId: account.name, locationName: null, title: null };

  const location = locations[0];
  await updateGoogleConnectionProperty(businessId, {
    gbpAccountId: account.name,
    gbpLocationName: location.name,
  });

  return { accountId: account.name, locationName: location.name, title: location.title };
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export type GbpPostInput = {
  summary: string;
  callToActionType?: "LEARN_MORE" | "SIGN_UP" | "BOOK" | "ORDER" | "SHOP" | "CALL";
  callToActionUrl?: string;
};

export async function createGbpPost(businessId: string, post: GbpPostInput): Promise<{ ok: boolean; postName?: string; error?: string }> {
  const accessToken = await getFreshAccessToken(businessId);
  if (!accessToken) return { ok: false, error: "Google not connected" };

  const { locationName } = await discoverGbpLocation(businessId);
  if (!locationName) return { ok: false, error: "No GBP location found for this account" };

  const body: Record<string, unknown> = {
    languageCode: "en",
    summary: post.summary,
    topicType: "STANDARD",
  };

  if (post.callToActionType && post.callToActionUrl) {
    body.callToAction = { actionType: post.callToActionType, url: post.callToActionUrl };
  }

  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/${locationName}/localPosts`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[gbp-write] createPost failed", err);
    return { ok: false, error: "GBP post creation failed" };
  }

  const json = (await res.json()) as { name?: string };
  return { ok: true, postName: json.name };
}

// ── Review replies ────────────────────────────────────────────────────────────

type GbpReview = {
  name: string;
  reviewId: string;
  reviewer: { displayName: string };
  starRating: string;
  comment?: string;
  createTime: string;
  reviewReply?: { comment: string };
};

export async function listPendingReviews(businessId: string): Promise<GbpReview[]> {
  const accessToken = await getFreshAccessToken(businessId);
  if (!accessToken) return [];

  const { locationName } = await discoverGbpLocation(businessId);
  if (!locationName) return [];

  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/${locationName}/reviews?pageSize=20`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );
  if (!res.ok) return [];

  const json = (await res.json()) as { reviews?: GbpReview[] };
  const all = json.reviews ?? [];
  // Return only reviews without a reply yet
  return all.filter((r) => !r.reviewReply);
}

export async function replyToReview(
  businessId: string,
  reviewName: string,
  replyText: string,
): Promise<{ ok: boolean; error?: string }> {
  const accessToken = await getFreshAccessToken(businessId);
  if (!accessToken) return { ok: false, error: "Google not connected" };

  const res = await fetch(`https://mybusiness.googleapis.com/v4/${reviewName}/reply`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ comment: replyText }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[gbp-write] replyToReview failed", err);
    return { ok: false, error: "Review reply failed" };
  }
  return { ok: true };
}

// ── Q&A ───────────────────────────────────────────────────────────────────────

export async function postGbpQuestion(
  businessId: string,
  questionText: string,
): Promise<{ ok: boolean; questionName?: string; error?: string }> {
  const accessToken = await getFreshAccessToken(businessId);
  if (!accessToken) return { ok: false, error: "Google not connected" };

  const { locationName } = await discoverGbpLocation(businessId);
  if (!locationName) return { ok: false, error: "No GBP location found" };

  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/${locationName}/questions`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ text: questionText }),
    },
  );

  if (!res.ok) return { ok: false, error: "Q&A post failed" };
  const json = (await res.json()) as { name?: string };
  return { ok: true, questionName: json.name };
}

// ── Worker helper: auto-post queued GBP content ───────────────────────────────

export async function isGbpConnected(businessId: string): Promise<boolean> {
  const accessToken = await getFreshAccessToken(businessId);
  return Boolean(accessToken);
}
