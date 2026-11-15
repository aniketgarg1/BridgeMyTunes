# Deploying BridgeMyTunes on Vercel

About 15 minutes. This is a Next.js app, so Vercel builds it straight from this repo. No extra HTML or config files are needed.

## 1. Database: MongoDB Atlas (free)

1. Sign up at https://www.mongodb.com/cloud/atlas/register
2. Create a cluster and pick **M0 (Free)**.
3. **Database Access** → add a database user. Use a password without `@ : / ?`.
4. **Network Access** → add `0.0.0.0/0`. Vercel's servers don't have fixed IPs.
5. **Connect → Drivers** → copy the connection string and put your password in place of `<db_password>`:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`

## 2. Import the repo in Vercel

1. Go to https://vercel.com/new → **Continue with GitHub**.
2. If the repo isn't listed: **Configure GitHub App** → give Vercel access to `BridgeMyTunes`.
3. **Import** `aniketgarg1/BridgeMyTunes`. Keep the defaults (Next.js, root `./`).
4. Before deploying, open **Environment Variables**.

## 3. Environment variables

| Name | Value | Needed |
| --- | --- | --- |
| `MONGODB_URI` | Connection string from step 1 | Required |
| `MONGODB_DB` | `tunebridge` | Required |
| `MOCK_MUSIC` | `1` = demo mode with sample playlists. Set `0` once Spotify keys are in. | Required |
| `SPOTIFY_CLIENT_ID` | Spotify developer dashboard | For real Spotify |
| `SPOTIFY_CLIENT_SECRET` | Spotify developer dashboard | For real Spotify |
| `APPLE_TEAM_ID` | Apple Developer → Membership | For Apple Music |
| `APPLE_KEY_ID` | ID of the MusicKit key | For Apple Music |
| `APPLE_PRIVATE_KEY` | Whole `.p8` file, including BEGIN/END lines | For Apple Music |
| `YOUTUBE_API_KEY` | Google Cloud → YouTube Data API v3 → API key | For YouTube Music |
| `GOOGLE_CLIENT_ID` | Google Cloud → OAuth client (web) | For YouTube Music sign-in |
| `GOOGLE_CLIENT_SECRET` | Same OAuth client | For YouTube Music sign-in |
| `ADMIN_KEY` | Any long random string; guards the house-account setup | For the Spotify house account |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey | Optional |
| `SPOTIFY_HOUSE_DISABLED` / `SPOTIFY_EMBED_DISABLED` | `1` switches that feature off | Optional |
| `APP_URL` | Only for a custom domain, e.g. `https://bridgemytunes.com`. Otherwise the Vercel address is used automatically. | Optional |

Never commit these values to GitHub.

## 4. Deploy and test

1. Click **Deploy** (1–2 minutes).
2. Open the address Vercel shows, e.g. `https://bridgemytunes.vercel.app`.
3. Demo test: **Connect Spotify** → pick **Road Trip 2026** → **Add to Apple Music**. You should see 11 of 12 songs matched.

## 5. Switch on real Spotify

The Spotify app must be created by an account with **Spotify Premium**. Otherwise the Web API box can't be ticked.

1. Spotify dashboard → your app → **Settings** → add the redirect URI (keep the `127.0.0.1` one for local dev):
   `https://<your-app>.vercel.app/api/auth/spotify/callback`
2. **User Management**: add each tester's Spotify email (max 5 in development mode).
3. Vercel → **Settings → Environment Variables**: add the Spotify values and set `MOCK_MUSIC=0`.
4. **Deployments** → ⋯ → **Redeploy**. Variable changes only apply after a redeploy.

## Troubleshooting

- **Error on every page:** check `MONGODB_URI` and Atlas Network Access. Vercel → Project → **Logs** shows the error.
- **Spotify "INVALID_CLIENT: Invalid redirect URI":** the URI in the Spotify dashboard must match exactly (`https`, no trailing slash).
- **"Couldn't connect Spotify":** that account isn't in User Management, or the app owner's Premium lapsed.
- **Transfer shows as failed:** each transfer gets up to 5 minutes on the free plan. Run it again; earlier matches are cached.
- **Still seeing demo playlists:** `MOCK_MUSIC` is still `1`, or you didn't redeploy.
