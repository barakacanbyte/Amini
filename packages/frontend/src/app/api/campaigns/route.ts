export const runtime = "nodejs";

function err(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

type CampaignPayload = {
  campaignId: number;
  chainId: number;
  owner: string;
  beneficiary: string;
  targetAmount: string;
  milestoneCount: number;
  metadataUri: string;
  txHash: string;
  blockNumber?: number;
  title?: string;
  description?: string;
  imageUrl?: string;
  region?: string;
  cause?: string;
  organizationId?: string;
};

/**
 * POST /api/campaigns
 *
 * Saves a newly-created on-chain campaign to Supabase so it is immediately
 * visible in the explorer without waiting for the indexer to sync.
 */
export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as CampaignPayload;

    if (payload.campaignId === undefined || payload.campaignId === null) {
      return err("campaignId is required.");
    }
    if (!payload.owner || !payload.beneficiary) {
      return err("owner and beneficiary are required.");
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRole) {
      return err(
        "Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        500,
      );
    }

    const row: Record<string, unknown> = {
      id: payload.campaignId,
      chain_id: payload.chainId,
      owner: payload.owner.toLowerCase(),
      beneficiary: payload.beneficiary.toLowerCase(),
      target_amount: payload.targetAmount,
      milestone_count: payload.milestoneCount,
      metadata_uri: payload.metadataUri || null,
      created_tx_hash: payload.txHash || null,
      created_block: payload.blockNumber ?? null,
    };

    if (payload.title) row.title = payload.title;
    if (payload.description) row.description = payload.description;
    if (payload.imageUrl) row.image_url = payload.imageUrl;
    if (payload.region) row.region = payload.region;
    if (payload.cause) row.cause = payload.cause;
    if (payload.organizationId) row.organization_id = payload.organizationId;

    const dbRes = await fetch(
      supabaseUrl + "/rest/v1/campaigns",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRole,
          Authorization: "Bearer " + serviceRole,
          Prefer: "return=representation",
        },
        body: JSON.stringify(row),
      },
    );

    if (!dbRes.ok) {
      const text = await dbRes.text();
      return err("Supabase insert failed: " + text, 502);
    }

    const inserted = await dbRes.json();

    return Response.json({ ok: true, campaign: inserted });
  } catch (error) {
    return Response.json(
      { ok: false, message: (error as Error).message ?? "Unknown server error" },
      { status: 500 },
    );
  }
}
