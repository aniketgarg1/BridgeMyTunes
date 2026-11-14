# TuneBridge

**Share music with anyone, even if they use a different streaming service.**
**Switch music platforms without rebuilding your library.**

Spotify ⇄ Apple Music, built with Next.js 16, MongoDB Atlas and Gemini.

## What works

| Feature | Where |
| --- | --- |
| Universal playlist link (`/p/<slug>`): recipient picks a service, connects it, and the playlist is created in their account | `src/app/p/[slug]`, `src/lib/playlists.ts` |
| Live link: views re-sync from the owner's source playlist every 5 min (the owner can also click **Sync now**) | `syncUniversalPlaylist` |
| Platform switching: playlists + liked/library songs, **Transfer everything** | `src/app/switch` |
| Smart matching: cache → ISRC → metadata scoring → Gemini → you | `src/lib/matching/` |
| Live transfer progress + review screen for uncertain/missing songs, with manual search | `src/components/TransferView.tsx` |
| Telemetry: every transfer emits events to MongoDB, and to Tiger Data if configured | `src/lib/analytics.ts` |

## Run it in 2 minutes (demo mode, no developer accounts)

```bash
docker run -d --name tunebridge-mongo -p 127.0.0.1:27017:27017 mongo:8   # or use an Atlas URI
cp .env.example .env.local    # then set MOCK_MUSIC=1 and MONGODB_URI=mongodb://127.0.0.1:27017
npm install
npm run dev                   # http://127.0.0.1:3000
```

`MOCK_MUSIC=1` swaps in fake Spotify/Apple catalogs with deliberately messy data (remasters, `feat.` naming, live
versions, clean edits, a song that doesn't exist on the other side), so you can demo the whole flow.

## Real accounts

Open the app at **http://127.0.0.1:3000**, not `localhost`: Spotify rejects `localhost` redirect URIs.

**Spotify**: [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → Create app → Web API.
- Redirect URI: `http://127.0.0.1:3000/api/auth/spotify/callback`
- Set `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`.
- Development Mode rules (as of Feb 2026): the app owner needs **Spotify Premium**, and only **5 allowlisted users**
  (Dashboard → User Management) can log in. Spotify only returns tracks for playlists the user **owns or collaborates
  on**, so followed playlists can't be read. To get past 5 users, apply for Extended Quota.

**Apple Music**: requires the Apple Developer Program.
- Certificates, IDs & Profiles → Identifiers → create a **Media ID**, then Keys → create a key with **MusicKit** enabled.
- Set `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY_PATH` (the `.p8`; `keys/` and `*.p8` are gitignored).
- Users connect in the browser via MusicKit JS and need an active Apple Music subscription.
- Public Apple Music playlist links (`music.apple.com/.../playlist/...pl.xxx`) can be imported without logging in.

**Gemini** (optional): `GEMINI_API_KEY`. Without it, uncertain matches go straight to manual review.
**Tiger Data** (optional): `TIGER_DATABASE_URL` creates a `transfer_events` hypertable (match rate, timings, method mix).

## How matching works

1. **Known**: the track already has a destination id, or a confirmed match is cached in `mappings`.
2. **ISRC**: exact recording lookup (Apple batches 25 per call; Spotify uses `isrc:` search).
3. **Metadata**: search, then score title (45%) / artist (30%) / duration (15%) / album (10%), after stripping
   naming noise (`- Remastered 2011`, `(feat. X)`, soundtrack subtitles). Live/acoustic/remix/sped-up and other
   version mismatches, and missing or extra featured artists, are penalised.
4. **Gemini**: anything scoring 0.45–0.85 is batch-adjudicated (8 per request). Gemini picks the same recording or
   none, and lists the differences.
5. **You**: clean ⇄ explicit swaps are never applied silently. They, plus anything still uncertain, wait for review.

`npm test` runs the matcher test suite.

## Data model (MongoDB)

`users` (anonymous sessions) · `connections` (per-platform tokens) · `playlists` (universal links + track snapshot) ·
`transfers` (status, progress, per-track match results) · `mappings` (match cache) · `events` (telemetry).

## Deploying (Vultr)

`npm run build && npm start` on any Node 20+ host. Transfers currently run in-process. To move them to dedicated
workers, call `runTransfer(id)` from a queue consumer instead of `startTransfer`. Set `APP_URL` to your HTTPS domain
and add `<APP_URL>/api/auth/spotify/callback` to the Spotify app.

## Not built yet

Albums/artists transfer, auto-syncing destination playlists when the source changes, cross-platform collaborative
playlists, YouTube Music.
