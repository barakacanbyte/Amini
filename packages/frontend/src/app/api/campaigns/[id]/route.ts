export const runtime = "nodejs";

const CAMPAIGN_SELECT = [
  "id",
  "chain_id",
  "owner",
  "beneficiary",
  "target_amount",
  "milestone_count",
  "metadata_uri",
  "created_at",
  "organization_id",
  "title",
  "description",
  "image_url",
  "region",
  "cause",
  "deadline",
  "contact_email",
  "beneficiary_description",
  "status",
  "milestone_data",
  "social_links",
  "impact_metrics",
  "tags",
  "created_tx_hash",
].join(",");

function restHeaders(serviceRole: string): Record<string, string> {
  return {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
  };
}

/**
 * GET /api/campaigns/[id]
 * Public read: campaign metadata, linked organization, and indexed flow rows (service role).
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await context.params;
  const campaignId = Number(idParam);
  if (!Number.isFinite(campaignId) || String(campaignId) !== idParam.trim()) {
    return Response.json({ ok: false, message: "Invalid campaign id" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl?.trim() || !serviceRole?.trim()) {
    return Response.json({ ok: false, message: "Supabase not configured" }, { status: 503 });
  }

  const headers = restHeaders(serviceRole);

  try {
    const campUrl =
      `${supabaseUrl}/rest/v1/campaigns?id=eq.${campaignId}&is_fully_created=eq.true&select=${encodeURIComponent(CAMPAIGN_SELECT)}`;
    const campRes = await fetch(campUrl, { headers, cache: "no-store" });
    if (!campRes.ok) {
      const text = await campRes.text();
      return Response.json(
        { ok: false, message: text || `Campaign fetch failed (${campRes.status})` },
        { status: 502 },
      );
    }

    const campRows = (await campRes.json()) as Array<Record<string, unknown>>;
    const campaign = campRows[0] ?? null;

    let organization: Record<string, unknown> | null = null;
    const orgId = campaign?.organization_id;
    if (typeof orgId === "string" && orgId.length > 0) {
      const orgRes = await fetch(
        `${supabaseUrl}/rest/v1/organizations?id=eq.${encodeURIComponent(orgId)}&select=id,name,description,website_url,country,status,logo_url,verified_at,official_email,twitter_handle,linkedin_url`,
        { headers, cache: "no-store" },
      );
      if (orgRes.ok) {
        const orgRows = (await orgRes.json()) as Array<Record<string, unknown>>;
        organization = orgRows[0] ?? null;
      }
    }

    const [depRes, relRes, impactRes, commentsRes] = await Promise.all([
      fetch(
        `${supabaseUrl}/rest/v1/escrow_deposits?select=tx_hash,depositor,amount,block_number,created_at&campaign_id=eq.${campaignId}&order=id.desc&limit=100`,
        { headers, cache: "no-store" },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/milestone_releases?select=tx_hash,milestone_index,amount,attestation_uid,block_number,created_at&campaign_id=eq.${campaignId}&order=id.desc&limit=100`,
        { headers, cache: "no-store" },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/impact_posts?select=id,milestone_index,author_wallet,body,ipfs_cid,ipfs_url,attachment_cid,attachment_url,attachment_name,attachment_content_type,tx_hash_link,created_at&campaign_id=eq.${campaignId}&order=id.desc&limit=100`,
        { headers, cache: "no-store" },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/campaign_comments?select=id,parent_id,author_wallet,body,created_at&campaign_id=eq.${campaignId}&order=created_at.desc&limit=200`,
        { headers, cache: "no-store" },
      ),
    ]);

    const deposits = depRes.ok ? ((await depRes.json()) as unknown[]) : [];
    const releases = relRes.ok ? ((await relRes.json()) as unknown[]) : [];
    const impactPosts = impactRes.ok ? ((await impactRes.json()) as unknown[]) : [];
    const comments = commentsRes.ok ? ((await commentsRes.json()) as unknown[]) : [];

    return Response.json({
      ok: true,
      campaign,
      organization,
      deposits,
      releases,
      impactPosts,
      comments,
    });
  } catch (e) {
    return Response.json(
      { ok: false, message: (e as Error).message ?? "Unknown error" },
      { status: 500 },
    );
  }
}
