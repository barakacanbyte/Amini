/**
 * IPFS HTTP gateway helpers (Filebase and compatible hosts).
 * @see https://docs.filebase.com/ipfs-concepts/what-is-an-ipfs-gateway
 */

/**
 * Base URL for the IPFS gateway (stored DB values are usually bare CIDs).
 * Prefer `NEXT_PUBLIC_*` so the same value is available during SSR and in the browser bundle;
 * `FILEBASE_IPFS_GATEWAY` is still supported for server-only setups.
 */
export function resolveIpfsGatewayBase(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_FILEBASE_IPFS_GATEWAY?.trim() ||
    process.env.FILEBASE_IPFS_GATEWAY?.trim() ||
    "";
  return (fromEnv || "https://ipfs.filebase.io/ipfs").replace(/\/+$/, "");
}

/**
 * Browser URL for a CID after upload.
 */
export function buildIpfsGatewayUrl(cid: string): string {
  const rawCid = cid.trim().replace(/^\/+/, "");
  if (!rawCid) throw new Error("CID is required for gateway URL.");
  const base = resolveIpfsGatewayBase();
  if (/\/ipfs$/i.test(base)) {
    return `${base}/${rawCid}`;
  }
  return `${base}/ipfs/${rawCid}`;
}

/**
 * Some stored rows used `https://ipfs.filebase.io/{CID}` instead of `/ipfs/{CID}`; the gateway
 * expects the `/ipfs/` path segment for retrieval.
 */
export function normalizeFilebaseGatewayImageUrl(url: string | null | undefined): string {
  if (url == null || typeof url !== "string") return "";
  const u = url.trim();
  if (!u) return "";
  try {
    const parsed = new URL(u);
    const path = parsed.pathname.replace(/^\//, "");
    const firstSeg = path.split("/")[0] ?? "";
    const looksLikeCid =
      firstSeg.startsWith("Qm") || firstSeg.startsWith("bafy") || firstSeg.startsWith("bafk");
    /* Missing /ipfs/ before CID — common mistake for both public and dedicated gateways. */
    if (
      looksLikeCid &&
      path.length > 0 &&
      !parsed.pathname.startsWith("/ipfs/") &&
      (parsed.hostname === "ipfs.filebase.io" || parsed.hostname.endsWith(".myfilebase.com"))
    ) {
      return `${parsed.origin}/ipfs/${firstSeg}`;
    }
  } catch {
    /* ignore invalid URLs */
  }
  return u;
}

/** For DB `avatar_url` / `logo_url` fields: null stays null; bad Filebase paths get fixed. */
export function normalizeOptionalGatewayImageUrl(url: string | null | undefined): string | null {
  if (url == null || typeof url !== "string") return null;
  const t = url.trim();
  if (!t) return null;
  const n = normalizeFilebaseGatewayImageUrl(t);
  return n || t;
}

/**
 * What we persist in `profiles.avatar_url`: preferably bare CID (`Qm…`, `bafy…`).
 * Legacy rows may still hold a full `https://…/ipfs/{CID}` URL — those still work.
 */
export function toStoredIpfsRefForDb(value: string | null | undefined): string | null {
  if (value == null || typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) return t;
  try {
    const u = new URL(t);
    const m = u.pathname.match(/\/ipfs\/([^/?#]+)/);
    if (m?.[1]) return m[1];
  } catch {
    /* ignore */
  }
  return t;
}

/**
 * Value from DB → absolute URL for browsers and `next/image`.
 * - Bare CID / `ipfs://` → `NEXT_PUBLIC_FILEBASE_IPFS_GATEWAY` / `FILEBASE_IPFS_GATEWAY` + `/ipfs/{CID}`
 * - Full http(s) URL → path-normalized via `normalizeOptionalGatewayImageUrl`
 */
export function resolveProfileAvatarUrl(stored: string | null | undefined): string | null {
  if (stored == null || typeof stored !== "string") return null;
  const t = stored.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) {
    return normalizeOptionalGatewayImageUrl(t);
  }
  if (t.toLowerCase().startsWith("ipfs://")) {
    const rest = t.slice(7).replace(/^\/+/, "");
    const cid = rest.split("/")[0];
    if (!cid) return null;
    try {
      return buildIpfsGatewayUrl(cid);
    } catch {
      return null;
    }
  }
  try {
    return buildIpfsGatewayUrl(t);
  } catch {
    return null;
  }
}
