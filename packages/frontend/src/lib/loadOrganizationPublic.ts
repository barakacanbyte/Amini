import type { OrganizationPublic, OrgCampaignRow } from "@/lib/organizationTypes";
import { getSupabaseServiceConfig, supabaseServiceHeaders } from "@/lib/supabaseService";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ORG_SELECT =
  "id,wallet,name,description,website_url,country,status,verified_at,official_email,twitter_handle,linkedin_url,ens_name,has_coinbase_verification,logo_url,cover_image_url,tagline,prior_projects,created_at,updated_at";

export type OrganizationPageData = {
  organization: OrganizationPublic;
  campaigns: OrgCampaignRow[];
} | null;

export async function loadOrganizationById(orgId: string): Promise<OrganizationPublic | null> {
  if (!UUID_RE.test(orgId)) return null;

  const cfg = getSupabaseServiceConfig();
  if (!cfg) return null;

  const { supabaseUrl, serviceRole } = cfg;
  const headers = supabaseServiceHeaders(serviceRole);

  const orgRes = await fetch(
    `${supabaseUrl}/rest/v1/organizations?id=eq.${encodeURIComponent(orgId)}&select=${ORG_SELECT}&limit=1`,
    { headers, cache: "no-store" },
  );
  if (!orgRes.ok) return null;
  const orgRows = (await orgRes.json()) as OrganizationPublic[];
  return orgRows[0] ?? null;
}

export async function loadOrganizationPublicPage(orgId: string): Promise<OrganizationPageData> {
  const organization = await loadOrganizationById(orgId);
  if (!organization) return null;

  const cfg = getSupabaseServiceConfig();
  if (!cfg) return null;

  const { supabaseUrl, serviceRole } = cfg;
  const headers = supabaseServiceHeaders(serviceRole);

  const campSelect = "id,title,description,image_url,status,target_amount,region,cause";
  const campRes = await fetch(
    `${supabaseUrl}/rest/v1/campaigns?organization_id=eq.${encodeURIComponent(orgId)}&is_fully_created=eq.true&select=${campSelect}&order=id.desc&limit=50`,
    { headers, cache: "no-store" },
  );

  let campaigns: OrgCampaignRow[] = [];
  if (campRes.ok) {
    campaigns = (await campRes.json()) as OrgCampaignRow[];
  }

  if (campaigns.length > 0) {
    const campIds = campaigns.map((c) => c.id);
    const depRes = await fetch(
      `${supabaseUrl}/rest/v1/escrow_deposits?campaign_id=in.(${campIds.join(",")})&select=campaign_id,amount,depositor`,
      { headers, cache: "no-store" },
    );
    if (depRes.ok) {
      type DepRow = { campaign_id: number; amount: string; depositor: string };
      const deps = (await depRes.json()) as DepRow[];
      const raised = new Map<number, bigint>();
      const donorSets = new Map<number, Set<string>>();
      for (const d of deps) {
        raised.set(d.campaign_id, (raised.get(d.campaign_id) ?? 0n) + BigInt(d.amount));
        const s = donorSets.get(d.campaign_id) ?? new Set();
        s.add(d.depositor);
        donorSets.set(d.campaign_id, s);
      }
      for (const c of campaigns) {
        c.total_raised = (raised.get(c.id) ?? 0n).toString();
        c.donor_count = donorSets.get(c.id)?.size ?? 0;
      }
    }
  }

  return { organization, campaigns };
}
