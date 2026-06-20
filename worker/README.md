# arman-puzzle (Cloudflare Worker + Durable Object)

Backs the "shard of sky" puzzle over a WebSocket. The player is shown a fixed crop
of the photo (a shard) and must drag it back to where it belongs by eye. The shard
is sent by **index only** — the index → coordinate mapping lives only inside the
Durable Object, so the answer is never handed to the client as data. The DO also
measures the drag (samples / path / duration) server-side and, on a legitimate
drop, mints an HMAC-signed token the Vercel `/api/subscribe` route trusts.

Where shards come from is configured in `src/puzzle.config.json` (a normalised
`region` box of the photo, plus `count`/`minSpacing`). `scripts/generate-pieces.mjs`
samples the secret target points inside that region, writes `src/targets.json`
(consumed by the Worker) and pre-renders the matching crops into `public/pieces`.
Edit the config per photo, then re-run the script from the repo root:

```bash
node scripts/generate-pieces.mjs
```

## Local development

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars   # PUZZLE_SECRET must match the Next app
npm run dev                      # http://localhost:8799  (ws://localhost:8799/puzzle)
```

In the Next app set (already in `.env.local`):

```
PUZZLE_SECRET=dev-only-insecure-puzzle-secret      # must equal worker/.dev.vars
NEXT_PUBLIC_PUZZLE_WS_URL=ws://localhost:8799/puzzle
```

## Deploy

```bash
cd worker
npx wrangler login
npx wrangler secret put PUZZLE_SECRET     # use a long random value; mirror it on Vercel
npx wrangler secret put ALLOWED_ORIGINS   # e.g. https://armancharan.com  (optional, comma-separated)
npm run deploy
```

Then on Vercel set:

- `PUZZLE_SECRET` — identical to the Worker secret (so solve tokens verify)
- `NEXT_PUBLIC_PUZZLE_WS_URL` — `wss://<your-worker>.workers.dev/puzzle` (or a custom route)

## Protocol

| direction | message |
| --- | --- |
| server → client | `{ type: "ready", index, piece: { radius } }` (index → `/pieces/piece-{index}.webp`) |
| client → server | `{ type: "move", x, y }` (normalised 0..1) |
| server → client | `{ type: "prox", hot }` (single boolean — within tolerance or not; no coordinates) |
| client → server | `{ type: "release", x, y }` |
| server → client | `{ type: "solved", token }` or `{ type: "miss", reason }` |

The only drag feedback is the `hot` boolean (it locks the shard's edge white when
over the target); there's no warmer/colder gradient. Behavioural floors (samples /
path length / duration) are measured server-side from the observed stream, not
reported by the client.
