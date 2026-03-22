import Arweave from "arweave";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function err(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

/**
 * POST /api/campaigns/metadata
 *
 * Accepts multipart form data with campaign metadata fields and an optional
 * image file. Uploads both to Arweave and returns the metadata URI + image URL.
 *
 * If Arweave is not configured, returns a deterministic placeholder URI so the
 * on-chain call can still proceed.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const milestonesRaw = String(form.get("milestones") ?? "[]");
    const region = String(form.get("region") ?? "").trim() || null;
    const cause = String(form.get("cause") ?? "").trim() || null;

    if (!title) return err("Title is required.");

    let milestones: Array<{ title: string; amount: string }>;
    try {
      milestones = JSON.parse(milestonesRaw);
    } catch {
      return err("Invalid milestones JSON.");
    }

    const walletJson = process.env.ARWEAVE_WALLET_JSON;
    const arweaveConfigured = Boolean(walletJson);

    let jwk: Record<string, string> | null = null;
    let arweave: Arweave | null = null;

    if (arweaveConfigured) {
      jwk = JSON.parse(walletJson!) as Record<string, string>;
      if (!jwk.kty || !jwk.n || !jwk.e || !jwk.d) {
        return err("Invalid ARWEAVE_WALLET_JSON JWK format.", 500);
      }
      arweave = Arweave.init({
        host: process.env.ARWEAVE_HOST ?? "arweave.net",
        port: Number(process.env.ARWEAVE_PORT ?? 443),
        protocol: process.env.ARWEAVE_PROTOCOL ?? "https",
      });
    }

    const gateway = process.env.ARWEAVE_GATEWAY_URL ?? "https://arweave.net";
    let imageUrl: string | null = null;

    const file =
      form.get("image") instanceof File && (form.get("image") as File).size > 0
        ? (form.get("image") as File)
        : null;

    if (file) {
      if (file.size > MAX_IMAGE_BYTES) {
        return err("Image too large. Max 5 MB.");
      }
      if (file.type && !ALLOWED_IMAGE_TYPES.has(file.type)) {
        return err("Unsupported image type. Use JPEG, PNG, WEBP, or GIF.");
      }

      if (arweave && jwk) {
        const buf = new Uint8Array(await file.arrayBuffer());
        const imgTx = await arweave.createTransaction({ data: buf }, jwk as any);
        imgTx.addTag("Content-Type", file.type || "application/octet-stream");
        imgTx.addTag("App-Name", "Amini");
        imgTx.addTag("Amini-Type", "campaign-image");
        await arweave.transactions.sign(imgTx, jwk as any);
        const imgRes = await arweave.transactions.post(imgTx);
        if (![200, 202].includes(imgRes.status)) {
          return err("Arweave image upload failed (status " + imgRes.status + ").", 502);
        }
        imageUrl = gateway + "/" + imgTx.id;
      }
    }

    const metadata = {
      title,
      description,
      milestones,
      imageUrl,
      region,
      cause,
      createdAt: new Date().toISOString(),
    };

    let metadataUri: string;

    if (arweave && jwk) {
      const metaTx = await arweave.createTransaction(
        { data: JSON.stringify(metadata) },
        jwk as any,
      );
      metaTx.addTag("Content-Type", "application/json");
      metaTx.addTag("App-Name", "Amini");
      metaTx.addTag("Amini-Type", "campaign-metadata");
      await arweave.transactions.sign(metaTx, jwk as any);
      const metaRes = await arweave.transactions.post(metaTx);
      if (![200, 202].includes(metaRes.status)) {
        return err("Arweave metadata upload failed (status " + metaRes.status + ").", 502);
      }
      metadataUri = gateway + "/" + metaTx.id;
    } else {
      metadataUri = "ipfs://amini-" + Date.now();
    }

    return Response.json({
      ok: true,
      metadataUri,
      imageUrl,
      arweaveConfigured,
    });
  } catch (error) {
    return Response.json(
      { ok: false, message: (error as Error).message ?? "Unknown server error" },
      { status: 500 },
    );
  }
}
