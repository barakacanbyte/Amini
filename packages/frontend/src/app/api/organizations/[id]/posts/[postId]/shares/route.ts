export const runtime = "nodejs";

import { verifyAminiIdentity } from "@/lib/auth";
import { getSupabaseServiceConfig, supabaseServiceHeaders } from "@/lib/supabaseService";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getOrgStatus(
  supabaseUrl: string,
  headers: Record<string, string>,
  orgId: string,
): Promise<{ wallet: string; status: string } | null> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/organizations?id=eq.${encodeURIComponent(orgId)}&select=wallet,status&limit=1`,
    { headers, cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ wallet: string; status: string }>;
  return rows[0] ?? null;
}

async function ensurePostInOrg(
  supabaseUrl: string,
  headers: Record<string, string>,
  orgId: string,
  postId: string,
): Promise<boolean> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/organization_posts?id=eq.${encodeURIComponent(postId)}&organization_id=eq.${encodeURIComponent(orgId)}&select=id&limit=1`,
    { headers, cache: "no-store" },
  );
  if (!res.ok) return false;
  const rows = (await res.json()) as Array<{ id: string }>;
  return Boolean(rows[0]?.id);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; postId: string }> },
) {
  const { id: orgId, postId } = await params;
  if (!UUID_RE.test(orgId) || !UUID_RE.test(postId)) {
    return Response.json({ ok: false, message: "Invalid id." }, { status: 400 });
  }

  const cfg = getSupabaseServiceConfig();
  if (!cfg) return Response.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  const { supabaseUrl, serviceRole } = cfg;
  const headers = supabaseServiceHeaders(serviceRole);

  const org = await getOrgStatus(supabaseUrl, headers, orgId);
  if (!org || org.status !== "approved") {
    return Response.json({ ok: false, message: "Organization not found or not approved." }, { status: 403 });
  }
  const okPost = await ensurePostInOrg(supabaseUrl, headers, orgId, postId);
  if (!okPost) return Response.json({ ok: false, message: "Post not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const wallet = typeof body.wallet === "string" ? body.wallet.trim().toLowerCase() : "";

  if (wallet) {
    const idResult = await verifyAminiIdentity("Share Organization Post", wallet, {
      cdpAccessToken: typeof body.cdpAccessToken === "string" ? body.cdpAccessToken : undefined,
      signature: typeof body.signature === "string" ? body.signature : undefined,
      signatureTimestamp: typeof body.signatureTimestamp === "string" ? body.signatureTimestamp : undefined,
      txHash: typeof body.txHash === "string" ? body.txHash : undefined,
    });
    if (!idResult.ok) return Response.json({ ok: false, message: idResult.message }, { status: 401 });
  }

  // Dedupe per-wallet shares: if a wallet is provided and already shared, do not count again.
  if (wallet) {
    const existingRes = await fetch(
      `${supabaseUrl}/rest/v1/organization_post_shares?post_id=eq.${encodeURIComponent(postId)}&wallet=eq.${encodeURIComponent(wallet)}&select=id&limit=1`,
      { headers, cache: "no-store" },
    );
    if (existingRes.ok) {
      const rows = (await existingRes.json()) as Array<{ id: string }>;
      if (rows[0]?.id) return Response.json({ ok: true, counted: false });
    }
  }

  const ins = await fetch(`${supabaseUrl}/rest/v1/organization_post_shares`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ post_id: postId, wallet: wallet || null }),
  });
  if (!ins.ok) {
    const t = await ins.text();
    // If uniqueness is enforced for (post_id, wallet), treat conflicts as already-counted.
    if (
      wallet &&
      (t.toLowerCase().includes("duplicate key") || t.includes("uniq_org_post_shares_post_wallet"))
    ) {
      return Response.json({ ok: true, counted: false });
    }
    return Response.json({ ok: false, message: "Failed to record share: " + t }, { status: 502 });
  }
  return Response.json({ ok: true, counted: true });
}

