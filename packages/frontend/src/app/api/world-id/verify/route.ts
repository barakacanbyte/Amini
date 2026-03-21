export const runtime = "nodejs";

type VerifyRequest = {
  rp_id: string;
  wallet: string;
  idkitResponse: unknown;
};

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as VerifyRequest;
    const rpId = payload.rp_id;
    const wallet = payload.wallet?.toLowerCase();

    if (!rpId || !wallet || !payload.idkitResponse) {
      return Response.json(
        { ok: false, message: "rp_id, wallet and idkitResponse are required." },
        { status: 400 }
      );
    }

    const worldRes = await fetch(`https://developer.world.org/api/v4/verify/${rpId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload.idkitResponse),
    });
    const worldJson = (await worldRes.json().catch(() => ({}))) as {
      success?: boolean;
      verified?: boolean;
      code?: string;
      detail?: string;
    };
    if (!worldRes.ok) {
      return Response.json(
        {
          ok: false,
          message: worldJson.detail ?? worldJson.code ?? "World ID verification failed.",
          world: worldJson,
        },
        { status: worldRes.status }
      );
    }

    const verified = Boolean(worldJson.success ?? worldJson.verified ?? true);
    if (!verified) {
      return Response.json(
        { ok: false, message: "World ID proof was not verified.", world: worldJson },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRole) {
      return Response.json(
        {
          ok: false,
          message: "Supabase service role env is missing; cannot persist verification.",
        },
        { status: 500 }
      );
    }

    const now = new Date().toISOString();
    const dbRes = await fetch(`${supabaseUrl}/rest/v1/sybil_verifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        wallet,
        provider: "worldcoin",
        is_verified: true,
        verified_at: now,
        updated_at: now,
        proof_payload: payload.idkitResponse,
      }),
    });

    if (!dbRes.ok) {
      const txt = await dbRes.text();
      return Response.json(
        { ok: false, message: `Failed to persist sybil verification: ${txt}` },
        { status: 502 }
      );
    }

    return Response.json({ ok: true, verified: true });
  } catch (error) {
    return Response.json(
      { ok: false, message: (error as Error).message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
