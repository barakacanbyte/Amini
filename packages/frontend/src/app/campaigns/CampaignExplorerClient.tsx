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

const REGION_OPTIONS = [
  { value: "all", label: "All Regions" },
  { value: "north-america", label: "North America" },
  { value: "latin-america", label: "Latin America & Caribbean" },
  { value: "western-europe", label: "Western Europe" },
  { value: "eastern-europe", label: "Eastern Europe & Central Asia" },
  { value: "middle-east", label: "Middle East & North Africa" },
  { value: "sub-saharan-africa", label: "Sub-Saharan Africa" },
  { value: "south-asia", label: "South Asia" },
  { value: "east-asia", label: "East Asia & Pacific" },
  { value: "southeast-asia", label: "Southeast Asia" },
  { value: "oceania", label: "Australia & Oceania" },
];

const CAUSE_OPTIONS = [
  { value: "all", label: "All Causes" },
  { value: "climate", label: "Climate Action" },
  { value: "reforestation", label: "Reforestation" },
  { value: "clean-water", label: "Clean Water & Sanitation" },
  { value: "education", label: "Education" },
  { value: "digital-literacy", label: "Digital Literacy" },
  { value: "healthcare", label: "Healthcare & Medicine" },
  { value: "food-security", label: "Food Security & Agriculture" },
  { value: "renewable-energy", label: "Renewable Energy" },
  { value: "wildlife", label: "Wildlife Conservation" },
  { value: "poverty", label: "Poverty Alleviation" },
  { value: "disaster-relief", label: "Disaster Relief" },
  { value: "human-rights", label: "Human Rights" },
  { value: "gender-equality", label: "Gender Equality" },
  { value: "economic-growth", label: "Economic Growth" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "community", label: "Community Development" },
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

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <TextLabel2 as="label" className="text-[10px] font-bold uppercase tracking-widest text-[var(--ui-muted)]">
        {label}
      </TextLabel2>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] px-4 py-2.5 pr-10 text-sm font-medium text-[var(--ui-text)] shadow-sm transition-all hover:border-emerald-500/50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer min-w-[180px]"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ui-muted)]">
          <IconChevronDown className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
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

      // Region filter - match campaign region field or metadata
      if (region !== "all") {
        const campaignRegion = (c.region ?? "").toLowerCase().replace(/[_\s-]/g, "");
        const targetRegion = region.toLowerCase().replace(/[_\s-]/g, "");
        if (!campaignRegion.includes(targetRegion) && !targetRegion.includes(campaignRegion)) {
          // Fallback: check if region keywords appear in description/title
          const hay = `${c.title ?? ""} ${c.description ?? ""}`.toLowerCase();
          const regionKeywords: Record<string, string[]> = {
            "north-america": ["north america", "usa", "canada", "mexico", "us", "united states"],
            "latin-america": ["latin america", "caribbean", "brazil", "argentina", "colombia", "peru", "chile"],
            "western-europe": ["western europe", "germany", "france", "uk", "italy", "spain", "netherlands"],
            "eastern-europe": ["eastern europe", "central asia", "poland", "ukraine", "romania", "kazakhstan"],
            "middle-east": ["middle east", "mena", "morocco", "egypt", "israel", "uae", "saudi", "iran", "iraq"],
            "sub-saharan-africa": ["africa", "kenya", "nigeria", "ethiopia", "ghana", "tanzania", "uganda"],
            "south-asia": ["south asia", "india", "pakistan", "bangladesh", "nepal", "sri lanka"],
            "east-asia": ["east asia", "pacific", "china", "japan", "korea", "mongolia"],
            "southeast-asia": ["southeast asia", "indonesia", "vietnam", "thailand", "philippines", "myanmar"],
            "oceania": ["oceania", "australia", "new zealand", "papua", "fiji"],
          };
          const keywords = regionKeywords[region] || [];
          if (!keywords.some(k => hay.includes(k))) return false;
        }
      }

      // Cause filter - match campaign cause field or metadata
      if (cause !== "all") {
        const campaignCause = (c.cause ?? "").toLowerCase().replace(/[_\s-]/g, "");
        const targetCause = cause.toLowerCase().replace(/[_\s-]/g, "");
        if (!campaignCause.includes(targetCause) && !targetCause.includes(campaignCause)) {
          // Fallback: check if cause keywords appear in description/title/tags
          const hay = `${c.title ?? ""} ${c.description ?? ""} ${(c.tags ?? []).join(" ")}`.toLowerCase();
          const causeKeywords: Record<string, string[]> = {
            "climate": ["climate", "carbon", "emission", "global warming"],
            "reforestation": ["reforestation", "afforestation", "forest", "tree", "planting", "woodland"],
            "clean-water": ["clean water", "sanitation", "well", "aquifer", "drinking water", "hygiene"],
            "education": ["education", "school", "learning", "scholarship", "teaching"],
            "digital-literacy": ["digital literacy", "computer", "internet", "technology", "coding", "tech"],
            "healthcare": ["healthcare", "medicine", "medical", "hospital", "clinic", "doctor", "health"],
            "food-security": ["food security", "agriculture", "farming", "hunger", "nutrition", "crop"],
            "renewable-energy": ["renewable energy", "solar", "wind", "hydro", "clean energy", "green energy"],
            "wildlife": ["wildlife", "conservation", "animal", "biodiversity", "species", "habitat"],
            "poverty": ["poverty", "poor", "low income", "economic hardship", "financial assistance"],
            "disaster-relief": ["disaster", "relief", "emergency", "humanitarian", "crisis", "aid"],
            "human-rights": ["human rights", "civil rights", "justice", "advocacy", "freedom"],
            "gender-equality": ["gender equality", "women empowerment", "female", "girl", "lgbtq", "equality"],
            "economic-growth": ["economic growth", "business", "entrepreneurship", "job", "employment", "trade"],
            "infrastructure": ["infrastructure", "road", "bridge", "building", "construction", "facility"],
            "community": ["community", "local", "neighborhood", "social cohesion", "grassroots"],
          };
          const keywords = causeKeywords[cause] || [];
          if (!keywords.some(k => hay.includes(k))) return false;
        }
      }

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

      {/* Professional Filter Bar with Dropdowns */}
      <div className="mt-5 flex flex-col gap-4 border-t border-[var(--ui-border)] pt-5 sm:flex-row sm:items-end sm:gap-6">
        <FilterSelect
          label="Region"
          value={region}
          options={REGION_OPTIONS}
          onChange={(val) => {
            setRegion(val);
            setPage(1);
          }}
        />
        <FilterSelect
          label="Cause"
          value={cause}
          options={CAUSE_OPTIONS}
          onChange={(val) => {
            setCause(val);
            setPage(1);
          }}
        />
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

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
