# YouTube connection (iScream Studio channel)

Prep only. Nothing is uploaded by the connection, and the upload path stays closed until the owner enables it (see "Gates").

## What is built

- Official Google OAuth 2.0, server side, offline access (`access_type=offline`, `prompt=consent select_account`). Code: `src/lib/marketing-studio/publishing/oauth-youtube.ts`, calls in `youtube-api.ts`.
- Start: `/api/admin/marketing-studio/connect/youtube/start` (operator session only). Callback: `/api/admin/marketing-studio/connect/youtube/callback` (operator session plus signed, expiring state bound to product, expected channel and the browser nonce).
- **Exact production redirect URI:** `https://gravyblock.com/api/admin/marketing-studio/connect/youtube/callback`
- Scopes: `https://www.googleapis.com/auth/youtube.upload` (videos.insert) and `https://www.googleapis.com/auth/youtube.readonly`. The read scope is genuinely required: `youtube.upload` alone cannot call `channels.list?mine=true` (which channel is this token?) or `videos.list` (confirm the upload, read public counts). No analytics, partner, delete or comment scopes.
- Credentials: refresh token and current access token live in the existing AES-256-GCM connection record (`TokenBundle`). The access token is renewed from the refresh token just before each call and the new ciphertext replaces the old. Tokens never appear in pages, logs, audit rows or chat. Env: `MARKETING_GOOGLE_CLIENT_ID`, `MARKETING_GOOGLE_CLIENT_SECRET` (set with `scripts/ops/set-studio-google-oauth.sh`).

## Channel safety

- The operator must name the exact channel (handle, id or name) when starting. After consent, YouTube is asked which channel the token belongs to; it must be exactly one and must match, otherwise nothing is connected. Another channel on the same Google account is never inferred or selected.
- The channel id is stored, shown with name and handle on the connection (health too), and re-checked live before every upload: a token that no longer belongs to that channel uploads nothing.
- Disconnect (Revoke) voids the grant at Google, overwrites the stored token and stops pending uploads.

## Gates before any upload

1. A healthy connection with both scopes.
2. No platform attestation is needed: Google lifted the private-only restriction on unverified API projects on 2 November 2026. The owner still declares made-for-kids and an explicit visibility.
3. YouTube explicitly selected for the product (`youtube_enabled_<productId>`). Videos are never sent to YouTube automatically.
4. The owner's made-for-kids declaration for the product (`youtube_made_for_kids_<productId>`); undeclared means refused.
5. Normal queue rules: owner-approved fresh video, approval, schedule, live publishing on, daily cap, one worker wins the claim.

Record decisions 3 and 4 (configuration only): `marketing-youtube.ts --select scribblezap --made-for-kids yes|no`.

## Upload, verification, measurement

Resumable `videos.insert` (title and description product specific, destination link verified by the queue's link rules, vertical 60 s or less). Retries only before any file bytes move; after that a failure is never retried automatically (a retry could create a second video). After upload `verifyYoutubeVideo` reads the video back from YouTube (exists, expected channel, processed, visibility). Counts (views, likes, comments) are stored as confirmed metrics; anything YouTube withholds stays unknown, never zero.

First candidates, in order: ScribbleZap, then Mibble Meadow.

## Status

```
runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-youtube.ts
```

Read-only. Verifies the connected channel live and shows what is missing. It has no upload command.

## Explicit visibility and the controlled first upload

- Visibility is never defaulted: `youtube_privacy_<productId>` must be `private`, `unlisted` or `public`, or the upload is blocked. Record it with `marketing-youtube.ts --select <slug> --made-for-kids yes|no --privacy private|unlisted|public`.
- One controlled path, same shape as the first Facebook post: `marketing-youtube.ts` (status, verifies the channel live) then `--prepare` (prepares the single upload as approval required and runs the checklist, sends nothing) then `--publish --confirm-first-upload scribblezap` (the only command that uploads: approve, schedule, live publishing on only for the run, verify on YouTube, measure, record the YouTube loop as proven). Mibble Meadow is refused on YouTube until ScribbleZap's YouTube loop is proven (the Facebook proof does not count).
- A private upload is verified with visibility not required to be public; a public upload must read back as public.

## Owner effort

`node scripts/ops/install-google-client.mjs` (run on this PC) reads the client JSON downloaded from Google Cloud, rejects it unless its redirect URI is exactly the registered one, sends id and secret to the VPS over ssh without printing them, restarts the web app, and overwrites and deletes the JSON. Nothing is pasted anywhere.
