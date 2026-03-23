export const runtime = "nodejs";

/**
 * GET /api/organizations?wallet=<address>
 *
 * Returns the organization info and verification status for a given wallet.
 * Used by the campaign creation page to gate access to verified orgs only.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet")?.toLowerCase();

  if (!wallet) {
    return Response.json({ ok: false, message: "wallet query param is required." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    return Response.json(
      { ok: false, message: "Supabase not configured." },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/organizations?wallet=eq.${wallet}&select=id,name,status,wallet&limit=1`,
      {
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
        },
      },
    );

    if (!res.ok) {
      const text = await res.text();
      return Response.json({ ok: false, message: "Supabase query failed: " + text }, { status: 502 });
    }

    const rows = (await res.json()) as Array<{ id: string; name: string; status: string; wallet: string }>;

    if (rows.length === 0) {
      return Response.json({ ok: true, organization: null });
    }

    return Response.json({ ok: true, organization: rows[0] });
  } catch (error) {
    return Response.json(
      { ok: false, message: (error as Error).message ?? "Unknown server error" },
      { status: 500 },
    );
  }
}
