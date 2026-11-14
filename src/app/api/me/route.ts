import { NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { houseAvailable } from "@/lib/platforms/house";
import { getUserId } from "@/lib/session";

export async function GET() {
  try {
    const userId = await getUserId();
    const connections = userId
      ? await (await collections()).connections.find({ userId }, { projection: { platform: 1, displayName: 1, storefront: 1 } }).toArray()
      : [];
    return NextResponse.json({
      mock: env.mock,
      spotifyHouse: await houseAvailable(),
      connections: Object.fromEntries(connections.map((c) => [c.platform, { displayName: c.displayName, storefront: c.storefront }])),
    });
  } catch (err) {
    return jsonError(err);
  }
}
