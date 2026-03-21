import Arweave from "arweave";

export const runtime = "nodejs";

type ImpactRequest = {
  campaignId: number;
  milestoneIndex?: number;
  authorWallet: string;
  body: string;
  txHashLink?: string;
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

    const walletJson = process.env.ARWEAVE_WALLET_JSON;
    if (!walletJson) {
      return badRequest(
        "ARWEAVE_WALLET_JSON is not configured. Add Arweave wallet JWK JSON in env.",
        500
      );
    }

    const jwk = JSON.parse(walletJson) as {
      kty: string;
      e: string;
      n: string;
      d: string;
      p: string;
      q: string;
      dp: string;
      dq: string;
      qi: string;
    };
    if (!jwk.kty || !jwk.n || !jwk.e || !jwk.d) {
      return badRequest("Invalid ARWEAVE_WALLET_JSON JWK format.", 500);
    }
    const arweave = Arweave.init({
      host: process.env.ARWEAVE_HOST ?? "arweave.net",
      port: Number(process.env.ARWEAVE_PORT ?? 443),
      protocol: process.env.ARWEAVE_PROTOCOL ?? "https",
    });

    let attachmentTxId: string | null = null;
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
      const buffer = await payload.file.arrayBuffer();
      const binaryTx = await arweave.createTransaction(
        { data: new Uint8Array(buffer) },
        jwk
      );
      binaryTx.addTag(
        "Content-Type",
        payload.file.type || "application/octet-stream"
      );
      binaryTx.addTag("App-Name", "Amini");
      binaryTx.addTag("App-Version", "0.1.0");
      binaryTx.addTag("Amini-Campaign-Id", String(payload.campaignId));
      binaryTx.addTag("Amini-Attachment", "true");
      await arweave.transactions.sign(binaryTx, jwk);
      const binaryPostRes = await arweave.transactions.post(binaryTx);
      if (![200, 202].includes(binaryPostRes.status)) {
        return badRequest(
          `Arweave attachment upload failed with status ${binaryPostRes.status}`,
          502
        );
      }
      attachmentTxId = binaryTx.id;
      attachmentUrl = `${process.env.ARWEAVE_GATEWAY_URL ?? "https://arweave.net"}/${binaryTx.id}`;
    }

    const data = JSON.stringify({
      campaignId: payload.campaignId,
      milestoneIndex: payload.milestoneIndex ?? null,
      authorWallet: payload.authorWallet,
      body: payload.body,
      txHashLink: payload.txHashLink ?? null,
      attachmentTxId,
      attachmentUrl,
      attachmentName: payload.file?.name ?? null,
      attachmentContentType: payload.file?.type ?? null,
      createdAt: new Date().toISOString(),
    });

    const tx = await arweave.createTransaction({ data }, jwk);
    tx.addTag("Content-Type", "application/json");
    tx.addTag("App-Name", "Amini");
    tx.addTag("App-Version", "0.1.0");
    tx.addTag("Amini-Campaign-Id", String(payload.campaignId));
    if (payload.milestoneIndex !== undefined) {
      tx.addTag("Amini-Milestone-Index", String(payload.milestoneIndex));
    }

    await arweave.transactions.sign(tx, jwk);
    const postRes = await arweave.transactions.post(tx);
    if (![200, 202].includes(postRes.status)) {
      return badRequest(`Arweave upload failed with status ${postRes.status}`, 502);
    }

    const gateway = process.env.ARWEAVE_GATEWAY_URL ?? "https://arweave.net";
    const arweaveUrl = `${gateway}/${tx.id}`;

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
          arweave_tx_id: tx.id,
          arweave_url: arweaveUrl,
          attachment_tx_id: attachmentTxId,
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
      arweaveTxId: tx.id,
      arweaveUrl,
      attachmentTxId,
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

