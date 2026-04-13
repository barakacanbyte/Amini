export const runtime = "nodejs";

import { getAddress, isAddress } from "viem";
import { verifyAminiIdentity } from "@/lib/auth";
import { uploadBufferToIpfs, isFilebaseConfigured } from "@/lib/filebaseUpload";
import { resolveProfileAvatarUrl, toStoredIpfsRefForDb } from "@/lib/ipfsGatewayUrl";
import { describeProfileSlugRules, isValidProfileSlug } from "@/lib/profileSlug";
import { getSupabaseServiceConfig, supabaseServiceHeaders } from "@/lib/supabaseService";
import type { RequestIdentityFields } from "@/lib/parseRequestIdentity";

const PROFILE_SELECT =
  "wallet,roles,name,email,avatar_url,headline,bio,location,profile_slug,created_at,updated_at";

export type PublicProfile = {
  wallet: string;
  roles: string[] | null;
  name: string | null;
  email: string | null;
  /** Resolved https URL for clients; DB row may store bare IPFS CID only. */
  avatar_url: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
  /** Public path segment: /profile/{profile_slug} */
  profile_slug: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function normalizeWalletParam(raw: string): string | null {
  try {
    if (!isAddress(raw)) return null;
    return getAddress(raw).toLowerCase();
  } catch {
    return null;
  }
}

async function loadProfileRow(
  supabaseUrl: string,
  headers: Record<string, string>,
  wallet: string,
): Promise<PublicProfile | null> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/profiles?wallet=eq.${encodeURIComponent(wallet)}&select=${PROFILE_SELECT}&limit=1`,
    { headers, cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as PublicProfile[];
  const row = rows[0] ?? null;
  if (!row) return null;
  return { ...row, avatar_url: resolveProfileAvatarUrl(row.avatar_url) };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  const { wallet: raw } = await params;
  const wallet = normalizeWalletParam(raw);
  if (!wallet) {
    return Response.json({ ok: false, message: "Invalid wallet address." }, { status: 400 });
  }

  const cfg = getSupabaseServiceConfig();
  if (!cfg) {
    return Response.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }

  const { supabaseUrl, serviceRole } = cfg;
  const res = await fetch(
    `${supabaseUrl}/rest/v1/profiles?wallet=eq.${encodeURIComponent(wallet)}&select=${PROFILE_SELECT}&limit=1`,
    { headers: supabaseServiceHeaders(serviceRole), cache: "no-store" },
  );

  if (!res.ok) {
    const text = await res.text();
    console.error(
      `[GET /api/profiles/${wallet}] Supabase ${res.status}:`,
      text.slice(0, 500),
    );
    return Response.json(
      { ok: false, message: "Supabase query failed: " + text },
      { status: 502 },
    );
  }

  const rows = (await res.json()) as PublicProfile[];
  const row = rows[0] ?? null;
  const profile = row ? { ...row, avatar_url: resolveProfileAvatarUrl(row.avatar_url) } : null;
  return Response.json({ ok: true, profile });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  const { wallet: raw } = await params;
  const wallet = normalizeWalletParam(raw);
  if (!wallet) {
    return Response.json({ ok: false, message: "Invalid wallet address." }, { status: 400 });
  }

  const cfg = getSupabaseServiceConfig();
  if (!cfg) {
    return Response.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }

  const { supabaseUrl, serviceRole } = cfg;
  const headers = supabaseServiceHeaders(serviceRole);
  const ct = req.headers.get("content-type") ?? "";

  let identity: RequestIdentityFields;
  const updates: Record<string, string | null> = {};
  const warnings: string[] = [];

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    identity = {
      cdpAccessToken: (form.get("cdpAccessToken") as string)?.trim(),
      signature: (form.get("signature") as string)?.trim(),
      signatureTimestamp: (form.get("signatureTimestamp") as string)?.trim(),
      txHash: (form.get("txHash") as string)?.trim(),
    };
    if (form.has("name")) updates.name = ((form.get("name") as string) ?? "").trim() || null;
    if (form.has("email")) updates.email = ((form.get("email") as string) ?? "").trim() || null;
    if (form.has("headline")) updates.headline = ((form.get("headline") as string) ?? "").trim() || null;
    if (form.has("bio")) updates.bio = ((form.get("bio") as string) ?? "").trim() || null;
    if (form.has("location")) updates.location = ((form.get("location") as string) ?? "").trim() || null;
    if (form.has("profile_slug")) {
      const ps = ((form.get("profile_slug") as string) ?? "").trim().toLowerCase();
      updates.profile_slug = ps === "" ? null : ps;
    }

    const avatarFile = form.get("avatar") as File | null;
    if (avatarFile && avatarFile.size > 0) {
      if (avatarFile.size > 2 * 1024 * 1024) {
        return Response.json({ ok: false, message: "Avatar too large. Max 2MB." }, { status: 400 });
      }
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(avatarFile.type)) {
        return Response.json(
          { ok: false, message: "Invalid format. Please use JPG, PNG, or WEBP." },
          { status: 400 },
        );
      }
      if (isFilebaseConfigured()) {
        try {
          const buffer = new Uint8Array(await avatarFile.arrayBuffer());
          const result = await uploadBufferToIpfs(
            `profile-avatar-${wallet}-${Date.now()}`,
            buffer,
            avatarFile.type || undefined,
          );
          updates.avatar_url = result.cid;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("Avatar upload error:", e);
          warnings.push(
            `Avatar was not updated: upload failed (${msg}). Other profile fields will still save.`,
          );
        }
      } else {
        const msg =
          "Avatar was not uploaded: Filebase is not configured on the server (set FILEBASE_ACCESS_KEY, FILEBASE_SECRET_KEY, FILEBASE_BUCKET).";
        console.warn("PATCH profile avatar:", msg);
        warnings.push(msg);
      }
    }
  } else if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return Response.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
    }
    identity = {
      cdpAccessToken: typeof body.cdpAccessToken === "string" ? body.cdpAccessToken : undefined,
      signature: typeof body.signature === "string" ? body.signature : undefined,
      signatureTimestamp: typeof body.signatureTimestamp === "string" ? body.signatureTimestamp : undefined,
      txHash: typeof body.txHash === "string" ? body.txHash : undefined,
    };
    const pick = (k: string) => {
      if (!(k in body)) return;
      const v = body[k];
      updates[k] = typeof v === "string" ? (v.trim() || null) : v == null ? null : String(v);
    };
    pick("name");
    pick("email");
    pick("headline");
    pick("bio");
    pick("location");
    pick("avatar_url");
    if ("profile_slug" in body) {
      const v = body.profile_slug;
      if (v == null || (typeof v === "string" && v.trim() === "")) {
        updates.profile_slug = null;
      } else if (typeof v === "string") {
        updates.profile_slug = v.trim().toLowerCase() || null;
      } else {
        updates.profile_slug = String(v).trim().toLowerCase() || null;
      }
    }
  } else {
    return Response.json(
      { ok: false, message: "Content-Type must be application/json or multipart/form-data." },
      { status: 415 },
    );
  }

  const idResult = await verifyAminiIdentity("Update Profile", wallet, {
    cdpAccessToken: identity.cdpAccessToken,
    signature: identity.signature,
    signatureTimestamp: identity.signatureTimestamp,
    txHash: identity.txHash,
  });
  if (!idResult.ok) {
    return Response.json({ ok: false, message: idResult.message }, { status: 401 });
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ ok: false, message: "No fields to update." }, { status: 400 });
  }

  if (Object.prototype.hasOwnProperty.call(updates, "avatar_url")) {
    updates.avatar_url =
      updates.avatar_url == null || updates.avatar_url === ""
        ? null
        : toStoredIpfsRefForDb(updates.avatar_url);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "profile_slug")) {
    const s = updates.profile_slug;
    if (s !== null && s !== "" && !isValidProfileSlug(s)) {
      return Response.json(
        {
          ok: false,
          message: `Invalid public username. ${describeProfileSlugRules()}`,
        },
        { status: 400 },
      );
    }
    if (s === "") updates.profile_slug = null;
  }

  updates.updated_at = new Date().toISOString();

  const upsertRes = await fetch(`${supabaseUrl}/rest/v1/profiles?on_conflict=wallet`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({ wallet, ...updates }),
  });

  if (!upsertRes.ok) {
    const text = await upsertRes.text();
    const lower = text.toLowerCase();
    if (
      lower.includes("duplicate key") &&
      (lower.includes("profile_slug") || lower.includes("idx_profiles_profile_slug"))
    ) {
      return Response.json(
        { ok: false, message: "That public username is already taken." },
        { status: 409 },
      );
    }
    return Response.json(
      { ok: false, message: "Failed to save profile: " + text },
      { status: 502 },
    );
  }

  const upsertRows = (await upsertRes.json()) as PublicProfile[];
  /* Re-read row: upsert `return=representation` can omit columns in some setups; avatar_url must match DB for UI preview. */
  const fromDb = await loadProfileRow(supabaseUrl, headers, wallet);
  const profile =
    fromDb ??
    (upsertRows[0]
      ? {
          ...upsertRows[0],
          avatar_url: resolveProfileAvatarUrl(upsertRows[0].avatar_url),
        }
      : null);
  return Response.json({ ok: true, profile, warnings });
}
