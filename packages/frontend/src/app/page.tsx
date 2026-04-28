import HomePageContent, { type HomeCampaignCard } from "./HomePageContent";
import { loadCampaignsForExplorer } from "@/lib/loadCampaignsExplorer";
import { formatUsdc } from "@/lib/contracts";

function toCardImage(id: number, imageUrl: string | null | undefined): string {
  const u = imageUrl?.trim();
  if (u && u.length > 0) return u;
  return `https://picsum.photos/seed/amini-campaign-${id}/960/540`;
}

function toCardTag(cause: string | null | undefined): string {
  const c = (cause ?? "").trim();
  if (!c) return "";
  return c.replace(/[-_]/g, " ").toUpperCase();
}

function toCardSummary(
  title: string | null | undefined,
  description: string | null | undefined,
): string {
  const d = description?.trim();
  if (d && d.length > 0) return d;
  const t = title?.trim();
  if (t && t.length > 0) return t;
  return "Milestone-gated campaign with on-chain attestations on Base.";
}

function progressPct(target: string | number | null | undefined, raisedStr: string): number {
  const safeBig = (v: string | number | null | undefined): bigint => {
    if (v == null) return BigInt(0);
    const s = String(v).replace(/,/g, "").trim();
    const whole = s.split(".")[0] ?? "0";
    if (!/^-?\d+$/.test(whole)) return BigInt(0);
    return BigInt(whole);
  };
  const target6 = safeBig(target);
  const raised6 = safeBig(raisedStr);
  if (target6 === BigInt(0)) return 0;
  const p = Number((raised6 * BigInt(1000)) / target6) / 10;
  return Math.min(100, Math.max(0, Math.round(p)));
}

export default async function HomePage() {
  const result = await loadCampaignsForExplorer();

  let campaigns: HomeCampaignCard[] = [];
  if (result.kind === "ok") {
    campaigns = result.rows.slice(0, 2).map((c) => ({
      id: c.id,
      title: c.title?.trim() || `Campaign #${c.id}`,
      summary: toCardSummary(c.title, c.description),
      tag: toCardTag(c.cause),
      progress: progressPct(c.target_amount, c.total_raised),
      raised: `$${formatUsdc(BigInt(c.total_raised || "0"))}`,
      image: toCardImage(c.id, c.image_url),
    }));
  }

  return <HomePageContent campaigns={campaigns} />;
}
