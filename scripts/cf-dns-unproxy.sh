#!/usr/bin/env bash
set -euo pipefail

# Flip all PROXIED A records in the armancharan.com zone to DNS-only (grey cloud)
# so Vercel serves the apex / www / wildcard directly. This avoids the
# Cloudflare-in-front-of-Vercel double-proxy (SSL redirect loops, Vercel seeing
# Cloudflare IPs, cert-verification friction).
#
# 1. Create a token: https://dash.cloudflare.com/profile/api-tokens
#    -> "Edit zone DNS" template -> Zone Resources: Specific zone -> armancharan.com
# 2. Run (in YOUR terminal, so the token never lands in a file or chat):
#      export CLOUDFLARE_API_TOKEN=...        # the token from step 1
#      DRY_RUN=1 bash scripts/cf-dns-unproxy.sh   # preview what would change
#      bash scripts/cf-dns-unproxy.sh             # apply
#
# Only A records are touched. The _domainconnect CNAME and everything DNS-only
# (MX, CAA, TXT) are left exactly as-is.

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN (see header)}"
ZONE_NAME="${ZONE_NAME:-armancharan.com}"
API="https://api.cloudflare.com/client/v4"
AUTH=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json")

zone_id=$(curl -s "${AUTH[@]}" "$API/zones?name=$ZONE_NAME" | jq -r '.result[0].id // empty')
[ -n "$zone_id" ] || { echo "zone '$ZONE_NAME' not found or token lacks access" >&2; exit 1; }
echo "zone: $ZONE_NAME ($zone_id)"

mapfile -t recs < <(
  curl -s "${AUTH[@]}" "$API/zones/$zone_id/dns_records?type=A&per_page=100" \
    | jq -c '.result[] | select(.proxied==true) | {id,name,content}'
)

if [ "${#recs[@]}" -eq 0 ]; then
  echo "no proxied A records found — nothing to do."
  exit 0
fi

for rec in "${recs[@]}"; do
  id=$(jq -r '.id'      <<<"$rec")
  name=$(jq -r '.name'  <<<"$rec")
  ip=$(jq -r '.content' <<<"$rec")
  if [ "${DRY_RUN:-0}" = "1" ]; then
    echo "would unproxy: A  $name  ->  $ip"
    continue
  fi
  ok=$(curl -s -X PATCH "${AUTH[@]}" "$API/zones/$zone_id/dns_records/$id" \
         --data '{"proxied":false}' | jq -r '.success')
  echo "unproxied:     A  $name  ->  $ip   (success=$ok)"
done

echo "done.${DRY_RUN:+ (dry run — nothing changed)}"
