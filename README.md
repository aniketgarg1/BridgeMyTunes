# BridgeMyTunes

**One link. Every app.** Paste a song, album or playlist from Spotify, Apple Music or YouTube Music and get one link.
Whoever opens it picks the app they use, and the music is recreated there. You can also move playlists and liked songs
from one app to another.

Live: **https://bridgemytunes-chi.vercel.app**

## What it does

| Feature | How it works | Code |
| --- | --- | --- |
| **Share anything** | Paste a song, album or playlist link (or a list of song links) and get `/p/<slug>`. A song page shows where it plays on each app; a playlist page has an app switch and one "Add to …" button. | `src/app/share`, `src/app/p/[slug]`, `src/lib/playlists.ts` |
| **No sign-in to read links** | Public YouTube playlists via the YouTube Data API key, Apple Music catalog playlists and albums via the developer token, Spotify songs and albums via the app token, Spotify playlists via the public embed player page. | `src/lib/platforms/` |
| **Spotify without a sign-in** | Spotify's Development Mode only allows 5 tester accounts. For everyone else, a BridgeMyTunes "house" Spotify account makes a public playlist and hands back its link. | `src/lib/platforms/house.ts` |
| **Switch apps** | Move playlists and liked songs from YouTube Music or Apple Music to YouTube Music, Apple Music or Spotify. If you're not signed in to the source, paste any number of public playlist links instead. | `src/app/switch` |
| **Smart matching** | cache → ISRC → metadata scoring → Gemini search → Gemini check → you. Details below. | `src/lib/matching/` |
| **Review** | Live progress, then a review screen for uncertain and missing songs with manual search and "Try again". | `src/components/TransferView.tsx` |

## How matching works

1. **Known**: the song already carries the destination's id, or a confirmed match is cached in MongoDB (`mappings`).
2. **ISRC**: exact recording lookup (Apple: 25 per call).
3. **Metadata**: search the destination, then score title 45%, artist 30%, length 15%, album 10%, after removing naming
   noise (`- Remastered 2011`, `(feat. X)`, soundtrack subtitles). Live, acoustic, remix and sped-up versions, a
   missing or extra featured artist, and fan or lyric re-uploads on YouTube all lose points. 0.85 or more is a match;
   below 0.45 is "not found".
4. **Gemini search** (for songs the search missed, up to 25 per transfer): Gemini suggests up to two cleaner searches,
   such as removing "(Official Video 4K)", using the real artist instead of a label channel, or using the other script
   ("तुम ही हो" → "Tum Hi Ho"). The results are scored by step 3's rules.
5. **Gemini check** (scores 0.45 to 0.85, 8 songs per request): Gemini picks the same recording or none, with a
   confidence, the differences and a reason. 80% or more is accepted, unless it would swap clean and explicit.
6. **You**: anything still uncertain waits on the review screen, with Gemini's pick on top.

Gemini tries `GEMINI_MODEL` first and falls back to `gemini-3.5-flash-lite` when it's busy. Without a key, steps 4
and 5 are skipped. `npm test` runs the matcher, link-parser and page-parser tests.

## What we use

### Code

| | |
| --- | --- |
| Framework | Next.js 16 (App Router, `after()` for background transfers, up to 5 min each), React 19, TypeScript |
| Database | MongoDB Atlas via the `mongodb` driver: `users`, `connections`, `playlists`, `transfers`, `mappings`, `events`, `settings` |
| AI | Google Gemini via `@google/genai` |
| Apple tokens | `jose` signs the ES256 MusicKit developer token |
| Analytics (optional) | Tiger Data / TimescaleDB via `pg` |
| Tests | Vitest |
| Hosting | Vercel |

### Outside services

