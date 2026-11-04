#!/bin/bash
# Plays Mibble Meadow level 1 with real mouse input (emulated touch) in Godot 4.7.2 Movie Maker mode. Every input is tied to the rendered frame count.
export HOME=/tmp/home DISPLAY=:99; mkdir -p $HOME /out/mv
Xvfb :99 -screen 0 780x1690x24 >/tmp/xvfb.log 2>&1 &
sleep 2
timeout 600 /engine/Godot_v4.7.2-stable_linux.x86_64 --path /apk/assets --rendering-driver opengl3 --audio-driver Dummy --resolution 780x1690 --write-movie /out/mv/f.png --fixed-fps 30 --quit-after 800 > /out/godot.log 2>&1 &
GP=$!
frames() { ls /out/mv/f*.png 2>/dev/null | wc -l; }
at() { local n=$1; shift; while [ "$(frames)" -lt "$n" ]; do sleep 0.02; done; "$@"; }
tap() { xdotool mousemove $1 $2 click 1; }
dbl() { xdotool mousemove $1 $2 click --repeat 2 --delay 40 1; }
swipe() { xdotool mousemove $1 $2 mousedown 1; local f=$(frames); local x=$1; while [ $x -lt $3 ]; do x=$(( x + 24 )); f=$(( f + 1 )); at $f xdotool mousemove $x $2; done; at $(( f + 2 )) xdotool mouseup 1; }
at 240 tap 390 945          # Play, level 1
at 305 tap 390 891          # OK on the quick tip
at 335 swipe 308 878 640    # swipe to mark several cells in row 2 (they cannot hold an animal)
at 400 dbl 146 878          # row 2, column 1 (orange)
at 440 dbl 470 718          # row 1, column 3 (green)
at 480 dbl 308 1202         # row 4, column 2 (yellow)
at 520 dbl 631 1041         # row 3, column 4 (blue): the last animal
wait $GP
pkill Xvfb
echo frames $(frames)
