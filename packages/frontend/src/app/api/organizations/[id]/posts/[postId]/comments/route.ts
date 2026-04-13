export const runtime = "nodejs";

import { verifyAminiIdentity } from "@/lib/auth";
import type { OrganizationPostCommentRow } from "@/lib/organizationTypes";
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

export async function GET(
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
  if (!org) return Response.json({ ok: false, message: "Organization not found." }, { status: 404 });
  if (org.status !== "approved") return Response.json({ ok: true, comments: [] as OrganizationPostCommentRow[] });

  const okPost = await ensurePostInOrg(supabaseUrl, headers, orgId, postId);
  if (!okPost) return Response.json({ ok: false, message: "Post not found." }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "50") || 50));

  const res = await fetch(
    `${supabaseUrl}/rest/v1/organization_post_comments?post_id=eq.${encodeURIComponent(postId)}&select=id,post_id,parent_id,author_wallet,body,created_at,updated_at&order=created_at.asc&limit=${limit}`,
    { headers, cache: "no-store" },
  );
  if (!res.ok) {
    const t = await res.text();
    return Response.json({ ok: false, message: "Supabase query failed: " + t }, { status: 502 });
  }
  const comments = (await res.json()) as OrganizationPostCommentRow[];
  return Response.json({ ok: true, comments });
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
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const parentId = typeof body.parentId === "string" ? body.parentId.trim() : null;

  if (!wallet) return Response.json({ ok: false, message: "wallet is required." }, { status: 400 });
  if (text.length === 0 || text.length > 2000) {
    return Response.json({ ok: false, message: "Comment must be 1–2000 characters." }, { status: 400 });
  }
  if (parentId && !UUID_RE.test(parentId)) {
    return Response.json({ ok: false, message: "Invalid parentId." }, { status: 400 });
  }

  const idResult = await verifyAminiIdentity("Comment on Organization Post", wallet, {
    cdpAccessToken: typeof body.cdpAccessToken === "string" ? body.cdpAccessToken : undefined,
    signature: typeof body.signature === "string" ? body.signature : undefined,
    signatureTimestamp: typeof body.signatureTimestamp === "string" ? body.signatureTimestamp : undefined,
    txHash: typeof body.txHash === "string" ? body.txHash : undefined,
  });
  if (!idResult.ok) return Response.json({ ok: false, message: idResult.message }, { status: 401 });

  const row: Record<string, unknown> = {
    post_id: postId,
    author_wallet: wallet,
    body: text,
    updated_at: new Date().toISOString(),
  };
  if (parentId) row.parent_id = parentId;

  const ins = await fetch(`${supabaseUrl}/rest/v1/organization_post_comments`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!ins.ok) {
    const t = await ins.text();
    return Response.json({ ok: false, message: "Failed to comment: " + t }, { status: 502 });
  }
  const inserted = (await ins.json()) as OrganizationPostCommentRow[];
  return Response.json({ ok: true, comment: inserted[0] ?? null });
}

