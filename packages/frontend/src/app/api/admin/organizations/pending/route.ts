export const runtime = "nodejs";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * GET /api/admin/organizations/pending
 * 
 * Returns all pending organization registration requests with details.
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

    const res = await fetch(
      `${supabaseUrl}/rest/v1/organizations?status=eq.pending&select=id,wallet,name,description,website_url,country,official_email,twitter_handle,linkedin_url,ens_name,has_coinbase_verification,logo_url,created_at&order=created_at.desc`,
      { headers }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase query failed: ${text}`);
    }

    const organizations = await res.json();

    return Response.json({
      ok: true,
      organizations,
    });
  } catch (error) {
    console.error("GET /api/admin/organizations/pending error:", error);
    return Response.json(
      { ok: false, message: (error as Error).message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
