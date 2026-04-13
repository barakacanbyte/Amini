export const runtime = "nodejs";

import { verifyAminiIdentity } from "@/lib/auth";
import { uploadBufferToIpfs, isFilebaseConfigured } from "@/lib/filebaseUpload";
import type {
  OrganizationPostMediaRow,
  OrganizationPostRow,
  OrganizationPostWithExtras,
} from "@/lib/organizationTypes";
import { getSupabaseServiceConfig, supabaseServiceHeaders } from "@/lib/supabaseService";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_POST_BODY = 8000;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function loadOrgGate(
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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orgId } = await params;
  if (!UUID_RE.test(orgId)) {
    return Response.json({ ok: false, message: "Invalid organization id." }, { status: 400 });
  }

  const cfg = getSupabaseServiceConfig();
  if (!cfg) {
    return Response.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }

  const { supabaseUrl, serviceRole } = cfg;
  const headers = supabaseServiceHeaders(serviceRole);

  const org = await loadOrgGate(supabaseUrl, headers, orgId);
  if (!org) {
    return Response.json({ ok: false, message: "Organization not found." }, { status: 404 });
  }
  if (org.status !== "approved") {
    return Response.json({ ok: true, posts: [] as OrganizationPostRow[] });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20") || 20));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? "0") || 0);
  const viewerWallet = (searchParams.get("viewerWallet") ?? "").trim().toLowerCase();

  const res = await fetch(
    `${supabaseUrl}/rest/v1/organization_posts?organization_id=eq.${encodeURIComponent(orgId)}&select=id,organization_id,author_wallet,body,created_at,updated_at&order=created_at.desc&limit=${limit}&offset=${offset}`,
    { headers, cache: "no-store" },
  );

  if (!res.ok) {
    const text = await res.text();
    return Response.json({ ok: false, message: "Supabase query failed: " + text }, { status: 502 });
  }

  const posts = (await res.json()) as OrganizationPostRow[];
  if (posts.length === 0) {
    return Response.json({ ok: true, posts: [] as OrganizationPostWithExtras[] });
  }

  const postIds = posts.map((p) => p.id);
  const inList = postIds.map((id) => `"${id}"`).join(",");

  const [mediaRes, likesRes, commentsRes, sharesRes, viewerLikesRes] = await Promise.all([
    fetch(
      `${supabaseUrl}/rest/v1/organization_post_media?post_id=in.(${encodeURIComponent(inList)})&select=id,post_id,cid,url,content_type,byte_size,width,height,sort_order,created_at&order=sort_order.asc,created_at.asc`,
      { headers, cache: "no-store" },
    ),
    fetch(
      `${supabaseUrl}/rest/v1/organization_post_likes?post_id=in.(${encodeURIComponent(inList)})&select=post_id`,
      { headers, cache: "no-store" },
    ),
    fetch(
      `${supabaseUrl}/rest/v1/organization_post_comments?post_id=in.(${encodeURIComponent(inList)})&select=post_id`,
      { headers, cache: "no-store" },
    ),
    fetch(
      `${supabaseUrl}/rest/v1/organization_post_shares?post_id=in.(${encodeURIComponent(inList)})&select=post_id`,
      { headers, cache: "no-store" },
    ),
    viewerWallet
      ? fetch(
          `${supabaseUrl}/rest/v1/organization_post_likes?post_id=in.(${encodeURIComponent(inList)})&wallet=eq.${encodeURIComponent(viewerWallet)}&select=post_id`,
          { headers, cache: "no-store" },
        )
      : Promise.resolve(null),
  ]);

  const media = (mediaRes.ok ? ((await mediaRes.json()) as OrganizationPostMediaRow[]) : []) ?? [];
  const mediaByPost = new Map<string, OrganizationPostMediaRow[]>();
  for (const m of media) {
    const list = mediaByPost.get(m.post_id) ?? [];
    list.push(m);
    mediaByPost.set(m.post_id, list);
  }

  const likeCounts = new Map<string, number>();
  if (likesRes.ok) {
    const rows = (await likesRes.json()) as Array<{ post_id: string }>;
    for (const r of rows) likeCounts.set(r.post_id, (likeCounts.get(r.post_id) ?? 0) + 1);
  }
  const commentCounts = new Map<string, number>();
  if (commentsRes.ok) {
    const rows = (await commentsRes.json()) as Array<{ post_id: string }>;
    for (const r of rows) commentCounts.set(r.post_id, (commentCounts.get(r.post_id) ?? 0) + 1);
  }
  const shareCounts = new Map<string, number>();
  if (sharesRes.ok) {
    const rows = (await sharesRes.json()) as Array<{ post_id: string }>;
    for (const r of rows) shareCounts.set(r.post_id, (shareCounts.get(r.post_id) ?? 0) + 1);
  }

  const viewerLiked = new Set<string>();
  if (viewerLikesRes && viewerLikesRes.ok) {
    const rows = (await viewerLikesRes.json()) as Array<{ post_id: string }>;
    for (const r of rows) viewerLiked.add(r.post_id);
  }

  const expanded: OrganizationPostWithExtras[] = posts.map((p) => ({
    ...p,
    media: mediaByPost.get(p.id) ?? [],
    engagement: {
      like_count: likeCounts.get(p.id) ?? 0,
      comment_count: commentCounts.get(p.id) ?? 0,
      share_count: shareCounts.get(p.id) ?? 0,
      liked_by_viewer: viewerLiked.has(p.id),
    },
  }));

  return Response.json({ ok: true, posts: expanded });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orgId } = await params;
  if (!UUID_RE.test(orgId)) {
    return Response.json({ ok: false, message: "Invalid organization id." }, { status: 400 });
  }

  const cfg = getSupabaseServiceConfig();
  if (!cfg) {
    return Response.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }

  const { supabaseUrl, serviceRole } = cfg;
  const headers = supabaseServiceHeaders(serviceRole);

  const org = await loadOrgGate(supabaseUrl, headers, orgId);
  if (!org) {
    return Response.json({ ok: false, message: "Organization not found." }, { status: 404 });
  }
  if (org.status !== "approved") {
    return Response.json(
      { ok: false, message: "Only approved organizations can publish posts." },
      { status: 403 },
    );
  }

  const orgWallet = org.wallet.toLowerCase();
  const ct = req.headers.get("content-type") ?? "";

  let text = "";
  let identity: { cdpAccessToken?: string; signature?: string; signatureTimestamp?: string; txHash?: string } = {};
  let images: File[] = [];

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    text = String(form.get("body") ?? "").trim();
    identity = {
      cdpAccessToken: typeof form.get("cdpAccessToken") === "string" ? String(form.get("cdpAccessToken")) : undefined,
      signature: typeof form.get("signature") === "string" ? String(form.get("signature")) : undefined,
      signatureTimestamp:
        typeof form.get("signatureTimestamp") === "string" ? String(form.get("signatureTimestamp")) : undefined,
      txHash: typeof form.get("txHash") === "string" ? String(form.get("txHash")) : undefined,
    };
    const raw = form.getAll("images");
    images = raw.filter((v): v is File => v instanceof File);
  } else if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return Response.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
    }
    text = typeof body.body === "string" ? body.body.trim() : "";
    identity = {
      cdpAccessToken: typeof body.cdpAccessToken === "string" ? body.cdpAccessToken : undefined,
      signature: typeof body.signature === "string" ? body.signature : undefined,
      signatureTimestamp: typeof body.signatureTimestamp === "string" ? body.signatureTimestamp : undefined,
      txHash: typeof body.txHash === "string" ? body.txHash : undefined,
    };
  } else {
    return Response.json({ ok: false, message: "Unsupported content type." }, { status: 415 });
  }

  if (text.length === 0 || text.length > MAX_POST_BODY) {
    return Response.json(
      { ok: false, message: `Post body must be 1–${MAX_POST_BODY} characters.` },
      { status: 400 },
    );
  }

  if (images.length > MAX_IMAGES) {
    return Response.json({ ok: false, message: `Up to ${MAX_IMAGES} images allowed.` }, { status: 400 });
  }
  for (const f of images) {
    if (f.size <= 0 || f.size > MAX_IMAGE_BYTES) {
      return Response.json(
        { ok: false, message: `Image too large. Max ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))}MB.` },
        { status: 400 },
      );
    }
    if (f.type && !ALLOWED_IMAGE_TYPES.has(f.type)) {
      return Response.json({ ok: false, message: "Unsupported image type." }, { status: 400 });
    }
  }

  const idResult = await verifyAminiIdentity("Create Organization Post", orgWallet, identity);
  if (!idResult.ok) {
    return Response.json({ ok: false, message: idResult.message }, { status: 401 });
  }

  const row = {
    organization_id: orgId,
    author_wallet: orgWallet,
    body: text,
    updated_at: new Date().toISOString(),
  };

  const ins = await fetch(`${supabaseUrl}/rest/v1/organization_posts`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });

  if (!ins.ok) {
    const t = await ins.text();
    return Response.json({ ok: false, message: "Failed to create post: " + t }, { status: 502 });
  }

  const inserted = (await ins.json()) as OrganizationPostRow[];
  const post = inserted[0] ?? null;
  if (!post) return Response.json({ ok: true, post: null });

  let media: OrganizationPostMediaRow[] = [];
  if (images.length > 0) {
    if (!isFilebaseConfigured()) {
      return Response.json(
        { ok: false, message: "File storage not configured." },
        { status: 503 },
      );
    }

    const mediaRows: Array<{
      post_id: string;
      cid: string;
      url: string;
      content_type: string;
      byte_size: number;
      sort_order: number;
      created_at: string;
    }> = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i]!;
      const buffer = new Uint8Array(await img.arrayBuffer());
      const key = `org-post-media-${orgId}-${post.id}-${i + 1}-${Date.now()}`;
      const up = await uploadBufferToIpfs(key, buffer, img.type || undefined);
      mediaRows.push({
        post_id: post.id,
        cid: up.cid,
        url: up.gatewayUrl,
        content_type: img.type || "application/octet-stream",
        byte_size: img.size,
        sort_order: i,
        created_at: new Date().toISOString(),
      });
    }

    const mediaIns = await fetch(`${supabaseUrl}/rest/v1/organization_post_media`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(mediaRows),
    });

    if (!mediaIns.ok) {
      const t = await mediaIns.text();
      return Response.json({ ok: false, message: "Post created but media upload failed: " + t }, { status: 502 });
    }

    media = (await mediaIns.json()) as OrganizationPostMediaRow[];
  }

  const expanded: OrganizationPostWithExtras = {
    ...post,
    media,
    engagement: { like_count: 0, comment_count: 0, share_count: 0, liked_by_viewer: false },
  };
  return Response.json({ ok: true, post: expanded });
}
