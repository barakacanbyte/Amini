"use client";

/** Horizontal rule with centered label (matches Superfluid-style section breaks). */
export function CampaignsSectionDivider({ label = "Campaigns" }: { label?: string }) {
  return (
    <div className="relative my-10 md:my-12">
      <div
        className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
        style={{ background: "color-mix(in oklab, var(--ui-brand-green) 45%, var(--ui-border))" }}
      />
      <div className="relative flex justify-center">
        <span className="bg-[var(--ui-bg)] px-5 text-xs font-black uppercase tracking-[0.22em] text-[var(--ui-brand-green)] sm:text-sm">
          {label}
        </span>
      </div>
    </div>
  );
}

/**
 * Hero banner for the campaigns explorer (Superfluid-inspired layout: gradient panel + label + headline).
 */
export function CampaignsHero() {
  return (
    <section
      className="relative mb-8 overflow-hidden rounded-[2rem] border border-[var(--ui-border)] px-6 py-12 shadow-[var(--ui-shadow-md)] sm:px-10 sm:py-14 md:px-14 md:py-16"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in oklab, var(--ui-brand-green) 12%, var(--ui-surface-elev)) 0%, var(--ui-surface-elev) 45%, color-mix(in oklab, #84cc16 18%, var(--ui-surface-elev)) 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
        style={{ background: "color-mix(in oklab, var(--ui-brand-green) 55%, transparent)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-16 -left-12 h-56 w-56 rounded-full opacity-30 blur-3xl"
        style={{ background: "color-mix(in oklab, #a3e635 50%, transparent)" }}
      />
      <div
        className="pointer-events-none absolute bottom-8 right-[18%] hidden h-24 w-24 rotate-12 rounded-2xl border-2 border-[var(--ui-brand-green)]/25 bg-[var(--ui-surface-elev)]/80 shadow-lg md:block"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-[10%] top-1/4 hidden h-16 w-20 -rotate-6 rounded-full border-2 border-emerald-400/30 bg-gradient-to-br from-emerald-200/50 to-lime-200/40 dark:from-emerald-800/40 dark:to-lime-900/30 md:block"
        aria-hidden
      />

      <div className="relative max-w-2xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--ui-brand-green-strong)] sm:text-xs">
          On-chain campaigns
        </p>
        <h1 className="mt-3 text-4xl font-black leading-[1.05] tracking-tight text-emerald-950 dark:text-emerald-50 md:text-5xl lg:text-[3.25rem]">
          Fund and follow
        </h1>
        <p className="mt-5 max-w-xl text-[11px] font-semibold uppercase leading-relaxed tracking-wider text-[var(--ui-muted)] sm:text-xs sm:leading-relaxed">
          Discover transparent, milestone-based USDC campaigns on Base — explore, filter, fund, and
          trace every release with on-ledger proof.
        </p>
      </div>
    </section>
  );
}
