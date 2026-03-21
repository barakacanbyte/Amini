"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { TextTitle3 } from "@coinbase/cds-web/typography/TextTitle3";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { TextCaption } from "@coinbase/cds-web/typography/TextCaption";
import { TextLabel2 } from "@coinbase/cds-web/typography/TextLabel2";
import { Tag } from "@coinbase/cds-web/tag/Tag";
import { ProgressBar } from "@coinbase/cds-web/visualizations/ProgressBar";
import { formatUsdc } from "@/lib/contracts";

export type CampaignRow = {
  id: number;
  owner: string;
  beneficiary: string;
  target_amount: string;
  milestone_count: number;
  metadata_uri: string | null;
  created_at: string;
};

export type CampaignExplorerRow = CampaignRow & {
  total_raised: string;
  attested_releases: number;
};

const PAGE_SIZE = 6;

const REGION_FILTERS: { value: string; label: string; keywords: string[] }[] = [
  { value: "all", label: "All regions", keywords: [] },
  { value: "africa", label: "Sub-Saharan Africa", keywords: ["africa", "sahel", "senegal", "kenya", "namib"] },
  { value: "asia", label: "Southeast Asia", keywords: ["asia", "java", "indonesia", "vietnam", "thailand"] },
  {
    value: "americas",
    label: "Latin America",
    keywords: ["latin", "peru", "amazon", "brazil", "mexico", "andean"],
  },
];

const CAUSE_FILTERS: { value: string; label: string; keywords: string[] }[] = [
  { value: "all", label: "All causes", keywords: [] },
  { value: "forest", label: "Reforestation", keywords: ["forest", "tree", "green", "carbon", "amazon", "lidar"] },
  { value: "water", label: "Water infrastructure", keywords: ["water", "well", "aquifer", "groundwater"] },
  { value: "education", label: "Digital literacy", keywords: ["school", "education", "digital", "literacy", "hub"] },
];

const URGENCY_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Standard" },
  { value: "high", label: "High priority" },
  { value: "critical", label: "Critical" },
];

