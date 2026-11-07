# Video review workflow (default for website and app videos)

Owner directive 2026-11-07. Implemented in `src/lib/marketing-studio/publishing/video-review.ts`, driven by `scripts/ops/marketing-video-review.ts`.

1. **Create and QA** the demo video as usual.
2. **Upload to YouTube as UNLISTED** (never private for normal review). Unlisted can be watched, shared and embedded, and stays out of channel pages, search and recommendations.
3. **Verify the live video** straight from YouTube: expected channel, processed, visibility is exactly unlisted. If not, no email is sent.
4. **Email the owner** (fixed address, through the app's existing Resend owner mail): product, title, YouTube review URL, duration, CTA destination, proposed public title and description, intended use, and the Approve and Request changes actions. The marketing worker holds no mail credentials, so the CLI asks the app (signed request carrying only a publication id) to send it.
5. **Owner decides** on the admin review page (`/admin/marketing-studio/video-review/<publicationId>`, behind the admin sign-in; email links never perform an action by themselves).
   - **Approve:** the SAME video is switched from unlisted to public (same video id and URL, no re-upload), YouTube is asked to confirm public, the approval is recorded and measurement continues.
   - **Request changes:** the video stays unlisted. A corrected replacement is made, the old version is marked superseded (not deleted), and the new review link is emailed.
6. **Nothing is published automatically.**

## Visibility permission

Changing an existing video's visibility is `videos.update`, which Google does not allow with `youtube.upload` or `youtube.readonly`. The connection request now also asks for the `youtube` scope. Uploads and measurement do not need it, so an older connection keeps working. If Approve is pressed on a connection without it, the approval is recorded, the video stays unlisted, and the page says to re-authorize the channel once (or switch the video to Public in YouTube Studio) and approve again.

## Embeds

Each uploaded review stores `video_embed_<productId>`: watch URL, privacy-enhanced embed URL (`youtube-nocookie.com`), iframe code, visibility and a recommended placement. Studio recommends only. It never edits a House Account website; adding an embed is a separate, intentional development change.

## Shared channel

One iScream Studio channel serves several products. A connection stays with its owner product; other products are allowed to post through it (`youtube_channel_share`). No tokens are copied and every use is audited under the owning row.
