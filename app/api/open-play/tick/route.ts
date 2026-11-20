import { timingSafeEqual } from "node:crypto";
import { sendOfferEmails } from "@/lib/send-confirmation";

/**
 * Pinged by open_play_tick() (pg_cron, every minute) when a waitlist offer hasn't been emailed yet.
 * The database calls this URL from the Vault secret open_play_tick_url and sends
 * open_play_tick_secret in x-tick-secret; it must match OPEN_PLAY_TICK_SECRET here.
 */
export async function POST(request: Request) {
  const expected = process.env.OPEN_PLAY_TICK_SECRET;
  const given = request.headers.get("x-tick-secret") ?? "";
  if (!expected || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }

  const origin = process.env.SITE_URL?.replace(/\/+$/, "") || new URL(request.url).origin;
  const result = await sendOfferEmails(origin);
  return Response.json(result, { status: result.error ? 500 : 200 });
}
