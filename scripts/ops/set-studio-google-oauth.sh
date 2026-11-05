#!/usr/bin/env bash
# One-time owner step, run as root on the VPS in YOUR OWN terminal. It prompts for the Studio Google OAuth client id and secret with the
# secret hidden, writes them to the web app's .env (mode 600, never printed, never sent anywhere) and restarts only the web app.
# The Studio Google OAuth client is separate from anything the websites use. Nothing is uploaded by this script.
set -euo pipefail
ENV_FILE="${ENV_FILE:-/home/deploy/gravyblock/.env}"
read -r -p "Studio Google OAuth Client ID: " CLIENT_ID
read -r -s -p "Studio Google OAuth Client Secret (hidden): " CLIENT_SECRET
echo
[[ "$CLIENT_ID" =~ ^[0-9]+-[A-Za-z0-9_]+\.apps\.googleusercontent\.com$ ]] || { echo "Client ID should look like 123456789-abc123.apps.googleusercontent.com"; exit 1; }
[[ "${#CLIENT_SECRET}" -ge 20 ]] || { echo "Client secret looks too short"; exit 1; }
touch "$ENV_FILE"
sed -i '/^MARKETING_GOOGLE_CLIENT_ID=/d;/^MARKETING_GOOGLE_CLIENT_SECRET=/d' "$ENV_FILE"
printf 'MARKETING_GOOGLE_CLIENT_ID=%s\nMARKETING_GOOGLE_CLIENT_SECRET=%s\n' "$CLIENT_ID" "$CLIENT_SECRET" >> "$ENV_FILE"
chmod 600 "$ENV_FILE"
unset CLIENT_SECRET
export PATH="/home/deploy/.nvm/versions/node/v20.20.2/bin:$PATH"
pm2 restart gravyblock >/dev/null
echo "Saved. The Connect with YouTube button on the product page is now active."
