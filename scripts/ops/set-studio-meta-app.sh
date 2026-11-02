#!/usr/bin/env bash
# One-time owner step, run as root on the VPS in YOUR OWN terminal. It prompts for the Studio Meta app id and secret with the
# secret hidden, writes them to the web app's .env (mode 600, never printed, never sent anywhere) and restarts only the web app.
# The Studio Meta app is separate from anything the websites use. Nothing is posted by this script.
set -euo pipefail
ENV_FILE="${ENV_FILE:-/home/deploy/gravyblock/.env}"
read -r -p "Studio Meta App ID: " APP_ID
read -r -s -p "Studio Meta App Secret (hidden): " APP_SECRET
echo
[[ "$APP_ID" =~ ^[0-9]{8,20}$ ]] || { echo "App ID should be digits only"; exit 1; }
[[ "${#APP_SECRET}" -ge 16 ]] || { echo "App secret looks too short"; exit 1; }
touch "$ENV_FILE"
sed -i '/^MARKETING_FB_APP_ID=/d;/^MARKETING_FB_APP_SECRET=/d' "$ENV_FILE"
printf 'MARKETING_FB_APP_ID=%s\nMARKETING_FB_APP_SECRET=%s\n' "$APP_ID" "$APP_SECRET" >> "$ENV_FILE"
chmod 600 "$ENV_FILE"
unset APP_SECRET
export PATH="/home/deploy/.nvm/versions/node/v20.20.2/bin:$PATH"
pm2 restart gravyblock >/dev/null
echo "Saved. The Connect with Facebook button on the product page is now active."
