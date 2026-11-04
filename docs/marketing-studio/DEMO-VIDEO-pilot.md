# Product demo video pilot (RentalNoodle)

Status: ONE demo exists, `READY_FOR_OWNER_REVIEW`. All other video generation is **frozen** until the owner watches it and explicitly approves it.

## What it is

A 20 to 35 second vertical video built from **real states of the product's public interface**, not from cards:

1. `plates.ts` drives the live site at phone width (GET only, product's own domain, analytics blocked) and records real states: typing into the free calculators (the result changes live), and the real landlord, pricing and tenant pages.
2. `stage.ts` is one HTML page whose look at time *t* is a pure function (`window.__seek`). `render.ts` seeks and screenshots every frame at 30 fps, so motion is smooth and repeatable on any machine. It animates only what a screen-recording tool would: a touch cursor with taps, camera pans, focus highlights with labels, captions, transitions.
3. `audio.ts`: voiceover by Kokoro-82M (Apache-2.0, offline, $0) run in a short-lived child process; music is generated in code (original, no third-party licence). Mix is ducked and loudness-normalised to about -15 LUFS.
4. `rentalnoodle.ts` is the script. Every cursor tap, camera move and highlight is keyed to the word being spoken. Every claim lists the verified Product Truth facts and the page quotes that support it.
5. `qa.ts` (26 checks) fails the video if: the product screen is still for more than 0.8 s, less than 85% of the screen time moves, less than 75% is real product UI, fewer than two interfaces were interacted with live, captions drift from the script, music is inaudible or louder than the voice, a quote is not on its live page, a claim lacks a verified fact, any text makes a timing/savings/superlative/numeric promise, or an email or personal name appears.

## Memory and why it does not run in the worker

Measured peak (kernel cgroup accounting): about 835 MB. The worker's scope is capped at 768 MB, so the pilot is rendered by `scripts/ops/marketing-rn-demo-run.ts` in its own bounded systemd scope (MemoryMax 2G, MemoryHigh 1800M, CPUQuota 100%, nice 19, ionice idle). The worker's limits are untouched. The script waits for the same governor the worker uses (host load, free RAM, no deploy running, no other heavy job) and honours the kill switch. A `render_demo_video` worker job refuses to run when its cgroup is under 1.8 GB.

```
cd /home/deploy/gravyblock
runuser -u gbstudio -- node_modules/.bin/tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-rn-demo-start.ts            # freeze, record verdicts, create the one record
systemd-run --scope --unit=gb-rn-demo -p MemoryMax=2G -p MemoryHigh=1800M -p CPUQuota=100% \
  runuser -u gbstudio -- nice -n 19 ionice -c 3 node_modules/.bin/tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-rn-demo-run.ts
```

`marketing-rn-demo-start.ts --replace` supersedes a demo the owner has NOT approved (never an approved one) and creates a fresh record.

Dry run with no database writes: `scripts/ops/marketing-rn-video-dev.ts <out-dir>`.

## Voiceover install (isolated, not part of the web app)

`/var/lib/gravyblock-marketing/tts` holds `kokoro-js@1.2.1` and the `onnx-community/Kokoro-82M-v1.0-ONNX` q8 model (about 92 MB). Installed as the Studio user with `HOME` and the npm cache pointed inside that folder.

## After the owner decides

- Approve / reject / regenerate-later on the Review page only records a decision. Nothing is published.
- Unfreezing is a separate deliberate step (`unfreezeVideoGeneration`) after approval.
- Games: real gameplay footage must be the primary visual. An icon-and-text video is classified `TEASER_ONLY` and is not a finished marketing video.

## Known limits (be honest about them)

- The logged-in product (maintenance requests, lease signing, tenant records) is not shown: capturing it needs an account, and accounts are not created on production. A demo landlord account is the one-time step that would unlock those scenes.
- Word highlights inside a caption line are timed proportionally from the measured length of each voice line; line starts and ends are exact.
- The voice and music were not auditioned by the assistant. The owner should listen.
