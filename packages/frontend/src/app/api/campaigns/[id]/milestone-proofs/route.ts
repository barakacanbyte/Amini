import { randomBytes } from "node:crypto";
import { verifyAminiIdentity } from "@/lib/auth";
import { uploadBufferToIpfs } from "@/lib/filebaseUpload";

export const runtime = "nodejs";

function badRequest(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

function objectKey(prefix: string, filename: string) {
  const id = randomBytes(8).toString("hex");
  return `${prefix}/${Date.now()}-${id}-${filename}`;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isInteger(campaignId) || campaignId < 0) {
    return badRequest("Invalid campaign id");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    return badRequest("Supabase not configured", 500);
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/milestone_proofs?campaign_id=eq.${campaignId}&order=milestone_index.asc,created_at.desc`,
    {
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
    },
  );
  if (!res.ok) {
    return badRequest("Failed to fetch proofs", 500);
  }
  const proofs = await res.json();
  return Response.json({ ok: true, proofs });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isInteger(campaignId) || campaignId < 0) {
    return badRequest("Invalid campaign id");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    return badRequest("Supabase not configured", 500);
  }

  const contentType = req.headers.get("content-type") ?? "";
  let submitterWallet: string;
  let milestoneIndex: number;
  let title: string;
  let description: string;
  let signature: string | undefined;
  let signatureTimestamp: string | undefined;
  let cdpAccessToken: string | undefined;
  const files: File[] = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    submitterWallet = String(form.get("submitterWallet") ?? "");
    milestoneIndex = Number(form.get("milestoneIndex") ?? -1);
    title = String(form.get("title") ?? "");
    description = String(form.get("description") ?? "");
    signature = String(form.get("signature") ?? "") || undefined;
    signatureTimestamp = String(form.get("signatureTimestamp") ?? "") || undefined;
    const cdp = form.get("cdpAccessToken");
    cdpAccessToken = typeof cdp === "string" && cdp.trim() ? cdp.trim() : undefined;

    for (const [, v] of form.entries()) {
      if (v instanceof File && v.size > 0) files.push(v);
    }
  } else {
    const body = await req.json();
    submitterWallet = body.submitterWallet ?? "";
    milestoneIndex = Number(body.milestoneIndex ?? -1);
    title = body.title ?? "";
    description = body.description ?? "";
    signature = body.signature || undefined;
    signatureTimestamp = body.signatureTimestamp || undefined;
    cdpAccessToken = body.cdpAccessToken || undefined;
  }

  if (!submitterWallet) return badRequest("submitterWallet is required");
  if (!Number.isInteger(milestoneIndex) || milestoneIndex < 0) {
    return badRequest("milestoneIndex must be a non-negative integer");
  }
  if (!title.trim()) return badRequest("title is required");
  if (!description.trim()) return badRequest("description is required");

  const idResult = await verifyAminiIdentity(
    "Submit Milestone Proof",
    submitterWallet,
    { cdpAccessToken, signature, signatureTimestamp },
  );
  if (!idResult.ok) {
    return badRequest(idResult.message ?? "Identity verification failed", 401);
  }

  // Verify submitter owns the campaign (is the campaign owner or org wallet)
  const campRes = await fetch(
    `${supabaseUrl}/rest/v1/campaigns?id=eq.${campaignId}&select=owner,organization_id&limit=1`,
    {
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
    },
  );
  if (!campRes.ok) return badRequest("Failed to verify campaign ownership", 500);
  const camps = (await campRes.json()) as Array<{
    owner: string;
    organization_id: string | null;
  }>;
  if (camps.length === 0) return badRequest("Campaign not found", 404);

  const camp = camps[0];
  let authorized = camp.owner.toLowerCase() === submitterWallet.toLowerCase();

  if (!authorized && camp.organization_id) {
    const orgRes = await fetch(
      `${supabaseUrl}/rest/v1/organizations?id=eq.${camp.organization_id}&select=wallet&limit=1`,
      {
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
        },
      },
    );
    if (orgRes.ok) {
      const orgs = (await orgRes.json()) as Array<{ wallet: string }>;
      if (
        orgs.length > 0 &&
        orgs[0].wallet.toLowerCase() === submitterWallet.toLowerCase()
      ) {
        authorized = true;
      }
    }
  }

  if (!authorized) {
    return badRequest("Only the campaign owner or organization can submit proofs", 403);
  }

  // Upload evidence files to IPFS
  const evidenceUrls: string[] = [];
  let ipfsCid: string | null = null;
  let ipfsUrl: string | null = null;

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return badRequest(`File ${file.name} exceeds 5MB limit`);
    }
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return badRequest(`Unsupported file type: ${file.type}`);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name?.includes(".")
      ? file.name.slice(file.name.lastIndexOf("."))
      : ".bin";
    const key = objectKey(
      `proofs/${campaignId}/m${milestoneIndex}`,
      `evidence${ext}`,
    );
    try {
      const result = await uploadBufferToIpfs(key, buffer, file.type || undefined);
      evidenceUrls.push(result.gatewayUrl);
      if (!ipfsCid) {
        ipfsCid = result.cid;
        ipfsUrl = result.gatewayUrl;
      }
    } catch (e) {
      return badRequest(`Failed to upload ${file.name}: ${(e as Error).message}`, 500);
    }
  }

  // Also upload the proof metadata as JSON to IPFS
  const proofJson = JSON.stringify({
    campaignId,
    milestoneIndex,
    title: title.trim(),
    description: description.trim(),
    evidenceUrls,
    submitterWallet: submitterWallet.toLowerCase(),
    submittedAt: new Date().toISOString(),
  });
  try {
    const jsonKey = objectKey(
      `proofs/${campaignId}/m${milestoneIndex}`,
      "proof.json",
    );
    const meta = await uploadBufferToIpfs(
      jsonKey,
      Buffer.from(proofJson, "utf-8"),
      "application/json; charset=utf-8",
    );
    ipfsCid = meta.cid;
    ipfsUrl = meta.gatewayUrl;
  } catch {
    // Non-fatal: proof still saved to DB without IPFS metadata
  }

  // Insert into milestone_proofs
  const dbRes = await fetch(`${supabaseUrl}/rest/v1/milestone_proofs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      campaign_id: campaignId,
      milestone_index: milestoneIndex,
      submitter_wallet: submitterWallet.toLowerCase(),
      title: title.trim(),
      description: description.trim(),
      evidence_urls: evidenceUrls,
      ipfs_cid: ipfsCid,
      ipfs_url: ipfsUrl,
      status: "submitted",
    }),
  });

  if (!dbRes.ok) {
    const err = await dbRes.text();
    return badRequest(`Failed to save proof: ${err}`, 500);
  }

  const inserted = (await dbRes.json()) as Array<Record<string, unknown>>;
  return Response.json({ ok: true, proof: inserted[0] ?? null });
}
