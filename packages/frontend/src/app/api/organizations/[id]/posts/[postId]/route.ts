export const runtime = "nodejs";

import { verifyAminiIdentity } from "@/lib/auth";
import { getSupabaseServiceConfig, supabaseServiceHeaders } from "@/lib/supabaseService";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; postId: string }> },
) {
  const { id: orgId, postId } = await params;
  if (!UUID_RE.test(orgId) || !UUID_RE.test(postId)) {
    return Response.json({ ok: false, message: "Invalid id." }, { status: 400 });
  }

  const cfg = getSupabaseServiceConfig();
  if (!cfg) {
    return Response.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }

  const { supabaseUrl, serviceRole } = cfg;
  const headers = supabaseServiceHeaders(serviceRole);

  const postRes = await fetch(
    `${supabaseUrl}/rest/v1/organization_posts?id=eq.${encodeURIComponent(postId)}&organization_id=eq.${encodeURIComponent(orgId)}&select=id,organization_id,author_wallet&limit=1`,
    { headers, cache: "no-store" },
  );
  if (!postRes.ok) {
    const text = await postRes.text();
    return Response.json({ ok: false, message: "Supabase query failed: " + text }, { status: 502 });
  }
  const posts = (await postRes.json()) as Array<{ id: string; organization_id: string; author_wallet: string }>;
  const post = posts[0];
  if (!post) {
    return Response.json({ ok: false, message: "Post not found." }, { status: 404 });
  }

  const orgRes = await fetch(
    `${supabaseUrl}/rest/v1/organizations?id=eq.${encodeURIComponent(orgId)}&select=wallet,status&limit=1`,
    { headers, cache: "no-store" },
  );
  const orgRows = (await orgRes.json()) as Array<{ wallet: string; status: string }>;
  const org = orgRows[0];
  if (!org || org.status !== "approved") {
    return Response.json({ ok: false, message: "Organization not found or not approved." }, { status: 403 });
  }

  const orgWallet = org.wallet.toLowerCase();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const idResult = await verifyAminiIdentity("Update Organization Post", orgWallet, {
    cdpAccessToken: typeof body.cdpAccessToken === "string" ? body.cdpAccessToken : undefined,
    signature: typeof body.signature === "string" ? body.signature : undefined,
    signatureTimestamp: typeof body.signatureTimestamp === "string" ? body.signatureTimestamp : undefined,
    txHash: typeof body.txHash === "string" ? body.txHash : undefined,
  });
  if (!idResult.ok) {
    return Response.json({ ok: false, message: idResult.message }, { status: 401 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length === 0 || text.length > 8000) {
    return Response.json(
      { ok: false, message: "Post body must be 1–8000 characters." },
      { status: 400 },
    );
  }

  const patchRes = await fetch(
    `${supabaseUrl}/rest/v1/organization_posts?id=eq.${encodeURIComponent(postId)}&organization_id=eq.${encodeURIComponent(orgId)}`,
    {
      method: "PATCH",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ body: text, updated_at: new Date().toISOString() }),
    },
  );

  if (!patchRes.ok) {
    const t = await patchRes.text();
    return Response.json({ ok: false, message: "Failed to update post: " + t }, { status: 502 });
  }

  const updated = (await patchRes.json()) as unknown[];
  return Response.json({ ok: true, post: updated[0] ?? null });
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
  if (!cfg) {
    return Response.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }

  const { supabaseUrl, serviceRole } = cfg;
  const headers = supabaseServiceHeaders(serviceRole);

  const orgRes = await fetch(
    `${supabaseUrl}/rest/v1/organizations?id=eq.${encodeURIComponent(orgId)}&select=wallet,status&limit=1`,
    { headers, cache: "no-store" },
  );
  const orgRows = (await orgRes.json()) as Array<{ wallet: string; status: string }>;
  const org = orgRows[0];
  if (!org || org.status !== "approved") {
    return Response.json({ ok: false, message: "Organization not found or not approved." }, { status: 403 });
  }

  const orgWallet = org.wallet.toLowerCase();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const idResult = await verifyAminiIdentity("Delete Organization Post", orgWallet, {
    cdpAccessToken: typeof body.cdpAccessToken === "string" ? body.cdpAccessToken : undefined,
    signature: typeof body.signature === "string" ? body.signature : undefined,
    signatureTimestamp: typeof body.signatureTimestamp === "string" ? body.signatureTimestamp : undefined,
    txHash: typeof body.txHash === "string" ? body.txHash : undefined,
  });
  if (!idResult.ok) {
    return Response.json({ ok: false, message: idResult.message }, { status: 401 });
  }

  const del = await fetch(
    `${supabaseUrl}/rest/v1/organization_posts?id=eq.${encodeURIComponent(postId)}&organization_id=eq.${encodeURIComponent(orgId)}`,
    { method: "DELETE", headers },
  );

  if (!del.ok) {
    const t = await del.text();
    return Response.json({ ok: false, message: "Failed to delete post: " + t }, { status: 502 });
  }

  return Response.json({ ok: true });
}
