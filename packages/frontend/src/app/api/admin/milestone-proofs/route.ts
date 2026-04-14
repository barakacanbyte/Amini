import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    return Response.json(
      { ok: false, message: "Supabase not configured" },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") ?? "submitted";

  const res = await fetch(
    `${supabaseUrl}/rest/v1/milestone_proofs?status=eq.${statusFilter}&order=created_at.asc&select=*`,
    {
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
    },
  );

  if (!res.ok) {
    return Response.json(
      { ok: false, message: "Failed to fetch proofs" },
      { status: 500 },
    );
  }

  const proofs = await res.json();

  // Enrich with campaign title + org name + beneficiary
  const campaignIds = [
    ...new Set(
      (proofs as Array<{ campaign_id: number }>).map((p) => p.campaign_id),
    ),
  ];

  let campaigns: Record<
    number,
    { title?: string; organization_id?: string; beneficiary?: string }
  > = {};
  let orgs: Record<string, { name: string; logo_url?: string }> = {};

  if (campaignIds.length > 0) {
    const campRes = await fetch(
      `${supabaseUrl}/rest/v1/campaigns?id=in.(${campaignIds.join(",")})&select=id,title,organization_id,beneficiary`,
      {
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
        },
      },
    );
    if (campRes.ok) {
      const rows = (await campRes.json()) as Array<{
        id: number;
        title?: string;
        organization_id?: string;
        beneficiary?: string;
      }>;
      for (const r of rows) campaigns[r.id] = r;

      const orgIds = rows
        .map((r) => r.organization_id)
        .filter(Boolean) as string[];
      if (orgIds.length > 0) {
        const orgRes = await fetch(
          `${supabaseUrl}/rest/v1/organizations?id=in.(${orgIds.map((i) => `"${i}"`).join(",")})&select=id,name,logo_url`,
          {
            headers: {
              apikey: serviceRole,
              Authorization: `Bearer ${serviceRole}`,
            },
          },
        );
        if (orgRes.ok) {
          const orgRows = (await orgRes.json()) as Array<{
            id: string;
            name: string;
            logo_url?: string;
          }>;
          for (const o of orgRows) orgs[o.id] = o;
        }
      }
    }
  }

  const enriched = (
    proofs as Array<{ campaign_id: number; [key: string]: unknown }>
  ).map((p) => {
    const camp = campaigns[p.campaign_id];
    const org = camp?.organization_id ? orgs[camp.organization_id] : null;
    return {
      ...p,
      campaign_title: camp?.title ?? `Campaign #${p.campaign_id}`,
      org_name: org?.name ?? null,
      org_logo_url: org?.logo_url ?? null,
      beneficiary: camp?.beneficiary ?? null,
    };
  });

  return Response.json({ ok: true, proofs: enriched });
}
