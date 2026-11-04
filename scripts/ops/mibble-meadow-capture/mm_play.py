#!/usr/bin/env python3
"""Plays several real Mibble Meadow levels in Godot 4.7.2 Movie Maker mode (30 fps, 780x1690), with real mouse input tied to the rendered frame count.

Read-only toward the game: the project files are mounted read-only, the home directory is disposable, there is no network. For every level the
board is READ from the rendered frame (grid cells and region colours), solved with the game's own published rules (one per row, column and meadow,
no two touching even at the corners), then played with real taps (mark), a swipe (mark several) and double-taps (place), exactly as a player would.
Events are written to /out/events.json so the footage can be cut by what really happened.
"""
import json, os, subprocess, sys, time
from itertools import permutations
from PIL import Image

MV = "/out/mv"
LEVELS = int(os.environ.get("MM_LEVELS", "6"))
os.makedirs(MV, exist_ok=True)
env = dict(os.environ, HOME="/tmp/home", DISPLAY=":99")
os.makedirs("/tmp/home", exist_ok=True)
xvfb = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "780x1690x24"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)
godot = subprocess.Popen(["/engine/Godot_v4.7.2-stable_linux.x86_64", "--path", "/apk/assets", "--rendering-driver", "opengl3", "--audio-driver", "Dummy", "--resolution", "780x1690", "--write-movie", MV + "/f.png", "--fixed-fps", "30", "--quit-after", "9000"], env=env, stdout=open("/out/godot.log", "w"), stderr=subprocess.STDOUT)
events = []

def frames():
    return sum(1 for f in os.listdir(MV) if f.endswith(".png"))

def until(n):
    while frames() < n:
        if godot.poll() is not None:
            raise SystemExit("godot exited early")
        time.sleep(0.02)

def log(kind, **kw):
    events.append(dict(frame=frames(), kind=kind, **kw))
    print(frames(), kind, kw, flush=True)

def x(*a):
    subprocess.run(["xdotool", *map(str, a)], env=env, check=False)

def click(px, py):
    x("mousemove", px, py, "click", "1")

def dbl(px, py):
    # two clicks sent together: the game decides double-tap from the real clock, and a rendered frame takes far longer than the tap window
    x("mousemove", px, py, "click", "--repeat", "2", "--delay", "40", "1")

def swipe(pts):
    x("mousemove", pts[0][0], pts[0][1], "mousedown", "1")
    for px, py in pts[1:]:
        until(frames() + 1)
        x("mousemove", px, py)
    until(frames() + 2)
    x("mouseup", "1")

def shot():
    # the newest fully written frame (the last one may still be being written)
    until(4)
    return Image.open(f"{MV}/f{frames() - 3:08d}.png").convert("RGB")

def wait(n):
    until(frames() + n)

BG = (255, 251, 245)

def colored(p):
    return sum(abs(a - b) for a, b in zip(p, BG)) > 60 and not (p[0] > 235 and p[1] > 235 and p[2] > 225)

def runs(vals, gap=2):
    out, s, p = [], None, None
    for v in vals:
        if s is None:
            s = p = v
        elif v - p <= gap:
            p = v
        else:
            out.append((s, p)); s = p = v
    if s is not None:
        out.append((s, p))
    return out

