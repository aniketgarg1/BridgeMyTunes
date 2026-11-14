import "server-only";
import { readFileSync } from "node:fs";

function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

function req(name: string): string {
  const v = opt(name);
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return v;
}

export const env = {
  /** Public base URL, used for OAuth redirects and share links. Spotify requires 127.0.0.1 (not localhost) in dev. */
  get appUrl() {
    const vercel = opt("VERCEL_PROJECT_PRODUCTION_URL");
    return (opt("APP_URL") ?? (vercel ? `https://${vercel}` : "http://127.0.0.1:3000")).replace(/\/$/, "");
  },
  /** Fake Spotify/Apple catalogs so the whole flow can be demoed without developer accounts. */
  get mock() {
    return opt("MOCK_MUSIC") === "1";
  },
  get mongoUri() {
    return req("MONGODB_URI");
  },
  get mongoDb() {
    return opt("MONGODB_DB") ?? "tunebridge";
  },
  get spotifyClientId() {
    return req("SPOTIFY_CLIENT_ID");
  },
  get spotifyClientSecret() {
    return req("SPOTIFY_CLIENT_SECRET");
  },
  get appleTeamId() {
    return req("APPLE_TEAM_ID");
  },
  get appleKeyId() {
    return req("APPLE_KEY_ID");
  },
  get applePrivateKey() {
    const inline = opt("APPLE_PRIVATE_KEY");
    if (inline) return inline.replace(/\\n/g, "\n");
    return readFileSync(req("APPLE_PRIVATE_KEY_PATH"), "utf8");
  },
  get appleDefaultStorefront() {
    return opt("APPLE_DEFAULT_STOREFRONT") ?? "us";
  },
  get geminiApiKey() {
    return opt("GEMINI_API_KEY");
  },
  get geminiModel() {
    return opt("GEMINI_MODEL") ?? "gemini-3.5-flash";
  },
  /** Tiger Data (TimescaleDB) connection string. Optional: events always go to MongoDB too. */
  get tigerUrl() {
    return opt("TIGER_DATABASE_URL");
  },
};
