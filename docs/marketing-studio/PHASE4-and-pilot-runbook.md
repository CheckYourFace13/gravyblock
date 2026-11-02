# Marketing Studio: real pilot and Phase 4 measurement

Status of the code: connection (official OAuth), controlled pilot, measurement and learning loop are built and tested. Direct posting
to a real Page needs one owner authorization that cannot be automated.

## The one-time owner steps (Facebook, about 10 minutes, never repeated)

1. Create a Studio-only app at developers.facebook.com (type Business). Add the use case that allows managing a Page's posts.
   Keep the app in Development mode: app admins can use the permissions on Pages they manage, no App Review is needed for an owned Page.
2. In the app's Facebook Login settings add this valid OAuth redirect URI:
   `https://gravyblock.com/api/admin/marketing-studio/connect/facebook/callback`
3. On the VPS, in your own terminal as root, run `bash scripts/ops/set-studio-meta-app.sh`. It prompts for the App ID and the App Secret
   (hidden). The secret never goes through chat or the repository.
4. Open `/admin/marketing-studio`, open the product (Drink Knird first), press "Connect with Facebook", type the Page username if you
   manage several Pages, and approve the permissions on facebook.com. That click is the only authorization.

Requested permissions (and nothing else): `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `read_insights`.

## Then the controlled pilot

```
runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-fb-pilot.ts --product drinkknird
```

Default mode prints the pre-publish checklist and the exact caption and posts nothing. `--publish` approves the chosen QA-clean
creative, makes exactly one post, switches live publishing on only for that run and off again, then verifies the post on Facebook,
duplicate prevention, history and metric collection.

## Measurement

- Every Studio link carries privacy-safe tags: utm_source, utm_medium=social, utm_campaign, utm_content, utm_id (short publication id).
- Numbers are labelled CONFIRMED, ESTIMATED or UNKNOWN. Unknown is stored as null, never zero. Visits and conversions are only ever ESTIMATED.
- The worker refreshes metrics for published posts of the last 30 days every 6 hours (read-only calls). `/admin/marketing-studio/insights`
  shows them and the learning report. The learning report compares only CONFIRMED numbers, needs 3 measured posts per option and a 25%
  margin before naming a winner, and always says it shows correlation, not causation. It never publishes anything.

## Instagram, YouTube, TikTok

Direct publishing stays disabled. Use the export bundle (`scripts/ops/marketing-pilot-exports.ts` builds real ones from the pilot media).
Approval needed before direct posting can be switched on: Instagram needs a professional account linked to a Page and the Meta permission
`instagram_business_content_publish` approved by App Review; YouTube needs a Google OAuth app that passed the YouTube API audit (unaudited
projects upload as private); TikTok needs Content Posting API approval (unaudited clients post to private accounts only).
