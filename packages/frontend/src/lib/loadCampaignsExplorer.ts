import type {
  CampaignExplorerRow,
  CampaignRow,
} from "@/app/campaigns/CampaignExplorerClient";

export type CampaignsExplorerLoadResult =
  | { kind: "ok"; rows: CampaignExplorerRow[] }
  | { kind: "unconfigured" }
  | { kind: "error"; message: string };

function supabaseHeaders(serviceRole: string): Record<string, string> {
  return {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
  };
}

async function fetchCampaignRows(
  supabaseUrl: string,
  serviceRole: string,
): Promise<{ ok: true; rows: CampaignRow[] } | { ok: false; message: string }> {
  const select =
    "id,owner,beneficiary,target_amount,milestone_count,metadata_uri,created_at,title,description,image_url,region,cause,tags,deadline";
  const endpoint = `${supabaseUrl}/rest/v1/campaigns?select=${encodeURIComponent(select)}&is_fully_created=eq.true&order=id.desc&limit=100`;

  const res = await fetch(endpoint, {
    headers: supabaseHeaders(serviceRole),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      message: text.trim() || `Supabase campaigns request failed (${res.status})`,
    };
  }

  return { ok: true, rows: (await res.json()) as CampaignRow[] };
}

async function loadDepositTotalsByCampaign(
  supabaseUrl: string,
  serviceRole: string,
): Promise<Map<number, bigint>> {
  const map = new Map<number, bigint>();
  const res = await fetch(
    `${supabaseUrl}/rest/v1/escrow_deposits?select=campaign_id,amount&limit=10000`,
    {
      headers: supabaseHeaders(serviceRole),
      cache: "no-store",
    },
  );
  if (!res.ok) return map;
  const rows = (await res.json()) as Array<{ campaign_id: number; amount: string }>;
  for (const r of rows) {
    const id = r.campaign_id;
    const amt = BigInt(r.amount || "0");
    map.set(id, (map.get(id) ?? BigInt(0)) + amt);
  }
  return map;
}

async function loadAttestedReleaseCounts(
  supabaseUrl: string,
  serviceRole: string,
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const res = await fetch(
    `${supabaseUrl}/rest/v1/milestone_releases?select=campaign_id,attestation_uid&limit=10000`,
    {
      headers: supabaseHeaders(serviceRole),
      cache: "no-store",
    },
  );
  if (!res.ok) return map;
  const rows = (await res.json()) as Array<{ campaign_id: number; attestation_uid: string | null }>;
  for (const r of rows) {
    if (!r.attestation_uid) continue;
    map.set(r.campaign_id, (map.get(r.campaign_id) ?? 0) + 1);
  }
  return map;
}

function mergeCampaignRows(
  rows: CampaignRow[],
  raised: Map<number, bigint>,
  attested: Map<number, number>,
): CampaignExplorerRow[] {
  return rows.map((c) => ({
    ...c,
    total_raised: (raised.get(c.id) ?? BigInt(0)).toString(),
    attested_releases: attested.get(c.id) ?? 0,
  }));
}

/**
 * Loads published campaigns for the public explorer (server-only).
 * Uses the service role so listing works without exposing anon table policies.
 */
export async function loadCampaignsForExplorer(): Promise<CampaignsExplorerLoadResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl?.trim() || !serviceRole?.trim()) {
    return { kind: "unconfigured" };
  }

  const campaignsRes = await fetchCampaignRows(supabaseUrl, serviceRole);
  if (!campaignsRes.ok) {
    return { kind: "error", message: campaignsRes.message };
  }

  const [raisedMap, attestedMap] = await Promise.all([
    loadDepositTotalsByCampaign(supabaseUrl, serviceRole),
    loadAttestedReleaseCounts(supabaseUrl, serviceRole),
  ]);

  return {
    kind: "ok",
    rows: mergeCampaignRows(campaignsRes.rows, raisedMap, attestedMap),
  };
}
