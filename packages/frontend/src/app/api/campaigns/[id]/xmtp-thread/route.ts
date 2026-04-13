import { getAddress, isAddress } from "viem";
import { verifyAminiIdentity } from "@/lib/auth";

export const runtime = "nodejs";

const BINDING_ACTION = "Register XMTP Thread Binding";

function badRequest(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

type Body = {
  viewerWallet: string;
  peerWallet: string;
  xmtpEnv: string;
  conversationId: string;
  signature?: string;
  signatureTimestamp?: string;
  cdpAccessToken?: string;
};

/**
 * POST /api/campaigns/[id]/xmtp-thread
 * Upserts optional Supabase binding so a conversation id can be recovered outside localStorage.
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

  const viewerRaw = String(payload.viewerWallet ?? "").trim();
  const peerRaw = String(payload.peerWallet ?? "").trim();
  const xmtpEnv = String(payload.xmtpEnv ?? "").trim();
  const conversationId = String(payload.conversationId ?? "").trim();

  if (!viewerRaw || !peerRaw || !conversationId) {
    return badRequest("viewerWallet, peerWallet, and conversationId are required");
  }
  if (conversationId.length > 512) {
    return badRequest("conversationId too long");
  }
  if (xmtpEnv !== "dev" && xmtpEnv !== "production") {
    return badRequest("xmtpEnv must be dev or production");
  }
  if (!isAddress(viewerRaw) || !isAddress(peerRaw)) {
    return badRequest("Invalid wallet address");
  }

  const viewerWallet = getAddress(viewerRaw).toLowerCase();
  const peerWallet = getAddress(peerRaw).toLowerCase();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl?.trim() || !serviceRole?.trim()) {
    return Response.json({ ok: false, message: "Supabase not configured" }, { status: 503 });
  }

  const headers = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    "content-type": "application/json",
    Prefer: "return=representation,resolution=merge-duplicates",
  };

  const campRes = await fetch(
    `${supabaseUrl}/rest/v1/campaigns?id=eq.${campaignId}&is_fully_created=eq.true&select=id,owner,beneficiary`,
    { headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` }, cache: "no-store" },
  );
  if (!campRes.ok) {
    return Response.json({ ok: false, message: "Campaign lookup failed" }, { status: 502 });
  }
  const rows = (await campRes.json()) as Array<{ id: number; owner: string; beneficiary: string }>;
  const campaign = rows[0];
  if (!campaign) {
    return badRequest("Campaign not found or not published", 404);
  }

  const ownerLc = String(campaign.owner).trim().toLowerCase();
  const benLc = String(campaign.beneficiary).trim().toLowerCase();
  const pairOk =
    (peerWallet === ownerLc && viewerWallet === benLc) ||
    (peerWallet === benLc && viewerWallet === ownerLc);
  if (!pairOk) {
    return badRequest("Peer must be the campaign owner or beneficiary, and viewer the other party", 403);
  }

  const timestamp = String(payload.signatureTimestamp ?? "").trim();
  const idResult = await verifyAminiIdentity(BINDING_ACTION, viewerRaw, {
    cdpAccessToken: payload.cdpAccessToken?.trim() || undefined,
    signature: payload.signature?.trim() || undefined,
    signatureTimestamp: timestamp || undefined,
    txHash: undefined,
  });
  if (!idResult.ok) {
    return badRequest(idResult.message ?? "Identity verification failed", 401);
  }

  const updatedAt = new Date().toISOString();
  const upsertUrl = `${supabaseUrl}/rest/v1/campaign_xmtp_thread_bindings?on_conflict=campaign_id,viewer_wallet,peer_wallet,xmtp_env`;
  const upsertRes = await fetch(upsertUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      campaign_id: campaignId,
      viewer_wallet: viewerWallet,
      peer_wallet: peerWallet,
      xmtp_env: xmtpEnv,
      xmtp_conversation_id: conversationId,
      updated_at: updatedAt,
    }),
  });

  if (!upsertRes.ok) {
    const text = await upsertRes.text();
    return Response.json(
      { ok: false, message: text || `Upsert failed (${upsertRes.status})` },
      { status: 502 },
    );
  }

  return Response.json({ ok: true });
}
