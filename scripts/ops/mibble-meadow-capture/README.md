# Mibble Meadow gameplay capture (read-only)

Mibble Meadow ships only as an Android APK (a Godot 4.7.2 game, ARM-only native libraries). The VPS cannot run an Android emulator (no hardware virtualization), so the footage comes from the game's own project files run in the matching **Godot 4.7.2** desktop engine:

1. The APK (`MibbleMeadow-0.1.23-debug.apk`, SHA-256 verified against the tester page) is only unzipped; `assets/` holds the project (`project.binary`, compiled scripts, scenes, art). Nothing is edited, repacked or deployed.
2. Godot 4.7.2 stable (official build, SHA-512 verified against the official SUMS) runs inside a disposable Docker container: **no network**, 2 GB, 1 CPU, throwaway home (so no save state survives), game files mounted read-only.
3. `play.sh` uses Godot Movie Maker mode (`--write-movie`, 30 fps, 780x1690, software OpenGL), which renders every frame on its own clock, so the footage is smooth however slow the VPS is. Real mouse input (the game emulates touch from the mouse) is fired at exact rendered frame numbers.
4. Double-tap must be two clicks sent together (`click --repeat 2 --delay 40`): the game decides double-tap from the real clock, and frames take longer than that to render.

Run order: build the image (`docker build -t gb-godot-capture .`), then `docker run --rm --network none --memory 2g --cpus 1 --tmpfs /tmp:rw,size=512m -v engine:/engine:ro -v apk:/apk:ro -v out:/out -v play.sh:/p.sh:ro gb-godot-capture /p.sh`.

Result (2026-11-04): level 1 (a 4x4 puzzle) solved with swipe-marks and double-tap placements, ending on the game's own "Meadow Moment" completion card with three stars. Provenance in `footage/capture.json` on the VPS (`/var/lib/gravyblock-marketing/captures/mibblemeadow`).
