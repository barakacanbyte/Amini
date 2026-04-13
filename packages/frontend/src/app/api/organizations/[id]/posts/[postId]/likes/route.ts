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

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });

  const wallet = typeof body.wallet === "string" ? body.wallet.trim().toLowerCase() : "";
  if (!wallet) return Response.json({ ok: false, message: "wallet is required." }, { status: 400 });

  const idResult = await verifyAminiIdentity("Like Organization Post", wallet, {
    cdpAccessToken: typeof body.cdpAccessToken === "string" ? body.cdpAccessToken : undefined,
    signature: typeof body.signature === "string" ? body.signature : undefined,
    signatureTimestamp: typeof body.signatureTimestamp === "string" ? body.signatureTimestamp : undefined,
    txHash: typeof body.txHash === "string" ? body.txHash : undefined,
  });
  if (!idResult.ok) return Response.json({ ok: false, message: idResult.message }, { status: 401 });

  const ins = await fetch(`${supabaseUrl}/rest/v1/organization_post_likes`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates",
    },
    body: JSON.stringify({ post_id: postId, wallet }),
  });
  if (!ins.ok) {
    const t = await ins.text();
    return Response.json({ ok: false, message: "Failed to like: " + t }, { status: 502 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(
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

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });

  const wallet = typeof body.wallet === "string" ? body.wallet.trim().toLowerCase() : "";
  if (!wallet) return Response.json({ ok: false, message: "wallet is required." }, { status: 400 });

  const idResult = await verifyAminiIdentity("Unlike Organization Post", wallet, {
    cdpAccessToken: typeof body.cdpAccessToken === "string" ? body.cdpAccessToken : undefined,
    signature: typeof body.signature === "string" ? body.signature : undefined,
    signatureTimestamp: typeof body.signatureTimestamp === "string" ? body.signatureTimestamp : undefined,
    txHash: typeof body.txHash === "string" ? body.txHash : undefined,
  });
  if (!idResult.ok) return Response.json({ ok: false, message: idResult.message }, { status: 401 });

  const del = await fetch(
    `${supabaseUrl}/rest/v1/organization_post_likes?post_id=eq.${encodeURIComponent(postId)}&wallet=eq.${encodeURIComponent(wallet)}`,
    { method: "DELETE", headers },
  );
  if (!del.ok) {
    const t = await del.text();
    return Response.json({ ok: false, message: "Failed to unlike: " + t }, { status: 502 });
  }
  return Response.json({ ok: true });
}

