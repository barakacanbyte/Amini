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
import { CampaignsSectionDivider } from "./CampaignsHero";
import { formatUsdc } from "@/lib/contracts";

export type CampaignRow = {
  id: number;
  owner: string;
  beneficiary: string;
  target_amount: string;
  milestone_count: number;
  metadata_uri: string | null;
  created_at: string;
  title?: string | null;
  description?: string | null;
  image_url?: string | null;
  region?: string | null;
  cause?: string | null;
  tags?: string[] | null;
  deadline?: string | null;
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
  const t = c.title?.trim();
  if (t && t.length > 0) return t;
  const m = c.metadata_uri?.trim();
  if (m && m.length > 0 && !m.startsWith("ipfs://amini-")) {
    const short = m.replace(/^ipfs:\/\//, "").slice(0, 48);
    return short.length > 40 ? `${short}…` : short;
  }
  return `Campaign ${c.id}`;
}

function campaignDescription(c: CampaignExplorerRow): string {
  const d = c.description?.trim();
  if (d && d.length > 0) return d;
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

function coverImageSrc(c: CampaignExplorerRow): string {
  const u = c.image_url?.trim();
  if (u && u.length > 0) return u;
  return `https://picsum.photos/seed/amini-campaign-${c.id}/640/256`;
}

function campaignDateLine(c: CampaignExplorerRow): string {
  const raw = c.deadline?.trim();
  if (raw) {
    const dt = new Date(raw);
    if (!Number.isNaN(dt.getTime())) {
      return `Campaign ends: ${dt.toLocaleDateString(undefined, { dateStyle: "medium" })}`;
    }
  }
  return `Listed: ${new Date(c.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}`;
}

function campaignInitial(c: CampaignExplorerRow): string {
  const t = campaignTitle(c).trim();
  const ch = t.charAt(0);
  return ch && /[\w\d]/i.test(ch) ? ch.toUpperCase() : "#";
}

function FilterPill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold uppercase tracking-wide transition-all sm:px-4 ${
        active
          ? "bg-[var(--ui-brand-green)] text-white shadow-[0_4px_14px_-4px_rgba(16,185,129,0.55)]"
          : "border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] text-[var(--ui-text)] hover:border-emerald-500/40"
      }`}
    >
      {children}
    </button>
  );
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
      const blob = [
        String(c.id),
        c.owner,
        c.beneficiary,
        c.metadata_uri ?? "",
        c.title ?? "",
        c.description ?? "",
        c.region ?? "",
        c.cause ?? "",
        ...(c.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      if (q && !blob.includes(q)) return false;

      const meta = (c.metadata_uri ?? "").toLowerCase();
      const title = campaignTitle(c).toLowerCase();
      const hay = `${meta} ${title} ${String(c.id)} ${c.region ?? ""} ${c.cause ?? ""} ${(c.tags ?? []).join(" ")}`.toLowerCase();
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
      {/* Toolbar: search + urgency pills (Superfluid-style tabs) */}
      <div className="mt-2 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="relative w-full max-w-md flex-1">
          <span className="app-muted pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2">
            <IconSearch className="h-5 w-5" />
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by ID, wallet, title…"
            className="input-field w-full rounded-full border-[var(--ui-border)] bg-[var(--ui-surface-elev)] py-3 pl-11 pr-4 shadow-sm"
            aria-label="Search campaigns"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <span className="hidden text-[10px] font-bold uppercase tracking-widest text-[var(--ui-muted)] lg:inline lg:mr-1">
            Urgency
          </span>
          {URGENCY_FILTERS.map((u) => (
            <FilterPill
              key={u.value}
              active={urgency === u.value}
              onClick={() => {
                setUrgency(u.value);
                setPage(1);
              }}
            >
              {u.label}
            </FilterPill>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-[var(--ui-border)] pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <TextLabel2 as="span" className="app-muted w-full py-1 text-[10px] uppercase tracking-widest sm:w-auto sm:pr-2">
            Region
          </TextLabel2>
          {REGION_FILTERS.map((r) => (
            <FilterPill
              key={r.value}
              active={region === r.value}
              onClick={() => {
                setRegion(r.value);
                setPage(1);
              }}
            >
              {r.label}
            </FilterPill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TextLabel2 as="span" className="app-muted w-full py-1 text-[10px] uppercase tracking-widest sm:w-auto sm:pr-2">
            Cause
          </TextLabel2>
          {CAUSE_FILTERS.map((cf) => (
            <FilterPill
              key={cf.value}
              active={cause === cf.value}
              onClick={() => {
                setCause(cf.value);
                setPage(1);
              }}
            >
              {cf.label}
            </FilterPill>
          ))}
        </div>
      </div>

      <CampaignsSectionDivider />

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] px-6 py-12 text-center shadow-sm">
          <TextBody as="p" className="app-muted">
            No campaigns match your filters. Try clearing search or choosing &quot;All&quot;.
          </TextBody>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-7 xl:grid-cols-3 xl:gap-8">
            {slice.map((c) => {
              const pct = progressPercent(c);
              const raised = safeBigInt(c.total_raised);
              const target = safeBigInt(c.target_amount);
              const verified = c.attested_releases > 0;
              const goalLabel = `${formatCompactUsdc(target)} USDC`;
              const raisedLabel =
                raised > BigInt(0) ? `${formatCompactUsdc(raised)} USDC` : "—";
              const cover = coverImageSrc(c);
              const coverUnoptimized = Boolean(c.image_url?.trim());
              const initial = campaignInitial(c);

              return (
                <article
                  key={c.id}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] shadow-[var(--ui-shadow-md)] transition-shadow hover:shadow-[var(--ui-shadow-lg)]"
                >
                  <div className="relative h-44 shrink-0 overflow-hidden bg-[var(--ui-surface)] sm:h-48">
                    <Image
                      src={cover}
                      alt=""
                      fill
                      unoptimized={coverUnoptimized}
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    />
                    <div className="absolute left-3 top-3">
                      <Tag colorScheme="green" emphasis="high">
                        {verified ? "Attested" : "Live"}
                      </Tag>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col p-5 sm:p-6">
                    <div className="flex gap-3">
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-black text-emerald-950 shadow-inner dark:text-emerald-100"
                        style={{
                          background:
                            "linear-gradient(145deg, #fef08a 0%, #bef264 45%, #86efac 100%)",
                        }}
                        aria-hidden
                      >
                        {initial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <TextTitle3 as="h3" className="app-text text-lg font-black leading-snug tracking-tight">
                          {campaignTitle(c)}
                        </TextTitle3>
                        <p className="mt-1 text-xs font-semibold text-violet-600 dark:text-violet-400 sm:text-sm">
                          {campaignDateLine(c)}
                        </p>
                      </div>
                    </div>

                    <TextBody as="p" className="app-muted mt-4 line-clamp-3 text-sm leading-relaxed">
                      {campaignDescription(c)}
                    </TextBody>

                    <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[var(--ui-border)] pt-4">
                      <div>
                        <TextCaption as="span" className="app-muted block text-[10px] font-bold uppercase tracking-wider">
                          Funding goal
                        </TextCaption>
                        <p className="mt-1 font-mono text-base font-black tabular-nums text-[var(--ui-text)] sm:text-lg">
                          {goalLabel}
                        </p>
                      </div>
                      <div>
                        <TextCaption as="span" className="app-muted block text-[10px] font-bold uppercase tracking-wider">
                          Raised
                        </TextCaption>
                        <p className="mt-1 font-mono text-base font-black tabular-nums text-[var(--ui-brand-green)] sm:text-lg">
                          {raisedLabel}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <IconVerified className="brand-green h-3.5 w-3.5 shrink-0" />
                      <TextCaption as="span" className="app-text text-[9px] font-bold uppercase tracking-widest sm:text-[10px]">
                        {verified ? "EAS attested release" : `${c.milestone_count} milestones`}
                      </TextCaption>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide">
                        <TextCaption as="span" className="app-muted">
                          Progress
                        </TextCaption>
                        <TextCaption as="span" className="app-text">
                          {pct}% funded
                        </TextCaption>
                      </div>
                      <ProgressBar
                        progress={pct / 100}
                        accessibilityLabel={`${pct}% funded`}
                      />
                    </div>

                    <div className="mt-auto pt-5">
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="btn-green btn-base block w-full rounded-full text-center text-sm font-bold"
                      >
                        View campaign
                      </Link>
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
            className={`flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-sm font-bold transition-colors ${
              p === page
                ? "bg-[var(--ui-brand-green)] text-white shadow-md shadow-emerald-500/25"
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
