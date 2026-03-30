export const runtime = "nodejs";
import { uploadBufferToIpfs, isFilebaseConfigured } from "@/lib/filebaseUpload";
import { verifyAminiIdentity } from "@/lib/auth";

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
    console.error("Missing Supabase configuration:", { supabaseUrl: !!supabaseUrl, serviceRole: !!serviceRole });
    return Response.json(
      { ok: false, message: "Supabase not configured on server." },
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
    console.error("GET /api/organizations error:", error);
    return Response.json(
      { ok: false, message: (error as Error).message ?? "Unknown server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/organizations
 *
 * Registers a new organization. Supports multipart/form-data for logo upload.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const wallet = (form.get("wallet") as string)?.toLowerCase()?.trim();
    const name = (form.get("name") as string)?.trim();
    const description = (form.get("description") as string)?.trim();
    const websiteUrl = (form.get("websiteUrl") as string)?.trim();
    const country = (form.get("country") as string)?.trim();
    const officialEmail = (form.get("officialEmail") as string)?.trim();
    const twitterHandle = (form.get("twitterHandle") as string)?.trim();
    const linkedinUrl = (form.get("linkedinUrl") as string)?.trim();
    const ensName = (form.get("ensName") as string)?.trim();
    const hasCoinbaseVerification = form.get("hasCoinbaseVerification") === "true";
    const signature = (form.get("signature") as string)?.trim();
    const signatureTimestamp = (form.get("signatureTimestamp") as string)?.trim();
    const cdpAccessToken = (form.get("cdpAccessToken") as string)?.trim();
    const txHash = (form.get("txHash") as string)?.trim();

    if (!wallet || !name) {
      return Response.json(
        { ok: false, message: "wallet and name are required." },
        { status: 400 },
      );
    }

    if (!officialEmail || !officialEmail.includes("@")) {
      return Response.json(
        { ok: false, message: "A valid official email is required to verify your organization." },
        { status: 400 },
      );
    }

    console.log("POST /api/organizations - Identity check:", {
      wallet,
      hasTxHash: Boolean(txHash),
      hasSignature: Boolean(signature && signatureTimestamp),
      hasCdpToken: Boolean(cdpAccessToken),
    });
    const idResult = await verifyAminiIdentity("Register Organization", wallet, {
      cdpAccessToken,
      signature,
      signatureTimestamp,
      txHash,
    });
    if (!idResult.ok) {
      console.warn("POST /api/organizations - Identity verification failed:", idResult.message);
      return Response.json({ ok: false, message: idResult.message }, { status: 401 });
    }
    console.log("POST /api/organizations - Identity verified successfully");


    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRole) {
      return Response.json(
        { ok: false, message: "Supabase not configured." },
        { status: 500 },
      );
    }

    // Check for existing registration
    const existingRes = await fetch(
      `${supabaseUrl}/rest/v1/organizations?wallet=eq.${wallet}&select=id,name,status&limit=1`,
      {
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
        },
      },
    );

    if (existingRes.ok) {
      const existing = (await existingRes.json()) as Array<{ id: string; name: string; status: string }>;
      if (existing.length > 0) {
        return Response.json(
          { ok: false, message: `This wallet already has an organization registered: "${existing[0].name}" (${existing[0].status}).` },
          { status: 409 },
        );
      }
    }

    // Ensure profile exists for the wallet (FK on organizations.wallet → profiles.wallet)
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?on_conflict=wallet`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
          Prefer: "resolution=ignore-duplicates",
        },
        body: JSON.stringify({ wallet }),
      },
    );
    if (!profileRes.ok) {
      const text = await profileRes.text();
      console.error("POST /api/organizations - profiles upsert failed:", profileRes.status, text);
      return Response.json(
        { ok: false, message: "Could not create profile for this wallet: " + text },
        { status: 502 },
      );
    }

    // Handle Logo Upload
    let logoUrl: string | null = null;
    const logoFile = form.get("logo") as File | null;
    
    if (logoFile && logoFile.size > 0) {
      if (logoFile.size > 2 * 1024 * 1024) {
        return Response.json({ ok: false, message: "Logo too large. Max 2MB." }, { status: 400 });
      }
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(logoFile.type)) {
        return Response.json({ ok: false, message: "Invalid logo format. Use JPEG, PNG, or WEBP." }, { status: 400 });
      }

      if (isFilebaseConfigured()) {
        try {
          const buffer = new Uint8Array(await logoFile.arrayBuffer());
          const result = await uploadBufferToIpfs(`org-logo-${wallet}-${Date.now()}`, buffer);
          logoUrl = result.gatewayUrl;
        } catch (uploadErr) {
          console.error("Logo upload error:", uploadErr);
          // Non-blocking for registration, but log it
        }
      }
    }

    // Insert organization
    const row: Record<string, unknown> = {
      wallet,
      name,
      official_email: officialEmail,
      logo_url: logoUrl,
    };
    if (description) row.description = description;
    if (websiteUrl) row.website_url = websiteUrl;
    if (country) row.country = country;
    if (twitterHandle) row.twitter_handle = twitterHandle;
    if (linkedinUrl) row.linkedin_url = linkedinUrl;
    if (ensName) row.ens_name = ensName;
    if (hasCoinbaseVerification !== undefined) row.has_coinbase_verification = hasCoinbaseVerification;

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/organizations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });

    if (!insertRes.ok) {
      const text = await insertRes.text();
      return Response.json(
        { ok: false, message: "Failed to register organization: " + text },
        { status: 502 },
      );
    }

    const inserted = await insertRes.json();

    return Response.json({ ok: true, organization: inserted[0] ?? inserted });
  } catch (error) {
    return Response.json(
      { ok: false, message: (error as Error).message ?? "Unknown server error" },
      { status: 500 },
    );
  }
}
