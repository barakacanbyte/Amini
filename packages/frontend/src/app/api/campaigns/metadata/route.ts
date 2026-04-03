import { uploadBufferToIpfs, isFilebaseConfigured } from "@/lib/filebaseUpload";

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
 * image file. Uploads both via Filebase IPFS and returns the metadata IPFS URI + image URL.
 *
 * If Filebase is not configured, returns a deterministic placeholder URI so the
 * on-chain call can still proceed.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const milestonesRaw = String(form.get("milestones") ?? "[]");
    const region = String(form.get("region") ?? "").trim() || null;
    const tagsRaw = String(form.get("tags") ?? "").trim();
    const deadline = String(form.get("deadline") ?? "").trim() || null;
    const beneficiaryDescription = String(form.get("beneficiaryDescription") ?? "").trim() || null;
    const contactEmail = String(form.get("contactEmail") ?? "").trim() || null;
    const socialLinksRaw = String(form.get("socialLinks") ?? "").trim();
    const impactMetricsRaw = String(form.get("impactMetrics") ?? "").trim();

    if (!title) return err("Title is required.");

    let milestones: Array<{ title: string; description?: string; amount: string }>;
    try {
      milestones = JSON.parse(milestonesRaw);
    } catch {
      return err("Invalid milestones JSON.");
    }

    let tags: string[] = [];
    if (tagsRaw) {
      try { tags = JSON.parse(tagsRaw); } catch { /* ignore */ }
    }

    let socialLinks: Array<{ label: string; url: string }> = [];
    if (socialLinksRaw) {
      try { socialLinks = JSON.parse(socialLinksRaw); } catch { /* ignore */ }
    }

    let impactMetrics: Array<{ name: string; target: string; timeframe?: string }> = [];
    if (impactMetricsRaw) {
      try { impactMetrics = JSON.parse(impactMetricsRaw); } catch { /* ignore */ }
    }

    const filebaseConfigured = isFilebaseConfigured();
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

      if (filebaseConfigured) {
        try {
          const buf = new Uint8Array(await file.arrayBuffer());
          const result = await uploadBufferToIpfs(`campaign-image-${Date.now()}`, buf);
          imageUrl = result.gatewayUrl;
        } catch (uploadErr) {
          return err("Image upload failed: " + (uploadErr as Error).message, 502);
        }
      }
    }

    const metadata: Record<string, unknown> = {
      title,
      description,
      milestones,
      imageUrl,
      region,
      tags,
      deadline,
      beneficiaryDescription,
      contactEmail,
      socialLinks,
      impactMetrics,
      createdAt: new Date().toISOString(),
    };

    // Remove null/empty values for cleaner metadata
    for (const key of Object.keys(metadata)) {
      const val = metadata[key];
      if (val === null || val === undefined || val === "" || (Array.isArray(val) && val.length === 0)) {
        delete metadata[key];
      }
    }

    let metadataUri: string;

    if (filebaseConfigured) {
      try {
        const metaJson = JSON.stringify(metadata);
        const metaBuf = new TextEncoder().encode(metaJson);
        const result = await uploadBufferToIpfs(`campaign-metadata-${Date.now()}`, metaBuf);
        metadataUri = result.ipfsUri;
      } catch (uploadErr) {
        return err("Metadata upload failed: " + (uploadErr as Error).message, 502);
      }
    } else {
      metadataUri = "ipfs://amini-" + Date.now();
    }

    return Response.json({
      ok: true,
      metadataUri,
      imageUrl,
      filebaseConfigured,
    });
  } catch (error) {
    return Response.json(
      { ok: false, message: (error as Error).message ?? "Unknown server error" },
      { status: 500 },
    );
  }
}
