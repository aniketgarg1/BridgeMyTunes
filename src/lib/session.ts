import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { collections } from "./db";
import { env } from "./env";

const COOKIE = "tb_sid";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Returns the current user's id, or null if they have no session yet. */
export async function getUserId(): Promise<ObjectId | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const { users } = await collections();
  const user = await users.findOne({ sessionHash: hash(token) }, { projection: { _id: 1 } });
  return user?._id ?? null;
}

/**
 * Returns the current user's id, creating an anonymous account + session cookie if needed.
 * Accounts are anonymous: identity comes from the music services the user connects.
 * Only call this from Route Handlers (cookies can't be set while rendering a page).
 */
export async function ensureUserId(): Promise<ObjectId> {
  const existing = await getUserId();
  if (existing) return existing;
  const token = randomBytes(32).toString("base64url");
  const { users } = await collections();
  const _id = new ObjectId();
  await users.insertOne({ _id, sessionHash: hash(token), createdAt: new Date() });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.appUrl.startsWith("https://"),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return _id;
}
