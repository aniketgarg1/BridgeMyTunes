import "server-only";
import { Pool } from "pg";
import { collections } from "./db";
import { env } from "./env";

/*
 * Transfer telemetry. Always written to MongoDB `events`; also written to Tiger Data (TimescaleDB)
 * when TIGER_DATABASE_URL is set, as a hypertable for the live migration dashboard.
 */

let pool: Pool | null = null;
let ready: Promise<void> | null = null;

function tiger() {
  if (!env.tigerUrl) return null;
  if (!pool) {
    pool = new Pool({ connectionString: env.tigerUrl, max: 3 });
    ready = pool
      .query(
        `CREATE TABLE IF NOT EXISTS transfer_events (
           time timestamptz NOT NULL DEFAULT now(),
           type text NOT NULL,
           transfer_id text,
           source text,
           destination text,
           value double precision,
           props jsonb
         )`,
      )
      .then(() => pool!.query(`SELECT create_hypertable('transfer_events', 'time', if_not_exists => TRUE)`))
      .then(() => undefined)
      .catch((err) => console.warn("[tiger] setup:", err.message));
  }
  return pool;
}

export interface EventProps {
  transferId?: string;
  source?: string;
  destination?: string;
  /** Numeric measurement for time-series charts, e.g. duration in ms or match rate. */
  value?: number;
  [k: string]: unknown;
}

export async function track(type: string, props: EventProps = {}) {
  try {
    const { events } = await collections();
    await events.insertOne({ type, at: new Date(), transferId: props.transferId, props });
  } catch (err) {
    console.warn("[analytics] mongo:", err);
  }
  const p = tiger();
  if (p) {
    try {
      await ready;
      await p.query(
        `INSERT INTO transfer_events (type, transfer_id, source, destination, value, props) VALUES ($1,$2,$3,$4,$5,$6)`,
        [type, props.transferId ?? null, props.source ?? null, props.destination ?? null, props.value ?? null, props],
      );
    } catch (err) {
      console.warn("[analytics] tiger:", (err as Error).message);
    }
  }
}