| Service | Used for | Limits to know |
| --- | --- | --- |
| Spotify Web API | Reading songs and albums (app token), writing playlists (house account or a tester's sign-in) | Development Mode: 5 allowlisted accounts, owner needs Premium |
| Spotify embed player page | Reading public playlists without a sign-in | Unofficial and against Spotify's terms; first 100 songs; private playlists can't be read. Off switch: `SPOTIFY_EMBED_DISABLED=1` |
| Apple Music API + MusicKit JS | Catalog lookups and ISRC search; users sign in in the browser to add to their library | Needs an Apple Developer account; users need an Apple Music subscription |
| YouTube Data API v3 + Google OAuth | Reading public playlists (API key); creating playlists and liking songs (sign-in) | 10,000 quota units a day (a search costs 100); the OAuth app is unverified, so up to 100 users and a warning screen |
| Gemini API | Matching steps 4 and 5 | Model availability changes; the fallback model covers busy periods |
| MongoDB Atlas | All app data | Network Access must allow `0.0.0.0/0` for Vercel |

### Images, logos and fonts

Nothing is stored in this repo. Every picture is loaded from the service it belongs to.

| What | Where it comes from |
| --- | --- |
| Spotify, Apple Music and YouTube Music logos | SVG paths from [Simple Icons](https://simpleicons.org) (CC0), drawn inline in each brand's colour (`src/components/ServiceLogo.tsx`). The logos are trademarks of their owners and are used only to name the services. |
| Album and playlist covers | Loaded live from each service's image servers (`mzstatic.com` for Apple, `i.scdn.co` for Spotify, `ytimg.com` for YouTube) using the URLs their APIs return |
| Home page floating covers | A fixed list of ten albums whose covers are artwork, not photos of people, with Apple Music links and artwork (`src/lib/covers.ts`). Clicking one fills the paste bar. |
| Icons (link, heart, swap arrows) | Small inline SVGs written for this app |
| Fonts | Radio Canada Big (headings) and Radio Canada (text), from Google Fonts via `next/font` (SIL Open Font License) |

### Design

The "Grid" look: white stock, blue-black ink, one ultramarine for actions, one red for the current page, green for
connected and done, square corners. Colours and spacing are tokens in `src/app/tokens.css`. Shared rules are in
`globals.css`, and each area has its own file: `styles/home.css`, `styles/share.css`, `styles/move.css`. Motion uses
only transform and opacity, and all of it switches off when the device asks for reduced motion.

## Run it locally

```bash
docker run -d --name tunebridge-mongo -p 127.0.0.1:27017:27017 mongo:8   # or use an Atlas URI
cp .env.example .env.local    # fill in what you have; MOCK_MUSIC=1 needs no developer accounts
npm install
npm run dev                   # http://127.0.0.1:3000 (not localhost: Spotify rejects localhost redirect URIs)
```

`MOCK_MUSIC=1` uses fake catalogs with deliberately messy data (remasters, `feat.` naming, live versions, clean edits,
a missing song) and a separate `<db>_demo` database, so you can demo the whole flow.

### Accounts and keys

- **Spotify**: [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → Create app → Web API.
  Redirect URIs: `http://127.0.0.1:3000/api/auth/spotify/callback` and `https://<your-app>.vercel.app/api/auth/spotify/callback`.
  Testers go under User Management. To set up the house account: connect Spotify on the site while signed in as the
  house account, then, in the same browser, open `/api/admin/spotify-house?key=<ADMIN_KEY>` once. Don't share that
  address or leave it in browser history on a shared machine.
- **Apple Music**: Apple Developer Program → Identifiers → a Media ID, then Keys → a key with MusicKit. Set
  `APPLE_TEAM_ID`, `APPLE_KEY_ID` and the `.p8` key (`keys/` and `*.p8` are git-ignored).
- **YouTube Music**: Google Cloud → enable YouTube Data API v3 → an API key (`YOUTUBE_API_KEY`), and an OAuth client
  (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) with redirect `<app>/api/auth/youtube/callback` and scope `youtube`.
- **Gemini**: `GEMINI_API_KEY` from Google AI Studio. Optional.

All settings are listed in [.env.example](.env.example). Deploying is in [DEPLOY.md](DEPLOY.md).

## Known limits

- Spotify can't be a **source** on Switch apps without a tester sign-in; pasting public playlist links works for anyone.
- Liked songs from Spotify can only be moved by copying them in the Spotify desktop app (Cmd+A, Cmd+C) and pasting.
- House-account Spotify playlists are public on the BridgeMyTunes account.
- A big YouTube transfer can run out of the daily YouTube quota; "Try again" the next day picks up where it stopped.