def read_board(img):
    px = img.load()
    y0, y1 = 560, 1500
    cols = [c for c in range(30, 750) if sum(colored(px[c, y]) for y in range(y0, y1, 8)) >= 0.3 * ((y1 - y0) // 8)]
    rows = [r for r in range(y0, y1) if sum(colored(px[c, r]) for c in range(40, 740, 8)) >= 0.3 * (700 // 8)]
    cr = [r for r in runs(cols) if r[1] - r[0] > 20]
    rr = [r for r in runs(rows) if r[1] - r[0] > 20]
    if len(cr) != len(rr) or len(cr) < 3:
        return None
    n = len(cr)
    pal, grid = [], []
    for (ya, yb) in rr:
        row = []
        for (xa, xb) in cr:
            p = px[xa + (xb - xa) * 0.2, ya + (yb - ya) * 0.2]
            k = next((i for i, v in enumerate(pal) if sum(abs(a - b) for a, b in zip(p, v)) < 50), None)
            if k is None:
                pal.append(p); k = len(pal) - 1
            row.append(k)
        grid.append(row)
    centers = [[((xa + xb) // 2, (ya + yb) // 2) for (xa, xb) in cr] for (ya, yb) in rr]
    return n, grid, centers

def solve(n, grid):
    sols = []
    for perm in permutations(range(n)):
        if len({grid[r][perm[r]] for r in range(n)}) != n:
            continue
        if any(abs(perm[r] - perm[r + 1]) <= 1 for r in range(n - 1)):
            continue
        sols.append(perm)
    return sols

def dim_level(img):
    # the completion card dims the whole screen: average brightness of a strip near the top
    px = img.load()
    return sum(sum(px[c, 40]) for c in range(20, 760, 40)) / 19

def green_button(img):
    px = img.load()
    for y in range(900, 1400, 6):
        run = [c for c in range(100, 700, 4) if px[c, y][1] > px[c, y][0] + 40 and px[c, y][1] > px[c, y][2] + 20]
        if len(run) > 90:
            return (run[0] + run[-1]) // 2, y
    return None

try:
    until(235); log("home")
    click(390, 945); log("play")
    wait(55)
    for lvl in range(1, LEVELS + 1):
        img = shot()
        if img.getpixel((390, 891))[0] > 230 and img.getpixel((390, 891))[2] < 120:  # an orange OK button: a tip dialog is up
            click(390, 891); log("tip_dismissed", level=lvl); wait(45); img = shot()
        board = read_board(img)
        if not board:
            log("board_unreadable", level=lvl); break
        n, grid, centers = board
        sols = solve(n, grid)
        log("level_loaded", level=lvl, size=n, regions=len({v for r in grid for v in r}), solutions=len(sols))
        if len(sols) < 1:
            break
        sol = sols[0]
        cells = {(r, sol[r]) for r in range(n)}
        free = [(r, c) for r in range(n) for c in range(n) if (r, c) not in cells]
        # a couple of single taps (mark) on cells that cannot hold an animal, then a swipe (mark several) along one row, then the placements
        for (r, c) in free[: 2 if lvl > 1 else 0]:
            click(*centers[r][c]); wait(6)
        log("marked_by_tap", level=lvl)
        mark_row = next((r for r in range(n) if all((r, c) not in cells for c in range(n)) or True), 0)
        row_free = [c for c in range(n) if (mark_row, c) not in cells]
        if len(row_free) >= 3 and row_free == list(range(row_free[0], row_free[0] + len(row_free))):
            a, b = centers[mark_row][row_free[0]], centers[mark_row][row_free[-1]]
            steps = 6
            swipe([(a[0] + (b[0] - a[0]) * k // steps, a[1] + (b[1] - a[1]) * k // steps) for k in range(steps + 1)])
            log("marked_by_swipe", level=lvl)
        wait(8)
        for r in range(n):
            dbl(*centers[r][sol[r]]); log("placed", level=lvl, row=r, col=sol[r]); wait(14)
        base = dim_level(shot())
        done = False
        for _ in range(180):
            wait(1)
            if dim_level(shot()) < base - 25:
                done = True; break
        log("level_complete" if done else "level_not_completed", level=lvl)
        if not done:
            break
        wait(70)
        g = green_button(shot())
        if lvl < LEVELS:
            click(*(g or (390, 1080))); log("next_level", level=lvl); wait(50)
    # the rest of the game: back to home, the Animals and Levels tabs, then the Daily Meadow
    wait(20)
    click(109, 125); log("back_home"); wait(60)
    click(656, 1583); log("animals_tab"); wait(75)
    click(390, 1583); log("levels_tab"); wait(75)
    click(124, 1583); log("home_tab"); wait(45)
    click(390, 1062); log("daily_meadow"); wait(70)
    img = shot()
    if img.getpixel((390, 891))[0] > 230 and img.getpixel((390, 891))[2] < 120:
        click(390, 891); log("tip_dismissed", level="daily"); wait(45); img = shot()
    board = read_board(img)
    if board:
        n, grid, centers = board
        sols = solve(n, grid)
        log("daily_loaded", size=n, solutions=len(sols))
        if sols:
            for r in range(n):
                dbl(*centers[r][sols[0][r]]); log("placed", level="daily", row=r, col=sols[0][r]); wait(14)
            wait(120); log("daily_end")
finally:
    json.dump(events, open("/out/events.json", "w"), indent=1)
    godot.terminate()
    time.sleep(3)
    xvfb.terminate()
