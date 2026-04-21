export const runtime = "nodejs";

import { getSupabaseServiceConfig, supabaseServiceHeaders } from "@/lib/supabaseService";
import { formatUsdc } from "@/lib/contracts";

type CampaignDbRow = {
  id: number;
  title: string | null;
  status: string | null;
  target_amount: string | null;
  milestone_count: number | null;
  image_url: string | null;
  is_fully_created: boolean | null;
  organization_id: string | null;
};

type DepositRow = { campaign_id: number; amount: string };
type ProofRow = { campaign_id: number; status: string | null };
type ReleaseRow = { campaign_id: number };

export type OrgDashboardCampaign = {
  id: string;
  name: string;
  status: "Active" | "Review Pending" | "Completed";
  raised: string;
  goal: string;
  rawRaised: string;
  rawGoal: string;
};

export type OrgDashboardStats = {
  totalRaised: string;
  activeCampaigns: number;
  pendingMilestones: number;
};

function formatCompactUsdc(raw: bigint): string {
  const s = formatUsdc(raw);
  const num = Number.parseFloat(s);
  if (!Number.isFinite(num)) return `$${s}`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}k`;
  return `$${num.toFixed(num < 10 ? 2 : 0)}`;
}

function formatShortUsdc(raw: bigint): string {
  const s = formatUsdc(raw);
  const num = Number.parseFloat(s);
  if (!Number.isFinite(num)) return s;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return num.toFixed(num < 10 ? 2 : 0);
}

/**
 * GET /api/organization/dashboard?wallet=<address>
 *
 * Returns aggregate stats and campaign rows for all campaigns owned by the
 * given wallet, or whose organization_id matches any organization owned by
 * the wallet. All amounts are derived from real Supabase data.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet")?.toLowerCase()?.trim();
  if (!wallet) {
    return Response.json({ ok: false, message: "wallet is required" }, { status: 400 });
  }

  const cfg = getSupabaseServiceConfig();
  if (!cfg) {
    return Response.json(
      { ok: false, message: "Supabase not configured on server." },
      { status: 500 },
    );
  }
  const { supabaseUrl, serviceRole } = cfg;
  const headers = supabaseServiceHeaders(serviceRole);

  try {
    // 1. Find the wallet's organizations so we can include campaigns linked by organization_id.
    const orgsRes = await fetch(
      `${supabaseUrl}/rest/v1/organizations?wallet=eq.${encodeURIComponent(wallet)}&select=id&limit=100`,
      { headers, cache: "no-store" },
    );
    const orgIds: string[] = orgsRes.ok
      ? ((await orgsRes.json()) as Array<{ id: string }>).map((o) => o.id)
      : [];

    // 2. Fetch campaigns where owner = wallet OR organization_id in (orgIds).
    const campSelect =
      "id,title,status,target_amount,milestone_count,image_url,is_fully_created,organization_id";

    const ownerUrl = `${supabaseUrl}/rest/v1/campaigns?owner=eq.${encodeURIComponent(wallet)}&is_fully_created=eq.true&select=${campSelect}&order=id.desc&limit=200`;
    const fetches: Promise<Response>[] = [fetch(ownerUrl, { headers, cache: "no-store" })];
    if (orgIds.length > 0) {
      const orgUrl = `${supabaseUrl}/rest/v1/campaigns?organization_id=in.(${orgIds.map((i) => encodeURIComponent(i)).join(",")})&is_fully_created=eq.true&select=${campSelect}&order=id.desc&limit=200`;
      fetches.push(fetch(orgUrl, { headers, cache: "no-store" }));
    }
    const campResponses = await Promise.all(fetches);
    const allRows: CampaignDbRow[] = [];
    for (const r of campResponses) {
      if (r.ok) {
        const rows = (await r.json()) as CampaignDbRow[];
        allRows.push(...rows);
      }
    }
    // Deduplicate by id.
    const byId = new Map<number, CampaignDbRow>();
    for (const row of allRows) byId.set(row.id, row);
    const campaigns = Array.from(byId.values()).sort((a, b) => b.id - a.id);

    // 3. Load deposits, milestone proofs, and releases for these campaigns.
    let raisedMap = new Map<number, bigint>();
    let pendingProofsMap = new Map<number, number>();
    let releasesMap = new Map<number, number>();

    if (campaigns.length > 0) {
      const ids = campaigns.map((c) => c.id).join(",");
      const [depRes, proofRes, relRes] = await Promise.all([
        fetch(
          `${supabaseUrl}/rest/v1/escrow_deposits?campaign_id=in.(${ids})&select=campaign_id,amount&limit=10000`,
          { headers, cache: "no-store" },
        ),
        fetch(
          `${supabaseUrl}/rest/v1/milestone_proofs?campaign_id=in.(${ids})&status=eq.submitted&select=campaign_id,status&limit=10000`,
          { headers, cache: "no-store" },
        ),
        fetch(
          `${supabaseUrl}/rest/v1/milestone_releases?campaign_id=in.(${ids})&select=campaign_id&limit=10000`,
          { headers, cache: "no-store" },
        ),
      ]);

      if (depRes.ok) {
        const deps = (await depRes.json()) as DepositRow[];
        for (const d of deps) {
          raisedMap.set(
            d.campaign_id,
            (raisedMap.get(d.campaign_id) ?? 0n) + BigInt(d.amount || "0"),
          );
        }
      }
      if (proofRes.ok) {
        const proofs = (await proofRes.json()) as ProofRow[];
        for (const p of proofs) {
          pendingProofsMap.set(p.campaign_id, (pendingProofsMap.get(p.campaign_id) ?? 0) + 1);
        }
      }
      if (relRes.ok) {
        const rels = (await relRes.json()) as ReleaseRow[];
        for (const r of rels) {
          releasesMap.set(r.campaign_id, (releasesMap.get(r.campaign_id) ?? 0) + 1);
        }
      }
    }

    // 4. Build response rows + stats.
    let totalRaised = 0n;
    let activeCount = 0;
    let pendingMilestones = 0;

    const rows: OrgDashboardCampaign[] = campaigns.map((c) => {
      const raised = raisedMap.get(c.id) ?? 0n;
      const goal = BigInt(c.target_amount || "0");
      totalRaised += raised;

      const releasesCount = releasesMap.get(c.id) ?? 0;
      const pendingCount = pendingProofsMap.get(c.id) ?? 0;
      pendingMilestones += pendingCount;

      const totalMilestones = c.milestone_count ?? 0;
      const isCompleted =
        totalMilestones > 0 && releasesCount >= totalMilestones;

      let status: OrgDashboardCampaign["status"];
      if (isCompleted) {
        status = "Completed";
      } else if (pendingCount > 0) {
        status = "Review Pending";
      } else {
        status = "Active";
      }
      if (status === "Active") activeCount += 1;

      return {
        id: String(c.id),
        name: c.title?.trim() || `Campaign #${c.id}`,
        status,
        raised: formatShortUsdc(raised),
        goal: formatShortUsdc(goal),
        rawRaised: raised.toString(),
        rawGoal: goal.toString(),
      };
    });

    const stats: OrgDashboardStats = {
      totalRaised: formatCompactUsdc(totalRaised),
      activeCampaigns: activeCount,
      pendingMilestones,
    };

    return Response.json({ ok: true, stats, campaigns: rows });
  } catch (error) {
    console.error("GET /api/organization/dashboard error:", error);
    return Response.json(
      { ok: false, message: (error as Error).message ?? "Unknown server error" },
      { status: 500 },
    );
  }
}
