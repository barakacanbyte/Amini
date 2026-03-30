export const runtime = "nodejs";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * POST /api/admin/organizations/[id]/reject
 * 
 * Rejects an organization registration request.
 * Sets status to 'rejected' with optional reason.
 * Requires admin role.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin(req);
  if (authError) return authError;

  const { id } = await params;

  let reason = "";
  try {
    const body = await req.json();
    reason = body.reason || "";
  } catch {
    // No body or invalid JSON, continue without reason
  }

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
          status: "rejected",
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (!updateRes.ok) {
      const text = await updateRes.text();
      throw new Error(`Failed to reject organization: ${text}`);
    }

    const updated = await updateRes.json();
    const orgData = Array.isArray(updated) && updated.length > 0 ? updated[0] : updated;

    return Response.json({
      ok: true,
      message: "Organization rejected",
      organization: orgData,
      reason,
    });
  } catch (error) {
    console.error("POST /api/admin/organizations/[id]/reject error:", error);
    return Response.json(
      { ok: false, message: (error as Error).message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
