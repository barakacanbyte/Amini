export const runtime = "nodejs";

import { verifyAminiIdentity } from "@/lib/auth";
import { uploadBufferToIpfs, isFilebaseConfigured } from "@/lib/filebaseUpload";
import type { OrganizationPublic, OrgCampaignRow } from "@/lib/organizationTypes";
import { getSupabaseServiceConfig, supabaseServiceHeaders } from "@/lib/supabaseService";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ORG_SELECT =
  "id,wallet,name,description,website_url,country,status,verified_at,official_email,twitter_handle,linkedin_url,ens_name,has_coinbase_verification,logo_url,cover_image_url,tagline,created_at,updated_at";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ ok: false, message: "Invalid organization id." }, { status: 400 });
  }

  const cfg = getSupabaseServiceConfig();
  if (!cfg) {
    return Response.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }

  const { supabaseUrl, serviceRole } = cfg;
  const headers = supabaseServiceHeaders(serviceRole);

  const orgRes = await fetch(
    `${supabaseUrl}/rest/v1/organizations?id=eq.${encodeURIComponent(id)}&select=${ORG_SELECT}&limit=1`,
    { headers, cache: "no-store" },
  );

  if (!orgRes.ok) {
    const text = await orgRes.text();
    return Response.json({ ok: false, message: "Supabase query failed: " + text }, { status: 502 });
  }

  const orgRows = (await orgRes.json()) as OrganizationPublic[];
  const organization = orgRows[0] ?? null;
  if (!organization) {
    return Response.json({ ok: false, message: "Organization not found." }, { status: 404 });
  }

  const campSelect = "id,title,description,image_url,status,target_amount,region,cause";
  const campRes = await fetch(
    `${supabaseUrl}/rest/v1/campaigns?organization_id=eq.${encodeURIComponent(id)}&is_fully_created=eq.true&select=${campSelect}&order=id.desc&limit=50`,
    { headers, cache: "no-store" },
  );

  let campaigns: OrgCampaignRow[] = [];
  if (campRes.ok) {
    campaigns = (await campRes.json()) as OrgCampaignRow[];
  }

  return Response.json({ ok: true, organization, campaigns });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ ok: false, message: "Invalid organization id." }, { status: 400 });
  }

  const cfg = getSupabaseServiceConfig();
  if (!cfg) {
    return Response.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }

  const { supabaseUrl, serviceRole } = cfg;
  const headers = supabaseServiceHeaders(serviceRole);

  const orgRes = await fetch(
    `${supabaseUrl}/rest/v1/organizations?id=eq.${encodeURIComponent(id)}&select=wallet&limit=1`,
    { headers, cache: "no-store" },
  );
  if (!orgRes.ok) {
    const text = await orgRes.text();
    return Response.json({ ok: false, message: "Supabase query failed: " + text }, { status: 502 });
  }
  const orgRows = (await orgRes.json()) as Array<{ wallet: string }>;
  const orgWallet = orgRows[0]?.wallet?.toLowerCase();
  if (!orgWallet) {
    return Response.json({ ok: false, message: "Organization not found." }, { status: 404 });
  }

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return Response.json(
      { ok: false, message: "Content-Type must be multipart/form-data." },
      { status: 415 },
    );
  }

  const form = await req.formData();
  const identity = {
    cdpAccessToken: (form.get("cdpAccessToken") as string)?.trim(),
    signature: (form.get("signature") as string)?.trim(),
    signatureTimestamp: (form.get("signatureTimestamp") as string)?.trim(),
    txHash: (form.get("txHash") as string)?.trim(),
  };

  const idResult = await verifyAminiIdentity("Update Organization", orgWallet, {
    cdpAccessToken: identity.cdpAccessToken,
    signature: identity.signature,
    signatureTimestamp: identity.signatureTimestamp,
    txHash: identity.txHash,
  });
  if (!idResult.ok) {
    return Response.json({ ok: false, message: idResult.message }, { status: 401 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (form.has("name")) {
    const nm = ((form.get("name") as string) ?? "").trim();
    if (nm.length >= 2) updates.name = nm;
  }
  if (form.has("description")) updates.description = ((form.get("description") as string) ?? "").trim() || null;
  if (form.has("tagline")) updates.tagline = ((form.get("tagline") as string) ?? "").trim() || null;
  if (form.has("websiteUrl")) updates.website_url = ((form.get("websiteUrl") as string) ?? "").trim() || null;
  if (form.has("country")) updates.country = ((form.get("country") as string) ?? "").trim() || null;
  if (form.has("twitterHandle")) updates.twitter_handle = ((form.get("twitterHandle") as string) ?? "").trim() || null;
  if (form.has("linkedinUrl")) updates.linkedin_url = ((form.get("linkedinUrl") as string) ?? "").trim() || null;
  if (form.has("ensName")) updates.ens_name = ((form.get("ensName") as string) ?? "").trim() || null;

  const logoFile = form.get("logo") as File | null;
  if (logoFile && logoFile.size > 0) {
    if (logoFile.size > 2 * 1024 * 1024) {
      return Response.json({ ok: false, message: "Logo too large. Max 2MB." }, { status: 400 });
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(logoFile.type)) {
      return Response.json({ ok: false, message: "Invalid logo format." }, { status: 400 });
    }
    if (!isFilebaseConfigured()) {
      return Response.json({ ok: false, message: "File storage not configured." }, { status: 503 });
    }
    const buffer = new Uint8Array(await logoFile.arrayBuffer());
    const result = await uploadBufferToIpfs(
      `org-logo-${orgWallet}-${Date.now()}`,
      buffer,
      logoFile.type || undefined,
    );
    updates.logo_url = result.gatewayUrl;
  }

  const coverFile = form.get("cover") as File | null;
  if (coverFile && coverFile.size > 0) {
    if (coverFile.size > 3 * 1024 * 1024) {
      return Response.json({ ok: false, message: "Cover image too large. Max 3MB." }, { status: 400 });
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(coverFile.type)) {
      return Response.json({ ok: false, message: "Invalid cover format." }, { status: 400 });
    }
    if (!isFilebaseConfigured()) {
      return Response.json({ ok: false, message: "File storage not configured." }, { status: 503 });
    }
    const buffer = new Uint8Array(await coverFile.arrayBuffer());
    const result = await uploadBufferToIpfs(
      `org-cover-${orgWallet}-${Date.now()}`,
      buffer,
      coverFile.type || undefined,
    );
    updates.cover_image_url = result.gatewayUrl;
  }

  const meaningful = { ...updates };
  delete meaningful.updated_at;
  if (Object.keys(meaningful).length === 0) {
    return Response.json({ ok: false, message: "No fields to update." }, { status: 400 });
  }

  const patchRes = await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(updates),
  });

  if (!patchRes.ok) {
    const text = await patchRes.text();
    return Response.json({ ok: false, message: "Failed to update organization: " + text }, { status: 502 });
  }

  const updated = (await patchRes.json()) as OrganizationPublic[];
  return Response.json({ ok: true, organization: updated[0] ?? null });
}
