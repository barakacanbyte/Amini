import { requireAdmin, getWalletFromRequest } from "@/lib/adminAuth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ proofId: string }> },
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const { proofId } = await params;
  const id = Number(proofId);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json(
      { ok: false, message: "Invalid proof id" },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    return Response.json(
      { ok: false, message: "Supabase not configured" },
      { status: 500 },
    );
  }

  const body = (await req.json()) as {
    action: "approve" | "reject";
    notes?: string;
    attestation_uid?: string;
  };

  if (body.action !== "approve" && body.action !== "reject") {
    return Response.json(
      { ok: false, message: "action must be 'approve' or 'reject'" },
      { status: 400 },
    );
  }

  const reviewerWallet = getWalletFromRequest(req) ?? "unknown";
  const newStatus = body.action === "approve" ? "approved" : "rejected";

  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    reviewer_wallet: reviewerWallet,
    reviewer_notes: body.notes?.trim() || null,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (body.action === "approve" && body.attestation_uid) {
    updatePayload.attestation_uid = body.attestation_uid;
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/milestone_proofs?id=eq.${id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(updatePayload),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    return Response.json(
      { ok: false, message: `Failed to update proof: ${err}` },
      { status: 500 },
    );
  }

  const updated = (await res.json()) as Array<Record<string, unknown>>;
  return Response.json({ ok: true, proof: updated[0] ?? null });
}