function campaignTitle(c: CampaignExplorerRow): string {
  const m = c.metadata_uri?.trim();
  if (m && m.length > 0 && !m.startsWith("ipfs://amini-")) {
    const short = m.replace(/^ipfs:\/\//, "").slice(0, 48);
    return short.length > 40 ? `${short}…` : short;
  }
  return `Campaign ${c.id}`;
}

function campaignDescription(c: CampaignExplorerRow): string {
  const m = (c.metadata_uri ?? "").toLowerCase();
  if (m.length > 12) {
    return `${c.milestone_count} milestone${c.milestone_count === 1 ? "" : "s"} · indexed on-chain · ${c.beneficiary.slice(0, 8)}…`;
  }
  return `Milestone-based USDC campaign with transparent releases. Beneficiary ${c.beneficiary.slice(0, 10)}…`;
}

function matchesKeywords(haystack: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  return keywords.some((k) => haystack.includes(k));
}

function urgencyBucket(c: CampaignExplorerRow): "standard" | "high" | "critical" {
  const target = safeBigInt(c.target_amount);
  const raised = safeBigInt(c.total_raised);
  if (target === BigInt(0)) return "standard";
  const pct = Number((raised * BigInt(100)) / target);
  if (pct >= 90) return "critical";
  if (pct >= 50) return "high";
  return "standard";
}

function safeBigInt(s: string): bigint {
  try {
    const n = s.split(".")[0] ?? "0";
    return BigInt(n || "0");
  } catch {
    return BigInt(0);
  }
}

function progressPercent(c: CampaignExplorerRow): number {
  const target = safeBigInt(c.target_amount);
  const raised = safeBigInt(c.total_raised);
  if (target === BigInt(0)) return 0;
  const p = Number((raised * BigInt(100)) / target);
  return Math.min(100, Math.max(0, Math.round(p)));
}

function imageSrc(id: number): string {
  return `https://picsum.photos/seed/amini-campaign-${id}/640/256`;
}

export function CampaignExplorerClient({ campaigns }: { campaigns: CampaignExplorerRow[] }) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("all");
  const [cause, setCause] = useState("all");
  const [urgency, setUrgency] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const regionCfg = REGION_FILTERS.find((r) => r.value === region) ?? REGION_FILTERS[0];
    const causeCfg = CAUSE_FILTERS.find((c) => c.value === cause) ?? CAUSE_FILTERS[0];

    return campaigns.filter((c) => {
      const blob = [String(c.id), c.owner, c.beneficiary, c.metadata_uri ?? ""].join(" ").toLowerCase();
      if (q && !blob.includes(q)) return false;

      const meta = (c.metadata_uri ?? "").toLowerCase();
      const title = campaignTitle(c).toLowerCase();
      const hay = `${meta} ${title} ${String(c.id)}`;
      if (region !== "all" && !matchesKeywords(hay, regionCfg.keywords)) return false;
      if (cause !== "all" && !matchesKeywords(hay, causeCfg.keywords)) return false;

      if (urgency !== "all") {
        const u = urgencyBucket(c);
        if (urgency === "high" && u !== "high" && u !== "critical") return false;
        if (urgency === "critical" && u !== "critical") return false;
      }
      return true;
    });
  }, [campaigns, query, region, cause, urgency]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const safePage = Math.min(page, pageCount);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <>
      {/* Filter bar */}
      <div className="app-surface-elev mt-10 flex flex-wrap items-end gap-4 rounded-xl p-6">
        <div className="min-w-[240px] flex-1">
          <TextLabel2 as="label" className="app-muted mb-2 block uppercase tracking-widest">
            Search campaigns
          </TextLabel2>
          <div className="relative">
            <span className="app-muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              <IconSearch className="h-5 w-5" />
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="ID, wallet, or metadata…"
              className="input-field pl-10"
            />
          </div>
        </div>
        <div className="w-full min-w-[160px] sm:w-auto">
          <TextLabel2 as="label" className="app-muted mb-2 block uppercase tracking-widest">
            Region
          </TextLabel2>
          <select
            value={region}
            onChange={(e) => { setRegion(e.target.value); setPage(1); }}
            className="input-field w-full sm:w-auto"
          >
            {REGION_FILTERS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="w-full min-w-[160px] sm:w-auto">
          <TextLabel2 as="label" className="app-muted mb-2 block uppercase tracking-widest">
            Cause
          </TextLabel2>
          <select
            value={cause}
            onChange={(e) => { setCause(e.target.value); setPage(1); }}
            className="input-field w-full sm:w-auto"
          >
            {CAUSE_FILTERS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="w-full min-w-[160px] sm:w-auto">
          <TextLabel2 as="label" className="app-muted mb-2 block uppercase tracking-widest">
            Urgency
          </TextLabel2>
          <select
            value={urgency}
            onChange={(e) => { setUrgency(e.target.value); setPage(1); }}
            className="input-field w-full sm:w-auto"
          >
            {URGENCY_FILTERS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="app-surface-elev mt-10 rounded-xl p-8 text-center">
          <TextBody as="p" className="app-muted">
            No campaigns match your filters. Try clearing search or choosing &quot;All&quot;.
          </TextBody>
        </div>
      ) : (
        <>
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {slice.map((c) => {
              const pct = progressPercent(c);
              const raised = safeBigInt(c.total_raised);
              const target = safeBigInt(c.target_amount);
              const verified = c.attested_releases > 0;
              const disbursedLabel =
                raised > BigInt(0) ? `${formatCompactUsdc(raised)}` : "—";

              return (
                <article
                  key={c.id}
                  className="app-surface-elev group flex flex-col overflow-hidden rounded-xl shadow-xl transition-all hover:shadow-2xl"
                >
                  <div className="relative h-48 overflow-hidden bg-[var(--ui-surface)]">
                    <Image
                      src={imageSrc(c.id)}
                      alt=""
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                    <div className="absolute left-4 top-4">
                      <Tag colorScheme="green" emphasis="high">
                        {verified ? "Attested" : "Live"}
                      </Tag>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <TextTitle3 as="h3" className="app-text leading-tight tracking-tight">
                        {campaignTitle(c)}
                      </TextTitle3>
                      <div className="shrink-0 text-right">
                        <TextCaption as="span" className="app-muted block uppercase tracking-tighter">
                          Raised
                        </TextCaption>
                        <span className="app-text font-mono text-lg font-bold tabular-nums">
                          {disbursedLabel}
                        </span>
                      </div>
                    </div>
                    <TextBody as="p" className="app-muted mb-6 line-clamp-2">
                      {campaignDescription(c)}
                    </TextBody>
                    <div className="mt-auto">
                      <div className="mb-2 flex justify-between text-xs font-bold">
                        <TextCaption as="span" className="app-muted uppercase">Funding goal</TextCaption>
                        <TextCaption as="span" className="app-text">{pct}% complete</TextCaption>
                      </div>
                      <ProgressBar
                        progress={pct / 100}
                        accessibilityLabel={`${pct}% funded`}
                        className="mb-6"
                      />
                      <div className="flex items-center justify-between border-t border-[var(--ui-border)] pt-4">
                        <div className="flex items-center gap-2">
                          <IconVerified className="brand-green h-4 w-4" />
                          <TextCaption as="span" className="app-text uppercase tracking-widest">
                            {verified ? "EAS attested release" : `${c.milestone_count} milestones`}
                          </TextCaption>
                        </div>
                        <Button
                          as={Link}
                          href={`/campaigns/${c.id}`}
                          variant="secondary"
                          compact
                          transparent
                        >
                          View →
                        </Button>
                      </div>
                      <TextCaption as="p" className="app-muted mt-2">
                        Goal {formatUsdc(target)} USDC · {new Date(c.created_at).toLocaleDateString()}
                      </TextCaption>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <Pagination page={safePage} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}
    </>
  );
}

function formatCompactUsdc(raw: bigint): string {
  const s = formatUsdc(raw);
  const num = Number.parseFloat(s);
  if (!Number.isFinite(num)) return s;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return s;
}

function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (p: number) => void;
}) {
  const pages = useMemo(() => {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
    const out: (number | "ellipsis")[] = [];
    if (page <= 3) {
      for (let i = 1; i <= Math.min(5, pageCount); i++) out.push(i);
      if (pageCount > 5) {
        out.push("ellipsis");
        out.push(pageCount);
      }
    } else if (page >= pageCount - 2) {
      out.push(1);
      out.push("ellipsis");
      for (let i = pageCount - 4; i <= pageCount; i++) if (i > 1) out.push(i);
    } else {
      out.push(1, "ellipsis", page - 1, page, page + 1, "ellipsis", pageCount);
    }
    return out;
  }, [page, pageCount]);

  return (
    <div className="mt-16 flex items-center justify-center gap-2">
      <Button
        variant="secondary"
        compact
        transparent
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        accessibilityLabel="Previous page"
      >
        ‹
      </Button>
      {pages.map((p, i) =>
        p === "ellipsis" ? (
          <span key={`e-${i}`} className="app-muted px-2">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`flex h-10 w-10 items-center justify-center rounded-md text-sm font-bold transition-colors ${
              p === page
                ? "bg-emerald text-white"
                : "app-muted hover:bg-[var(--ui-surface)]"
            }`}
          >
            {p}
          </button>
        )
      )}
      <Button
        variant="secondary"
        compact
        transparent
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        accessibilityLabel="Next page"
      >
        ›
      </Button>
    </div>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function IconVerified({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}
