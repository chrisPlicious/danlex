import "server-only";
import { headers } from "next/headers";

/**
 * The site's public origin for links in emails: SITE_URL when set, otherwise the host of the
 * current request (server actions and route handlers only).
 */
export async function siteOrigin(): Promise<string> {
  const fixed = process.env.SITE_URL?.replace(/\/+$/, "");
  if (fixed) return fixed;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
