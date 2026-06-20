#!/usr/bin/env bash
set -euo pipefail

# Stable dev URL for phone testing: https://dev.armancharan.com -> local Next dev.
#
# One-time setup (needs your browser, can't be scripted):
#   cloudflared tunnel login            # pick the armancharan.com zone
#
# Then, with `npx next dev -p 4321` already running:
#   npm run dev:tunnel
#
# For the PUZZLE to work on the tunnel (not just the page), the WebSocket must
# reach a public backend and the worker must allow this origin:
#   1. .env.local -> NEXT_PUBLIC_PUZZLE_WS_URL=wss://arman-puzzle.armancharan.workers.dev/puzzle
#      (then restart `next dev`, since NEXT_PUBLIC_* is inlined at boot)
#   2. add https://dev.armancharan.com to the worker's ALLOWED_ORIGINS:
#        cd worker
#        printf 'https://armancharan.com,https://dev.armancharan.com' | npx wrangler secret put ALLOWED_ORIGINS
#        npm run deploy

TUNNEL="${TUNNEL:-arman-dev}"
HOSTNAME="${TUNNEL_HOSTNAME:-dev.armancharan.com}"
PORT="${PORT:-4321}"

if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
  echo "Not authenticated. Run: cloudflared tunnel login (pick armancharan.com), then re-run." >&2
  exit 1
fi

# Create the named tunnel once (idempotent).
if ! cloudflared tunnel list 2>/dev/null | grep -qw "$TUNNEL"; then
  cloudflared tunnel create "$TUNNEL"
fi

# Point the hostname at the tunnel (idempotent; ignore "record already exists").
cloudflared tunnel route dns "$TUNNEL" "$HOSTNAME" 2>/dev/null || true

echo "Tunnel up: https://$HOSTNAME -> http://localhost:$PORT"
exec cloudflared tunnel run --url "http://localhost:$PORT" "$TUNNEL"
