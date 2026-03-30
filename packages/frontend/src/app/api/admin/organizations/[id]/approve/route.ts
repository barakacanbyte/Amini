export const runtime = "nodejs";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * POST /api/admin/organizations/[id]/approve
 * 
 * Approves an organization registration request.
 * Sets status to 'approved' and records verification timestamp.
 * Requires admin role.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin(req);
  if (authError) return authError;

  const { id } = await params;

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
      "Content-Type": "application/json",
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      Prefer: "return=representation",
    };

    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/organizations?id=eq.${id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          status: "approved",
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (!updateRes.ok) {
      const text = await updateRes.text();
      throw new Error(`Failed to approve organization: ${text}`);
    }

    const updated = await updateRes.json();

    const orgData = Array.isArray(updated) && updated.length > 0 ? updated[0] : updated;

    if (orgData && orgData.wallet) {
      // Fetch current profile to get existing roles
      const profileRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?wallet=eq.${orgData.wallet}&select=roles`,
        { headers }
      );
      
      if (profileRes.ok) {
        const profiles = await profileRes.json() as Array<{ roles?: string[] }>;
        if (profiles.length > 0) {
          const currentRoles = profiles[0].roles || ['donor'];
          const updatedRoles = currentRoles.includes('organization') 
            ? currentRoles 
            : [...currentRoles, 'organization'];
          
          await fetch(
            `${supabaseUrl}/rest/v1/profiles?wallet=eq.${orgData.wallet}`,
            {
              method: "PATCH",
              headers,
              body: JSON.stringify({
                roles: updatedRoles,
                updated_at: new Date().toISOString(),
              }),
            }
          );
        }
      }
    }

    return Response.json({
      ok: true,
      message: "Organization approved successfully",
      organization: orgData,
    });
  } catch (error) {
    console.error("POST /api/admin/organizations/[id]/approve error:", error);
    return Response.json(
      { ok: false, message: (error as Error).message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
