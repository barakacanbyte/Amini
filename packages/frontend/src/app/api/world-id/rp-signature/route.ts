import { signRequest } from "@worldcoin/idkit/signing";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const rpId = process.env.WORLDCOIN_RP_ID;
    const signingKey = process.env.WORLDCOIN_RP_SIGNING_KEY;
    const action = body.action ?? process.env.WORLDCOIN_ACTION;

    if (!rpId || !signingKey || !action) {
      return Response.json(
        {
          ok: false,
          message:
            "WORLDCOIN_RP_ID, WORLDCOIN_RP_SIGNING_KEY and WORLDCOIN_ACTION must be configured.",
        },
        { status: 500 }
      );
    }

    const { sig, nonce, createdAt, expiresAt } = signRequest(action, signingKey);

    return Response.json({
      ok: true,
      rp_context: {
        rp_id: rpId,
        nonce,
        created_at: createdAt,
        expires_at: expiresAt,
        signature: sig,
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, message: (error as Error).message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
