export type RequestIdentityFields = {
  cdpAccessToken?: string | null;
  signature?: string | null;
  signatureTimestamp?: string | null;
  txHash?: string | null;
};

/**
 * Reads CDP token / signature / tx hash from JSON or multipart bodies (reused by profile & org PATCH).
 */
export async function parseRequestIdentity(req: Request): Promise<RequestIdentityFields> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!j || typeof j !== "object") return {};
    return {
      cdpAccessToken: typeof j.cdpAccessToken === "string" ? j.cdpAccessToken : undefined,
      signature: typeof j.signature === "string" ? j.signature : undefined,
      signatureTimestamp: typeof j.signatureTimestamp === "string" ? j.signatureTimestamp : undefined,
      txHash: typeof j.txHash === "string" ? j.txHash : undefined,
    };
  }
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    return {
      cdpAccessToken: (form.get("cdpAccessToken") as string)?.trim() || undefined,
      signature: (form.get("signature") as string)?.trim() || undefined,
      signatureTimestamp: (form.get("signatureTimestamp") as string)?.trim() || undefined,
      txHash: (form.get("txHash") as string)?.trim() || undefined,
    };
  }
  return {};
}
