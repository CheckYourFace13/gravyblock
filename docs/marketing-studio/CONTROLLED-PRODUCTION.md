# Controlled production video (after the RentalNoodle approval)

Status as of 2026-11-04. The owner watched the RentalNoodle pilot video and approved it as PERFECT. It is `OWNER_APPROVED_REFERENCE`: the quality bar every later video must meet or exceed.

## The gate

- Video generation is **unfrozen** under a durable gate (`ms_settings` key `video_expansion_gate`, status `approved`): at most **one new video per product**, product demos only, **owner review before anything is used**, one heavy render at a time, the existing VPS governor and the bounded render scope unchanged.
- The **slideshow pipeline is retired** in code (`assertSlideshowAllowed`): `createVideoFromProduct` and `renderVideoJob` always refuse. It cannot be revived from the admin UI or a script.
- A product may only get a demo if it has a spec in `video/demo/specs.ts` (a capture of its real public interface, a script, claims with sources). Anything else, including a game with no real gameplay capture, stays `TEASER_ONLY`.
- New videos stay `READY_FOR_OWNER_REVIEW`. Nothing is approved automatically; approving on the Review page only records a decision.

## Standard (RentalNoodle is the reference)

Real product interaction and UI (or real gameplay for games), meaningful motion with no dead stretch, a 1 to 2 second hook, a natural voiceover, original or licensed music, synchronized captions, purposeful camera and highlights, a clear benefit and a clean call to action, and every claim tied to a verified Product Truth fact and a quote that is on the captured page. 26 automated checks enforce it.

## Commands (VPS, as the Studio user)

```
cd /home/deploy/gravyblock
runuser -u gbstudio -- node_modules/.bin/tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-controlled-production.ts   # approval record + unfreeze + gate (once)
runuser -u gbstudio -- node_modules/.bin/tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-demo-start.ts drinkknird      # create the one record
systemd-run --scope --unit=gb-demo -p MemoryMax=2G -p MemoryHigh=1800M -p CPUQuota=100% \
  runuser -u gbstudio -- nice -n 19 ionice -c 3 node_modules/.bin/tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-demo-run.ts drinkknird
```

`marketing-rn-video-dev.ts <out> <slug>` is a dry run with no database writes.

## DrinkKnird

Built from real states of drinkknird.com at phone width: the Classic Negroni recipe's own **Scale servings** control (1, 2, 4, 8, ingredients change live), the **measurement converter** (cups to ounces, oven C to F, live results), the **Origins of the Negroni** history page (documented origins and disputed claims), and the home page. Third-party ad and analytics hosts are refused during capture, so the video shows the product, not its ads. The voice says "Drink Nerd" because the model cannot read "Knird"; captions and the end card spell DrinkKnird.

## ScribbleZap: TEASER_ONLY

No genuine gameplay capture is available to Studio: the public page has only the icon, store artwork and three still screenshots, store listings say Coming Soon, and the playable web build is a private tester page (`noindex`, "Private tester page"). Studio will not drive a private build or fabricate gameplay.

To unlock a production video, supply ONE of:

1. A **screen recording of the real game** (the Android test build or the web tester), portrait, 30 to 60 seconds, touch visible if possible, starting at level 1 with a cut being drawn, one hazard, a fill and a scored finish. Place it where Studio can read it (for example upload it as a Studio asset).
2. Or the owner's explicit OK to let Studio record the public web tester at `/test/scribblezap/play/` as GET-only, headless, with scripted touch input. Studio would show the capture to the owner first.

## Social publishing preparation

No social account is connected and nothing has been posted. The first live post is the approved RentalNoodle video, to an owned account connected by official OAuth only (Chris authorizes once; no password or token is ever typed into chat). `scripts/ops/marketing-fb-pilot.ts` runs the pre-flight check (account, video, caption, Product Truth, CTA, no email or personal information, no duplicate) before `--publish`.
