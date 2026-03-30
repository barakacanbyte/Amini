import { randomBytes } from "node:crypto";
import { uploadBufferToIpfs } from "@/lib/filebaseUpload";
import { verifyAminiIdentity } from "@/lib/auth";

export const runtime = "nodejs";

type ImpactRequest = {
  campaignId: number;
  milestoneIndex?: number;
  authorWallet: string;
  body: string;
  txHashLink?: string;
  signature?: string;
  signatureTimestamp?: string;
  txHash?: string;
  cdpAccessToken?: string;
};

type ParsedImpactInput = ImpactRequest & {
  file?: File;
};

function badRequest(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

function objectKey(prefix: string, filename: string) {
  const id = randomBytes(8).toString("hex");
  return `${prefix}/${Date.now()}-${id}-${filename}`;
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    let payload: ParsedImpactInput;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      payload = {
        campaignId: Number(form.get("campaignId")),
        milestoneIndex:
          form.get("milestoneIndex") !== null && String(form.get("milestoneIndex")) !== ""
            ? Number(form.get("milestoneIndex"))
            : undefined,
        authorWallet: String(form.get("authorWallet") ?? ""),
        body: String(form.get("body") ?? ""),
        txHashLink:
          form.get("txHashLink") !== null && String(form.get("txHashLink")) !== ""
            ? String(form.get("txHashLink"))
            : undefined,
        file:
          form.get("file") instanceof File && (form.get("file") as File).size > 0
            ? (form.get("file") as File)
            : undefined,
        signature: String(form.get("signature") ?? ""),
        signatureTimestamp: String(form.get("signatureTimestamp") ?? ""),
        txHash: String(form.get("txHash") ?? ""),
        cdpAccessToken: (() => {
          const t = form.get("cdpAccessToken");
          return typeof t === "string" && t.trim() ? t.trim() : undefined;
        })(),
      };
    } else {
      payload = (await req.json()) as ParsedImpactInput;
    }

    if (!payload?.campaignId || !payload?.authorWallet || !payload?.body) {
      return badRequest("campaignId, authorWallet and body are required");
    }
    if (
      payload.milestoneIndex !== undefined &&
      (!Number.isInteger(payload.milestoneIndex) || payload.milestoneIndex < 0)
    ) {
      return badRequest("milestoneIndex must be a non-negative integer.");
    }
    if (payload.txHashLink && !/^0x[a-fA-F0-9]{64}$/.test(payload.txHashLink)) {
      return badRequest("txHashLink must be a valid 0x tx hash.");
    }

    const idResult = await verifyAminiIdentity("Post Impact Update", payload.authorWallet, {
      cdpAccessToken: payload.cdpAccessToken,
      signature: payload.signature,
      signatureTimestamp: payload.signatureTimestamp,
      txHash: (payload as any).txHash,
    });
    if (!idResult.ok) {
      return badRequest(idResult.message ?? "Identity verification failed", 401);
    }


    let attachmentCid: string | null = null;
    let attachmentUrl: string | null = null;

    if (payload.file) {
      if (payload.file.size > MAX_ATTACHMENT_BYTES) {
        return badRequest("Attachment too large. Max size is 5MB.");
      }
      if (payload.file.type && !ALLOWED_ATTACHMENT_TYPES.has(payload.file.type)) {
        return badRequest(
          "Unsupported attachment type. Allowed: JPEG, PNG, WEBP, PDF, TXT."
        );
      }
      const buffer = Buffer.from(await payload.file.arrayBuffer());
      const ext = payload.file.name?.includes(".")
        ? payload.file.name.slice(payload.file.name.lastIndexOf("."))
        : ".bin";
      const attKey = objectKey(
        `impact/${payload.campaignId}/attachments`,
        `file${ext}`,
      );
      try {
        const att = await uploadBufferToIpfs(attKey, buffer);
        attachmentCid = att.cid;
        attachmentUrl = att.gatewayUrl;
      } catch (e) {
        return badRequest((e as Error).message, 500);
      }
    }

    const data = JSON.stringify({
      campaignId: payload.campaignId,
      milestoneIndex: payload.milestoneIndex ?? null,
      authorWallet: payload.authorWallet,
      body: payload.body,
      txHashLink: payload.txHashLink ?? null,
      attachmentCid,
      attachmentUrl,
      attachmentName: payload.file?.name ?? null,
      attachmentContentType: payload.file?.type ?? null,
      createdAt: new Date().toISOString(),
    });

    const jsonKey = objectKey(`impact/${payload.campaignId}/posts`, "post.json");
    let ipfsCid: string;
    let ipfsUrl: string;
    try {
      const main = await uploadBufferToIpfs(jsonKey, Buffer.from(data, "utf-8"));
      ipfsCid = main.cid;
      ipfsUrl = main.gatewayUrl;
    } catch (e) {
      return badRequest((e as Error).message, 500);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let inserted = false;

    if (supabaseUrl && serviceRole) {
      const dbRes = await fetch(`${supabaseUrl}/rest/v1/impact_posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          campaign_id: payload.campaignId,
          milestone_index: payload.milestoneIndex ?? null,
          author_wallet: payload.authorWallet.toLowerCase(),
          body: payload.body,
          ipfs_cid: ipfsCid,
          ipfs_url: ipfsUrl,
          attachment_cid: attachmentCid,
          attachment_url: attachmentUrl,
          attachment_name: payload.file?.name ?? null,
          attachment_content_type: payload.file?.type ?? null,
          tx_hash_link: payload.txHashLink ?? null,
        }),
      });
      inserted = dbRes.ok;
    }

    return Response.json({
      ok: true,
      ipfsCid,
      ipfsUrl,
      attachmentCid,
      attachmentUrl,
      attachmentName: payload.file?.name ?? null,
      attachmentContentType: payload.file?.type ?? null,
      inserted,
    });
  } catch (error) {
    return Response.json(
      { ok: false, message: (error as Error).message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
