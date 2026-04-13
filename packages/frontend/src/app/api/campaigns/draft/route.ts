export const runtime = "nodejs";

import { verifyAminiIdentity } from "@/lib/auth";
import { parseUsdc, formatUsdc } from "@/lib/contracts";
import { BASE_SEPOLIA_CHAIN_ID } from "@amini/shared";

function err(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

/** Mirrors client `DraftData` + optional cover image data URL */
export type CampaignDraftPayload = {
  title?: string;
  description?: string;
  beneficiaryDescription?: string;
  contactEmail?: string;
  socialLinks?: { label: string; url: string }[];
  impactMetrics?: { name: string; target: string; timeframe?: string }[];
  targetAmount?: string;
  deadline?: string;
  region?: string;
  stateLoc?: string;
  tags?: string[];
  milestones?: { title: string; description: string; amount: string }[];
  attestationService?: string;
  permanentStorage?: boolean;
  currentStep?: number;
  imagePreview?: string | null;
};

type DraftRequest = {
  action: "get" | "save" | "delete";
  wallet: string;
  organizationId?: string | null;
  draft?: CampaignDraftPayload;
  cdpAccessToken?: string;
  signature?: string;
  signatureTimestamp?: string;
};

const MAX_DRAFT_BYTES = 2_000_000;

type DraftDbRow = {
  id: number;
  title: string | null;
  description: string | null;
  beneficiary_description: string | null;
  contact_email: string | null;
  region: string | null;
  tags: string[] | null;
  deadline: string | null;
  target_amount: string | number | null;
  milestone_count: number;
  milestone_data: unknown;
  social_links: unknown;
  impact_metrics: unknown;
  organization_id: string | null;
  draft_payload: Record<string, unknown> | null;
};

async function nextDraftLocalId(
  supabaseUrl: string,
  headers: Record<string, string>,
): Promise<bigint> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/next_campaign_draft_local_id`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error("next_campaign_draft_local_id failed: " + text);
  }
  const data = (await res.json()) as unknown;
  if (typeof data === "number") return BigInt(data);
  if (typeof data === "string" && /^-?\d+$/.test(data)) return BigInt(data);
  if (Array.isArray(data) && data.length > 0) {
    const v = data[0];
    if (typeof v === "number") return BigInt(v);
    if (v && typeof v === "object" && "next_campaign_draft_local_id" in v) {
      const n = (v as { next_campaign_draft_local_id: number }).next_campaign_draft_local_id;
      return BigInt(n);
    }
  }
  if (data && typeof data === "object" && "next_campaign_draft_local_id" in data) {
    const n = (data as { next_campaign_draft_local_id: number }).next_campaign_draft_local_id;
    return BigInt(n);
  }
  throw new Error("Unexpected RPC response for draft id");
}

function targetAmountToFormString(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") return "";
  const s = typeof raw === "number" ? String(Math.trunc(raw)) : String(raw).split(".")[0];
  try {
    return formatUsdc(BigInt(s));
  } catch {
    return "";
  }
}

function normalizeImpactMetricsFromDb(raw: unknown): CampaignDraftPayload["impactMetrics"] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((item) => {
    const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      name: typeof o.name === "string" ? o.name : "",
      target: typeof o.target === "string" ? o.target : "",
      timeframe: typeof o.timeframe === "string" ? o.timeframe : "",
    };
  });
}

function sanitizeImpactMetricsForDb(
  metrics: CampaignDraftPayload["impactMetrics"] | undefined,
): CampaignDraftPayload["impactMetrics"] | null {
  if (!metrics?.length) return null;
  const filtered = metrics.filter((m) => (m.name?.trim() ?? "") || (m.target?.trim() ?? ""));
  return filtered.length ? filtered : null;
}

function campaignRowToDraftPayload(row: DraftDbRow): CampaignDraftPayload {
  const dp = row.draft_payload || {};
  return {
    title: row.title ?? "",
    description: row.description ?? "",
    beneficiaryDescription: row.beneficiary_description ?? "",
    contactEmail: row.contact_email ?? "",
    socialLinks: Array.isArray(row.social_links) ? (row.social_links as CampaignDraftPayload["socialLinks"]) : [],
    impactMetrics: normalizeImpactMetricsFromDb(row.impact_metrics),
    targetAmount: targetAmountToFormString(row.target_amount),
    deadline: row.deadline ? String(row.deadline).slice(0, 10) : "",
    region: row.region ?? "",
    stateLoc: typeof dp.stateLoc === "string" ? dp.stateLoc : "",
    tags: Array.isArray(row.tags) ? row.tags : [],
    milestones: Array.isArray(row.milestone_data)
      ? (row.milestone_data as CampaignDraftPayload["milestones"])
      : [{ title: "", description: "", amount: "" }],
    attestationService: typeof dp.attestationService === "string" ? dp.attestationService : "",
    permanentStorage: typeof dp.permanentStorage === "boolean" ? dp.permanentStorage : true,
    currentStep: typeof dp.currentStep === "number" ? dp.currentStep : 1,
    imagePreview: typeof dp.imagePreview === "string" ? dp.imagePreview : null,
  };
}

function buildDraftPayloadJson(draft: CampaignDraftPayload): Record<string, unknown> {
  return {
    stateLoc: draft.stateLoc ?? "",
    attestationService: draft.attestationService ?? "",
    permanentStorage: draft.permanentStorage ?? true,
    currentStep: draft.currentStep ?? 1,
    imagePreview: draft.imagePreview ?? null,
  };
}

function draftToCampaignRow(
  wallet: string,
  organizationId: string | null | undefined,
  draft: CampaignDraftPayload,
  draftId: bigint | null,
): Record<string, unknown> {
  const milestones = draft.milestones ?? [];
  let targetAmountRaw = "0";
  try {
    targetAmountRaw = parseUsdc((draft.targetAmount || "").trim() || "0").toString();
  } catch {
    targetAmountRaw = "0";
  }

  const draft_payload = buildDraftPayloadJson(draft);
  const row: Record<string, unknown> = {
    chain_id: BASE_SEPOLIA_CHAIN_ID,
    owner: wallet,
    beneficiary: wallet,
    target_amount: targetAmountRaw,
    milestone_count: milestones.length,
    milestone_data: milestones.length ? milestones : null,
    title: draft.title?.trim() || null,
    description: draft.description?.trim() || null,
    region: draft.region?.trim() || null,
    tags: draft.tags?.length ? draft.tags : null,
    deadline: draft.deadline?.trim() || null,
    contact_email: draft.contactEmail?.trim() || null,
    beneficiary_description: draft.beneficiaryDescription?.trim() || null,
    social_links: draft.socialLinks?.length ? draft.socialLinks : null,
    impact_metrics: sanitizeImpactMetricsForDb(draft.impactMetrics),
    organization_id: organizationId || null,
    metadata_uri: null,
    created_tx_hash: null,
    created_block: null,
    is_fully_created: false,
    status: "draft",
    draft_payload,
  };
  if (draftId !== null) {
    row.id = Number(draftId);
  }
  return row;
}

/**
 * POST /api/campaigns/draft
 *
 * Load, save, or delete the authenticated user's in-progress campaign row (`is_fully_created = false`).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as DraftRequest;
    const wallet = body.wallet?.toLowerCase()?.trim();
    if (!wallet) {
      return err("wallet is required.");
    }
    if (!["get", "save", "delete"].includes(body.action)) {
      return err("action must be get, save, or delete.");
    }

    const idResult = await verifyAminiIdentity("Campaign Draft", wallet, {
      cdpAccessToken: body.cdpAccessToken?.trim(),
      signature: body.signature,
      signatureTimestamp: body.signatureTimestamp,
    });
    if (!idResult.ok) {
      return err(idResult.message ?? "Identity verification failed", 401);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRole) {
      return err(
        "Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        500,
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: serviceRole,
      Authorization: "Bearer " + serviceRole,
    };

    const campaignsUrl = `${supabaseUrl}/rest/v1/campaigns`;
    const draftSelect =
      "id,title,description,beneficiary_description,contact_email,region,tags,deadline,target_amount,milestone_count,milestone_data,social_links,impact_metrics,organization_id,draft_payload";

    if (body.action === "get") {
      const res = await fetch(
        `${campaignsUrl}?owner=eq.${encodeURIComponent(wallet)}&is_fully_created=eq.false&select=${draftSelect}&limit=1`,
        { headers },
      );
      if (!res.ok) {
        const text = await res.text();
        return err("Supabase query failed: " + text, 502);
      }
      const rows = (await res.json()) as DraftDbRow[];
      if (rows.length === 0) {
        return Response.json({ ok: true, draft: null, draftRowId: null });
      }
      const row = rows[0];
      return Response.json({
        ok: true,
        draft: campaignRowToDraftPayload(row),
        draftRowId: row.id,
      });
    }

    if (body.action === "delete") {
      const res = await fetch(
        `${campaignsUrl}?owner=eq.${encodeURIComponent(wallet)}&is_fully_created=eq.false`,
        { method: "DELETE", headers },
      );
      if (!res.ok && res.status !== 404) {
        const text = await res.text();
        return err("Supabase delete failed: " + text, 502);
      }
      return Response.json({ ok: true });
    }

    /* save */
    if (!body.draft || typeof body.draft !== "object") {
      return err("draft object is required for save.");
    }

    const rowData = draftToCampaignRow(
      wallet,
      body.organizationId ?? null,
      body.draft,
      null,
    );
    const sizeCheck = JSON.stringify(rowData);
    if (sizeCheck.length > MAX_DRAFT_BYTES) {
      return err(
        `Draft is too large (max ${MAX_DRAFT_BYTES} characters). Remove or shrink the cover image.`,
      );
    }

    const existingRes = await fetch(
      `${campaignsUrl}?owner=eq.${encodeURIComponent(wallet)}&is_fully_created=eq.false&select=id&limit=1`,
      { headers },
    );
    if (!existingRes.ok) {
      const text = await existingRes.text();
      return err("Supabase query failed: " + text, 502);
    }
    const existing = (await existingRes.json()) as Array<{ id: number }>;

    if (existing.length > 0) {
      const patchBody = { ...rowData };
      delete patchBody.id;
      const patchRes = await fetch(`${campaignsUrl}?id=eq.${existing[0].id}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify(patchBody),
      });
      if (!patchRes.ok) {
        const text = await patchRes.text();
        return err("Supabase patch failed: " + text, 502);
      }
      const updated = await patchRes.json();
      return Response.json({
        ok: true,
        draftRowId: existing[0].id,
        row: Array.isArray(updated) ? updated[0] : updated,
      });
    }

    const newId = await nextDraftLocalId(supabaseUrl, headers);
    const insertRow = draftToCampaignRow(wallet, body.organizationId ?? null, body.draft, newId);
    const insertRes = await fetch(campaignsUrl, {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify(insertRow),
    });
    if (!insertRes.ok) {
      const text = await insertRes.text();
      return err("Supabase insert failed: " + text, 502);
    }
    const inserted = await insertRes.json();
    const ins = Array.isArray(inserted) ? inserted[0] : inserted;
    return Response.json({
      ok: true,
      draftRowId: (ins as { id: number }).id,
      row: ins,
    });
  } catch (error) {
    return Response.json(
      { ok: false, message: (error as Error).message ?? "Unknown server error" },
      { status: 500 },
    );
  }
}
