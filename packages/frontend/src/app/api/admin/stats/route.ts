export const runtime = "nodejs";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * GET /api/admin/stats
 * 
 * Returns admin dashboard statistics:
 * - Total volume from all campaigns
 * - Active campaigns count
 * - Verified organizations count
 * - Pending organization reviews count
 * 
 * Requires admin role.
 */
export async function GET(req: Request) {
  const authError = await requireAdmin(req);
  if (authError) return authError;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    return Response.json(
      { ok: false, message: "Supabase not configured on server." },
      { status: 500 }
    );
  }

  try {
    const headers = {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    };

    const [campaignsRes, orgsRes, depositsRes, pendingOrgsRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/campaigns?select=id,target_amount`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/organizations?status=eq.approved&select=id`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/escrow_deposits?select=amount`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/organizations?status=eq.pending&select=id`, { headers }),
    ]);

    if (!campaignsRes.ok || !orgsRes.ok || !depositsRes.ok || !pendingOrgsRes.ok) {
      throw new Error("Failed to fetch stats from Supabase");
    }

    const campaigns = await campaignsRes.json() as Array<{ id: number; target_amount: string }>;
    const orgs = await orgsRes.json() as Array<{ id: string }>;
    const deposits = await depositsRes.json() as Array<{ amount: string }>;
    const pendingOrgs = await pendingOrgsRes.json() as Array<{ id: string }>;

    const totalVolume = deposits.reduce((sum, d) => sum + parseFloat(d.amount || "0"), 0);

    return Response.json({
      ok: true,
      stats: {
        totalVolume: `$${(totalVolume / 1e6).toFixed(1)}M`,
        activeCampaigns: campaigns.length,
        verifiedOrgs: orgs.length,
        pendingReviews: pendingOrgs.length,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/stats error:", error);
    return Response.json(
      { ok: false, message: (error as Error).message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
