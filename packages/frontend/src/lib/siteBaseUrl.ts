import { headers } from "next/headers";

/**
 * Canonical site origin for metadata (OG, canonical URLs). Prefer `NEXT_PUBLIC_SITE_URL` in production.
 */
export async function getSiteBaseUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (env) return env;

  const h = await headers();
  const hostRaw = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const host = hostRaw.split(",")[0]?.trim() || "localhost:3000";
  const protoRaw = h.get("x-forwarded-proto");
  const proto =
    protoRaw?.split(",")[0]?.trim() ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}
