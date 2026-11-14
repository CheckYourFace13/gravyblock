#!/usr/bin/env bash
# Mibble Meadow gameplay capture runner. Runs ON the VPS as root, started in the background by self-deploy.sh on every poll (it is a no-op unless a request is waiting).
#
# Why root: the capture runs the game's own project files inside a disposable Docker container, and the Marketing Studio worker (an unprivileged user) is deliberately NOT in the
# docker group (that would be root-equivalent). The worker only drops a request file; this script does the one fixed thing it may ask for and nothing else:
#   - the only input read from the request is a level count (digits, 1 to 12); no path, command or image name ever comes from it
#   - the container has NO network, 2 GB, 1 CPU, a throwaway home, and the game files mounted read-only
#   - status goes to a root-owned directory the worker can read but not write
# Output (30 fps PNG frames and events.json) lands in captures/mibblemeadow/run and is handed to the worker user, who converts it into a gameplay session.
set -u
ROOT=/var/lib/gravyblock-marketing
REQ="$ROOT/capture-requests/mibblemeadow.request"
STATUS_DIR="$ROOT/capture-status"
STATUS="$STATUS_DIR/mibblemeadow.json"
CAP="$ROOT/captures/mibblemeadow"
OUT="$CAP/run"
REPO="/home/deploy/gravyblock"
DIR="$REPO/scripts/ops/mibble-meadow-capture"
LOCK=/tmp/gravyblock-capture-runner.lock
IMAGE=gb-godot-capture

[ -f "$REQ" ] && [ ! -L "$REQ" ] || exit 0
if [ -f "$LOCK" ] && [ -z "$(find "$LOCK" -mmin +90 2>/dev/null)" ]; then exit 0; fi
touch "$LOCK"
trap 'rm -f "$LOCK"' EXIT

mkdir -p "$STATUS_DIR"
chown root:gbstudio "$STATUS_DIR" && chmod 750 "$STATUS_DIR"

# the request: two lines, id=<digits> and levels=<digits>; anything else is ignored
ID=$(grep -oE '^id=[0-9]{1,20}$' "$REQ" | head -1 | cut -d= -f2)
LEVELS=$(grep -oE '^levels=[0-9]{1,2}$' "$REQ" | head -1 | cut -d= -f2)
rm -f "$REQ"
ID=${ID:-0}
[ -n "${LEVELS:-}" ] && [ "$LEVELS" -ge 1 ] && [ "$LEVELS" -le 12 ] || LEVELS=8

say() { # state, detail
  printf '{"id":%s,"state":"%s","at":"%s","detail":"%s"}\n' "$ID" "$1" "$(date -u +%FT%TZ)" "$2" > "$STATUS.tmp" && chmod 640 "$STATUS.tmp" && chown root:gbstudio "$STATUS.tmp" && mv -f "$STATUS.tmp" "$STATUS"
}

say running "starting"
if [ ! -x "$CAP/engine/Godot_v4.7.2-stable_linux.x86_64" ] || [ ! -d "$CAP/apk/assets" ]; then
  say failed "the Godot engine or the game project is missing from $CAP"
  exit 0
fi
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  say running "building the capture image"
  if ! docker build -q -t "$IMAGE" "$DIR" >/tmp/capture-build.log 2>&1; then
    say failed "the capture image could not be built: $(tail -c 200 /tmp/capture-build.log | tr -d '\n"\\')"
    exit 0
  fi
fi

rm -rf "$OUT"
mkdir -p "$OUT"
say running "playing $LEVELS levels in Godot movie mode"
timeout 3000 docker run --rm --network none --memory 2g --cpus 1 --tmpfs /tmp:rw,size=512m \
  -v "$CAP/engine:/engine:ro" -v "$CAP/apk:/apk:ro" -v "$OUT:/out" -v "$DIR/mm_play.py:/mm_play.py:ro" \
  -e "MM_LEVELS=$LEVELS" "$IMAGE" python3 /mm_play.py >"$OUT/runner.log" 2>&1
CODE=$?
FRAMES=$(ls "$OUT"/mv/f*.png 2>/dev/null | wc -l)
chown -R gbstudio:gbstudio "$OUT"
if [ -f "$OUT/events.json" ] && [ "$FRAMES" -ge 300 ]; then
  say done "$FRAMES frames"
else
  say failed "capture exited $CODE with $FRAMES frames: $(tail -c 200 "$OUT/runner.log" | tr -d '\n"\\')"
fi
exit 0
