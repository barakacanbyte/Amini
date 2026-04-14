import { verifyAminiIdentity } from "@/lib/auth";

export const runtime = "nodejs";

const DONATION_PREF_ACTION = "Save Donation Preference";
const MAX_MESSAGE_LEN = 280;

function badRequest(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

type Body = {
  txHash: string;
  donorWallet: string;
  isAnonymous?: boolean;
  donorMessage?: string | null;
  signature?: string;
  signatureTimestamp?: string;
  cdpAccessToken?: string;
};

/**
 * POST /api/donations/preferences
 * Stores donor display preferences (anonymity, message) for a deposit tx.
 * Wallet-verified: the donor must prove they control the wallet.
 */
export async function POST(req: Request) {
  let payload: Body;
  try {
    payload = (await req.json()) as Body;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const txHash = String(payload.txHash ?? "").trim();
  const donorWallet = String(payload.donorWallet ?? "").trim().toLowerCase();
  if (!txHash || !donorWallet) {
    return badRequest("txHash and donorWallet are required");
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return badRequest("txHash must be a valid 32-byte hex string");
  }

  const isAnonymous = Boolean(payload.isAnonymous);
  const donorMessage = payload.donorMessage?.trim() || null;
  if (donorMessage && donorMessage.length > MAX_MESSAGE_LEN) {
    return badRequest(`donorMessage must be at most ${MAX_MESSAGE_LEN} characters`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl?.trim() || !serviceRole?.trim()) {
    return Response.json({ ok: false, message: "Supabase not configured" }, { status: 503 });
  }

  const headers = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    "content-type": "application/json",
    Prefer: "return=representation",
  };

  const timestamp = String(payload.signatureTimestamp ?? "").trim();
  const idResult = await verifyAminiIdentity(DONATION_PREF_ACTION, donorWallet, {
    cdpAccessToken: payload.cdpAccessToken?.trim() || undefined,
    signature: payload.signature?.trim() || undefined,
    signatureTimestamp: timestamp || undefined,
    txHash: undefined,
  });
  if (!idResult.ok) {
    return badRequest(idResult.message ?? "Identity verification failed", 401);
  }

  let displayNameSnapshot: string | null = null;
  if (!isAnonymous) {
    try {
      const profileRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?wallet=eq.${encodeURIComponent(donorWallet)}&select=name`,
        { headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` }, cache: "no-store" },
      );
      if (profileRes.ok) {
        const rows = (await profileRes.json()) as Array<{ name: string | null }>;
        displayNameSnapshot = rows[0]?.name?.trim() || null;
      }
    } catch {
      /* best effort */
    }
  }

  const existsRes = await fetch(
    `${supabaseUrl}/rest/v1/donation_preferences?tx_hash=eq.${encodeURIComponent(txHash)}&select=tx_hash`,
    { headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` }, cache: "no-store" },
  );
  if (existsRes.ok) {
    const existing = (await existsRes.json()) as unknown[];
    if (existing.length > 0) {
      return badRequest("Donation preference already recorded for this transaction", 409);
    }
  }

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/donation_preferences`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      tx_hash: txHash,
      donor_wallet: donorWallet,
      is_anonymous: isAnonymous,
      donor_message: donorMessage,
      display_name_snapshot: displayNameSnapshot,
    }),
  });

  if (!insertRes.ok) {
    const text = await insertRes.text();
    return Response.json(
      { ok: false, message: text || `Insert failed (${insertRes.status})` },
      { status: 502 },
    );
  }

  // Auto-promote wallet to "donor" role if not already present
  try {
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?wallet=eq.${encodeURIComponent(donorWallet)}&select=wallet,roles`,
      { headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` }, cache: "no-store" },
    );
    if (profileRes.ok) {
      const rows = (await profileRes.json()) as Array<{ wallet: string; roles: string[] | null }>;
      const row = rows[0];
      if (row) {
        const currentRoles = row.roles ?? ["guest"];
        if (!currentRoles.includes("donor")) {
          const newRoles = [...currentRoles.filter((r) => r !== "guest"), "donor"];
          await fetch(
            `${supabaseUrl}/rest/v1/profiles?wallet=eq.${encodeURIComponent(donorWallet)}`,
            {
              method: "PATCH",
              headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, "content-type": "application/json" },
              body: JSON.stringify({ roles: newRoles }),
            },
          );
        }
      }
    }
  } catch {
    /* best-effort role promotion */
  }

  return Response.json({ ok: true, displayName: displayNameSnapshot });
}
