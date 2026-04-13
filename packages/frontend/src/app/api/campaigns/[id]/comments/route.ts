import { verifyAminiIdentity } from "@/lib/auth";

export const runtime = "nodejs";

const COMMENT_ACTION = "Post Campaign Comment";
const MAX_LEN = 2000;

function badRequest(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

type Body = {
  authorWallet: string;
  body: string;
  /** Reply to a top-level comment only (parent must have no parent). */
  parentId?: number | null;
  signature?: string;
  signatureTimestamp?: string;
  cdpAccessToken?: string;
};

/**
 * POST /api/campaigns/[id]/comments
 * Wallet-verified comment on a published campaign (same auth pattern as impact posts).
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await context.params;
  const campaignId = Number(idParam);
  if (!Number.isFinite(campaignId) || String(campaignId) !== idParam.trim()) {
    return badRequest("Invalid campaign id");
  }

  let payload: Body;
  try {
    payload = (await req.json()) as Body;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const authorWallet = String(payload.authorWallet ?? "").trim();
  const body = String(payload.body ?? "").trim();
  if (!authorWallet || !body) {
    return badRequest("authorWallet and body are required");
  }
  if (body.length > MAX_LEN) {
    return badRequest(`body must be at most ${MAX_LEN} characters`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl?.trim() || !serviceRole?.trim()) {
    return Response.json({ ok: false, message: "Supabase not configured" }, { status: 503 });
  }

  const headers = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    "content-type": "application/json",
    Prefer: "return=representation",
  };

  const campRes = await fetch(
    `${supabaseUrl}/rest/v1/campaigns?id=eq.${campaignId}&is_fully_created=eq.true&select=id`,
    { headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` }, cache: "no-store" },
  );
  if (!campRes.ok) {
    return Response.json({ ok: false, message: "Campaign lookup failed" }, { status: 502 });
  }
  const rows = (await campRes.json()) as unknown[];
  if (!Array.isArray(rows) || rows.length === 0) {
    return badRequest("Campaign not found or not published", 404);
  }

  const timestamp = String(payload.signatureTimestamp ?? "").trim();
  const idResult = await verifyAminiIdentity(COMMENT_ACTION, authorWallet, {
    cdpAccessToken: payload.cdpAccessToken?.trim() || undefined,
    signature: payload.signature?.trim() || undefined,
    signatureTimestamp: timestamp || undefined,
    txHash: undefined,
  });
  if (!idResult.ok) {
    return badRequest(idResult.message ?? "Identity verification failed", 401);
  }

  let parentId: number | null = null;
  const rawParent = payload.parentId;
  if (rawParent !== undefined && rawParent !== null) {
    const pid = Number(rawParent);
    if (!Number.isFinite(pid) || pid <= 0 || String(pid) !== String(rawParent).trim()) {
      return badRequest("Invalid parentId");
    }
    const parentRes = await fetch(
      `${supabaseUrl}/rest/v1/campaign_comments?id=eq.${pid}&campaign_id=eq.${campaignId}&select=id,parent_id`,
      { headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` }, cache: "no-store" },
    );
    if (!parentRes.ok) {
      return Response.json({ ok: false, message: "Parent comment lookup failed" }, { status: 502 });
    }
    const parents = (await parentRes.json()) as Array<{ id: number; parent_id: number | null }>;
    const parentRow = parents[0];
    if (!parentRow) {
      return badRequest("Parent comment not found", 404);
    }
    if (parentRow.parent_id !== null) {
      return badRequest("Replies can only be to top-level comments", 400);
    }
    parentId = pid;
  }

  const insertBody: Record<string, unknown> = {
    campaign_id: campaignId,
    author_wallet: authorWallet.toLowerCase(),
    body,
  };
  if (parentId !== null) {
    insertBody.parent_id = parentId;
  }

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/campaign_comments`, {
    method: "POST",
    headers,
    body: JSON.stringify(insertBody),
  });

  if (!insertRes.ok) {
    const text = await insertRes.text();
    return Response.json(
      { ok: false, message: text || `Insert failed (${insertRes.status})` },
      { status: 502 },
    );
  }

  const inserted = (await insertRes.json()) as Array<{
    id: number;
    parent_id: number | null;
    author_wallet: string;
    body: string;
    created_at: string;
  }>;
  const row = inserted[0];
  if (!row) {
    return Response.json({ ok: false, message: "No row returned" }, { status: 502 });
  }

  return Response.json({
    ok: true,
    comment: {
      id: row.id,
      parent_id: row.parent_id ?? null,
      author_wallet: row.author_wallet,
      body: row.body,
      created_at: row.created_at,
    },
  });
}
