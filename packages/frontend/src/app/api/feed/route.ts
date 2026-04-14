export const runtime = "nodejs";

import { getSupabaseServiceConfig, supabaseServiceHeaders } from "@/lib/supabaseService";

export async function GET(req: Request) {
  const cfg = getSupabaseServiceConfig();
  if (!cfg) {
    return Response.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }

  const { supabaseUrl, serviceRole } = cfg;
  const headers = supabaseServiceHeaders(serviceRole);

  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20") || 20));
  const viewerWallet = (searchParams.get("viewerWallet") ?? "").trim().toLowerCase();
  const cursorScoreRaw = searchParams.get("cursorScore");
  const cursorId = (searchParams.get("cursorId") ?? "").trim() || null;
  const cursorScore = cursorScoreRaw ? parseFloat(cursorScoreRaw) : null;

  const body: Record<string, unknown> = {
    viewer_wallet: viewerWallet || null,
    limit_count: limit,
  };
  if (cursorScore !== null && !isNaN(cursorScore) && cursorId) {
    body.cursor_score = cursorScore;
    body.cursor_id = cursorId;
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_activity_feed`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    return Response.json({ ok: false, message: "Supabase RPC failed: " + text }, { status: 502 });
  }

  const rows = (await res.json()) as any[];

  const posts = rows.map((row: any) => ({
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
    _score: row.score,
  }));

  const nextCursor =
    posts.length === limit && posts.length > 0
      ? { cursorScore: posts[posts.length - 1]._score, cursorId: posts[posts.length - 1].id }
      : null;

  return Response.json({ ok: true, posts, nextCursor });
}
