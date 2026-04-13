import { getSupabaseServiceConfig, supabaseServiceHeaders } from "@/lib/supabaseService";

export type ProfileOrgRow = { id: string; name: string; status: string };

export type ProfileDepositRow = {
  tx_hash: string;
  campaign_id: number;
  amount: string;
  created_at: string;
  campaign_title: string | null;
};

type DepositApiRow = {
  tx_hash: string;
  campaign_id: number;
  amount: string | number;
  created_at: string;
  campaigns?: { title?: string | null } | null;
};

/**
 * Public profile extras: orgs registered to this wallet + indexed escrow deposits as depositor.
 */
export async function loadProfilePublicActivity(wallet: string): Promise<{
  organizations: ProfileOrgRow[];
  deposits: ProfileDepositRow[];
}> {
  const cfg = getSupabaseServiceConfig();
  if (!cfg) {
    return { organizations: [], deposits: [] };
  }
  const { supabaseUrl, serviceRole } = cfg;
  const headers = supabaseServiceHeaders(serviceRole);
  const w = wallet.toLowerCase();

  const [orgsRes, depRes] = await Promise.all([
    fetch(
      `${supabaseUrl}/rest/v1/organizations?wallet=eq.${encodeURIComponent(w)}&select=id,name,status&order=created_at.desc&limit=50`,
      { headers, cache: "no-store" },
    ),
    fetch(
      `${supabaseUrl}/rest/v1/escrow_deposits?depositor=eq.${encodeURIComponent(w)}&select=tx_hash,campaign_id,amount,created_at,campaigns(title)&order=created_at.desc&limit=50`,
      { headers, cache: "no-store" },
    ),
  ]);

  let organizations: ProfileOrgRow[] = [];
  if (orgsRes.ok) {
    const rows = (await orgsRes.json()) as ProfileOrgRow[];
    organizations = Array.isArray(rows) ? rows : [];
  }

  let deposits: ProfileDepositRow[] = [];
  if (depRes.ok) {
    const raw = (await depRes.json()) as DepositApiRow[];
    if (Array.isArray(raw)) {
      deposits = raw.map((r) => ({
        tx_hash: r.tx_hash,
        campaign_id: Number(r.campaign_id),
        amount: String(r.amount ?? ""),
        created_at: r.created_at,
        campaign_title: r.campaigns?.title?.trim() || null,
      }));
    }
  }

  return { organizations, deposits };
}
