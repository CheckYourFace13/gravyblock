FROM debian:bookworm-slim
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends xvfb xauth xdotool ffmpeg libgl1 libgl1-mesa-dri libglx-mesa0 libegl1 libxcursor1 libxinerama1 libxi6 libxrandr2 libxkbcommon0 libfontconfig1 libdbus-1-3 libasound2 libvulkan1 mesa-vulkan-drivers ca-certificates && rm -rf /var/lib/apt/lists/*
