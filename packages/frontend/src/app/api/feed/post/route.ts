export const runtime = "nodejs";

import { getSupabaseServiceConfig, supabaseServiceHeaders } from "@/lib/supabaseService";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const cfg = getSupabaseServiceConfig();
  if (!cfg) {
    return Response.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }

  const { supabaseUrl, serviceRole } = cfg;
  const headers = supabaseServiceHeaders(serviceRole);

  const { searchParams } = new URL(req.url);
  const postId = (searchParams.get("id") ?? "").trim();
  const viewerWallet = (searchParams.get("viewerWallet") ?? "").trim().toLowerCase();

  if (!postId || !UUID_RE.test(postId)) {
    return Response.json({ ok: false, message: "Invalid post id." }, { status: 400 });
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_single_post`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ target_post_id: postId, viewer_wallet: viewerWallet || null }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    return Response.json({ ok: false, message: "Supabase RPC failed: " + text }, { status: 502 });
  }

  const rows = (await res.json()) as any[];
  if (!rows || rows.length === 0) {
    return Response.json({ ok: false, message: "Post not found." }, { status: 404 });
  }

  const row = rows[0];
  const post = {
    id: row.id,
    organization_id: row.organization_id,
    author_wallet: row.author_wallet,
    body: row.body,
    created_at: row.created_at,
    updated_at: row.updated_at,
    org_name: row.org_name,
    org_logo_url: row.org_logo_url,
    org_wallet: row.org_wallet,
    media: row.media,
    engagement: {
      like_count: Number(row.like_count),
      comment_count: Number(row.comment_count),
      share_count: Number(row.share_count),
      liked_by_viewer: row.liked_by_viewer,
    },
  };

  return Response.json({ ok: true, post });
}
