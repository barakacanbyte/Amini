"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { TextTitle1 } from "@coinbase/cds-web/typography/TextTitle1";
import { TextTitle2 } from "@coinbase/cds-web/typography/TextTitle2";
import { TextTitle3 } from "@coinbase/cds-web/typography/TextTitle3";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { TextCaption } from "@coinbase/cds-web/typography/TextCaption";
import { TextLabel2 } from "@coinbase/cds-web/typography/TextLabel2";
import { RequireAuthButtonLink } from "@/components/RequireAuthButtonLink";

const stats = [
  { value: "200K USD", label: "Funds raised" },
  { value: "30+", label: "Projects accomplished" },
  { value: "10+", label: "Communities served" },
];

const advantages = [
  {
    title: "Trust by design",
    body: "Escrow-held funds and on-chain EAS attestations make trust a system feature, not a donor assumption.",
  },
  {
    title: "Proof before payout",
    body: "Organizations submit verified proof of work before each milestone unlocks, no results, no funds.",
  },
  {
    title: "Radical transparency",
    body: "Every fund movement is public and immutable. Donors choose their own visibility, fully anonymous or fully traceable.",
  },
  {
    title: "Accountable by default",
    body: "Organizations cannot alter received records. Milestone gates create an unbreakable chain of accountability.",
  },
];

const features = [
  {
    title: "Stablecoin Transfers",
    body: "Amini uses USDC on Base for low fees and instant settlement. This ensures that there is no volatility on the value of the funds provided.",
    image: "/usdc.png",
    alt: "USDC logo",
  },
  {
    title: "Smart Contract Escrow",
    body: "Amini implements a smart contract system where Milestones are not auto-verified, but require a signed contract by a human or attested release via EAS multisig.",
    image: "/escrow.png",
    alt: "Escrow illustration",
    reverse: true,
  },
  {
    title: "Public Transparency Explorer",
    body: "Campaigns, wallets, transactions are fully transparent on Amini and can be viewed and monitored by the donors.",
    image: "/transparency.png",
    alt: "Transparency illustration",
  },
  {
    title: "Reputation System",
    body: "Amini uses a reputation system where reputation scores are derived from EAS attestations + Worldcoin. This helps reduce Sybil attacks.",
    image: "/reputation.png",
    alt: "Reputation illustration",
    reverse: true,
  },
];

export type HomeCampaignCard = {
  id: number;
  title: string;
  summary: string;
  tag: string;
  progress: number;
  raised: string;
  image: string;
};

const poweredBy = ["EAS", "BASE", "XMTP", "IPFS (FILEBASE)", "WORLD ID"];

/** CDS `primary` maps to theme tokens that are not always brand green in dark mode */
/** `!rounded-full`: CDS borderRadius 900 = 56px (pill at default 56px height); Tailwind base can otherwise flatten `button.cds-Button` corners */
const startCampaignButtonClass =
  "!rounded-full !px-6 !min-w-[10.5rem] !border-transparent !bg-[var(--ui-brand-green)] !text-white hover:!brightness-[1.05] active:!brightness-[0.95] shadow-[0_4px_14px_-4px_rgba(16,185,129,0.45)]";

export default function HomePageContent({ campaigns }: { campaigns: HomeCampaignCard[] }) {
  return (
    <main className="app-page">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <section id="overview" className="scroll-mt-24 pt-14 pb-16 sm:pt-20 sm:pb-20 lg:pt-24 lg:pb-28">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 text-center sm:gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.08fr)] lg:items-center lg:gap-8 lg:text-left xl:gap-12">
            <div className="mx-auto flex min-w-0 flex-col items-center text-center lg:mx-0 lg:max-w-xl lg:items-start lg:pr-2 lg:text-left xl:pr-4">
              <TextLabel2
                as="p"
                className="brand-brown block w-full text-center uppercase tracking-[0.18em] lg:text-left"
              >
                Amini Impact Layer
              </TextLabel2>
              <TextTitle1
                as="h1"
                className="app-text mt-3 block w-full text-balance text-center text-3xl font-bold leading-[1.08] tracking-tight sm:mt-4 sm:text-4xl md:text-[2.125rem] md:leading-[1.08] lg:text-left lg:text-4xl xl:text-[2.625rem] xl:leading-[1.06] 2xl:text-5xl 2xl:leading-[1.05]"
              >
                See Your Impact, <br />
                <span className="brand-green">Second by Second</span>
              </TextTitle1>
              <TextBody
                as="p"
                className="app-muted mt-4 max-w-xl text-pretty text-center text-sm leading-relaxed sm:mt-5 sm:text-base lg:mt-4 lg:text-left lg:text-base xl:text-lg"
              >
                Amini is a transparent fund disbursement protocol. Every contribution streamed on-chain, every milestone attested on EAS.
              </TextBody>
              <div className="mt-6 hidden flex-wrap items-center justify-center gap-3 sm:mt-7 lg:mt-8 lg:flex lg:justify-start">
                <RequireAuthButtonLink
                  href="/campaigns/create"
                  variant="primary"
                  className={startCampaignButtonClass}
                >
                  Start Campaign
                </RequireAuthButtonLink>
                <Button
                  as={Link}
                  href="/campaigns"
                  variant="secondary"
                  className="!px-6 !min-w-[10.5rem]"
                >
                  Explore Campaigns
                </Button>
              </div>
            </div>

            {/* Hero Image — slightly wider column + stable aspect so visual weight matches copy */}
            <div className="relative aspect-[16/9] min-h-0 w-full max-w-3xl justify-self-center sm:rounded-3xl lg:max-w-none lg:justify-self-end">
              {/* Outer glow (not clipped) */}
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-6 rounded-[2rem] blur-2xl"
                style={{
                  background:
                    "radial-gradient(60% 55% at 55% 45%, color-mix(in oklab, var(--ui-brand-brown) 45%, transparent) 0%, transparent 70%)",
                  opacity: 0.45,
                }}
              />

              {/* Image frame (clipped) */}
              <div
                className="absolute inset-0 overflow-hidden rounded-2xl sm:rounded-3xl"
                style={{
                  boxShadow:
                    "0 0 0 1px color-mix(in oklab, var(--ui-brand-brown) 32%, transparent), 0 0 42px -10px color-mix(in oklab, var(--ui-brand-brown) 52%, transparent), 0 22px 56px -18px rgba(0, 0, 0, 0.32)",
                }}
              >
                <Image
                  src="/hero-image-v2.png"
                  alt="Transparent fund flow from donors through milestones to communities"
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 1023px) 100vw, 52vw"
                />
              </div>
            </div>

            {/* Mobile CTAs (below image) */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3 lg:hidden">
              <RequireAuthButtonLink
                href="/campaigns/create"
                variant="primary"
                className={startCampaignButtonClass}
              >
                Start Campaign
              </RequireAuthButtonLink>
              <Button
                as={Link}
                href="/campaigns"
                variant="secondary"
                className="!px-6 !min-w-[10.5rem]"
              >
                Explore Campaigns
              </Button>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="grid gap-6 border-y border-[var(--ui-border)] py-12 sm:grid-cols-3 sm:py-16">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center text-center">
              <TextTitle1
                as="p"
                className="app-text text-4xl font-bold sm:text-5xl md:text-6xl"
              >
                {stat.value}
              </TextTitle1>
              <TextBody as="p" className="app-muted mt-2">
                {stat.label}
              </TextBody>
            </div>
          ))}
        </section>

        {/* Competitive advantages */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-4xl text-center">
            <TextTitle2
              as="h2"
              className="app-text text-2xl font-bold leading-tight sm:text-3xl md:text-4xl"
            >
              Amini turns charitable giving from blind faith into verified impact
            </TextTitle2>
          </div>
          <div className="mt-10 grid gap-5 sm:mt-14 sm:grid-cols-2">
            {advantages.map((item) => (
              <article
                key={item.title}
                className="group relative overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--ui-border)_65%,transparent)] bg-[color-mix(in_oklab,var(--ui-surface-elev)_72%,transparent)] p-6 shadow-sm backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--ui-brand-brown)_30%,var(--ui-border))] hover:shadow-md sm:p-8"
              >
                {/* Glass highlights */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(70% 60% at 15% 0%, color-mix(in oklab, var(--ui-brand-brown) 14%, transparent) 0%, transparent 65%), radial-gradient(55% 55% at 95% 10%, color-mix(in oklab, var(--ui-brand-green) 10%, transparent) 0%, transparent 70%)",
                  }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-20 left-1/3 h-48 w-48 -translate-x-1/2 rounded-full bg-white/35 blur-3xl dark:bg-white/10"
                />
                <TextTitle3 as="h3" className="app-text relative block text-lg font-bold sm:text-xl">
                  {item.title}
                </TextTitle3>
                <TextBody as="p" className="app-muted relative mt-3 block leading-relaxed">
                  {item.body}
                </TextBody>
              </article>
            ))}
          </div>
        </section>

        {/* Features with images */}
        <section id="about" className="py-16 sm:py-24">
          <div className="mx-auto max-w-4xl text-center">
            <TextTitle2
              as="h2"
              className="app-text text-2xl font-bold leading-tight sm:text-3xl md:text-4xl"
            >
              Amini comes with a suite of features designed to enhance transparency and accountability in fund disbursement.
            </TextTitle2>
          </div>
          <div className="mt-12 space-y-12 sm:mt-16 sm:space-y-16">
            {features.map((feature) => (
              <div
                key={feature.title}
                className={`flex flex-col items-center gap-8 md:gap-12 ${
                  feature.reverse ? "md:flex-row-reverse" : "md:flex-row"
                }`}
              >
                <div className="flex-1">
                  <TextTitle2
                    as="h3"
                    className="app-text text-2xl font-bold sm:text-3xl md:text-4xl"
                  >
                    {feature.title}
                  </TextTitle2>
                  <TextBody as="p" className="app-muted mt-4 text-base leading-relaxed sm:text-lg">
                    {feature.body}
                  </TextBody>
                </div>
                <div className="flex flex-1 items-center justify-center">
                  <div className="relative aspect-square w-full max-w-xs">
                    <Image
                      src={feature.image}
                      alt={feature.alt}
                      fill
                      className="object-contain"
                      sizes="(max-width: 768px) 80vw, 320px"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Campaigns */}
        <section id="campaigns" className="scroll-mt-24 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <TextTitle2
              as="h2"
              className="app-text text-2xl font-bold leading-tight sm:text-3xl md:text-4xl"
            >
              Track your Fundings
            </TextTitle2>
          </div>

          {campaigns.length === 0 ? (
            <div className="mt-10 rounded-3xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-elev)] px-6 py-14 text-center">
              <TextBody as="p" className="app-muted">
                No campaigns yet. Be the first to publish one.
              </TextBody>
              <div className="mt-5 flex justify-center">
                <RequireAuthButtonLink
                  href="/campaigns/create"
                  variant="primary"
                  className={startCampaignButtonClass}
                >
                  Start Campaign
                </RequireAuthButtonLink>
              </div>
            </div>
          ) : (
            <div className="mt-10 grid gap-6 sm:mt-12 lg:grid-cols-2">
              {campaigns.map((c) => (
                <Link
                  key={c.id}
                  href={`/campaigns/${c.id}`}
                  className="app-surface-elev flex flex-col overflow-hidden rounded-3xl border border-[var(--ui-border)] shadow-sm transition-shadow hover:shadow-lg"
                >
                  <div className="relative h-56 w-full overflow-hidden sm:h-64">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.image}
                      alt={c.title}
                      className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                    />
                    {c.tag ? (
                      <span className="absolute left-4 top-4 rounded-full bg-[color-mix(in_oklab,var(--ui-brand-green)_85%,transparent)] px-3 py-1 text-xs font-bold uppercase tracking-widest text-white">
                        {c.tag}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col justify-between gap-5 p-6 sm:p-8">
                    <div>
                      <TextTitle3 as="h3" className="app-text text-xl font-bold sm:text-2xl">
                        {c.title}
                      </TextTitle3>
                      <TextBody as="p" className="app-muted mt-2 leading-relaxed line-clamp-3">
                        {c.summary}
                      </TextBody>
                      <div className="mt-5">
                        <div className="mb-2 flex items-baseline justify-between text-sm">
                          <span className="brand-green font-bold">Funding Progress</span>
                          <span className="app-text font-semibold">{c.progress}%</span>
                        </div>
                        <div
                          className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--ui-surface)]"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={c.progress}
                        >
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[var(--ui-brand-green)] to-[color-mix(in_oklab,var(--ui-brand-green)_70%,black)]"
                            style={{ width: `${c.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-[var(--ui-border)] pt-4">
                      <div>
                        <TextCaption as="p" className="app-muted text-[0.7rem] font-bold uppercase tracking-wider">
                          Total Raised
                        </TextCaption>
                        <TextBody as="p" className="app-text mt-0.5 font-bold">
                          {c.raised}
                        </TextBody>
                      </div>
                      <span className="brand-green text-sm font-bold uppercase tracking-wider">
                        View →
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Powered by */}
        <section className="py-16 sm:py-20">
          <div className="flex flex-col items-center text-center">
            <TextTitle2 as="h2" className="app-text text-2xl font-bold sm:text-3xl">
              Powered by
            </TextTitle2>
            <TextBody as="p" className="app-muted mt-3 max-w-2xl">
              Amini platform is built and powered by a powerful stack of technologies
            </TextBody>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              {poweredBy.map((tool) => (
                <div
                  key={tool}
                  className="app-surface-elev flex items-center justify-center rounded-2xl border border-[var(--ui-border)] px-6 py-3 text-sm font-bold shadow-sm"
                >
                  {tool}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 sm:py-24">
          <div
            className="rounded-3xl border border-[var(--ui-border)] px-6 py-14 text-center sm:px-10 sm:py-20"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in oklab, var(--ui-brand-brown-soft) 50%, transparent), color-mix(in oklab, var(--ui-brand-green) 18%, var(--ui-surface)))",
            }}
          >
            <TextTitle1
              as="h2"
              className="app-text text-3xl font-extrabold leading-tight sm:text-5xl md:text-6xl"
            >
              READY TO FUND
              <br />
              <span className="brand-green">REAL IMPACT</span>
            </TextTitle1>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <RequireAuthButtonLink
                href="/campaigns/create"
                variant="primary"
                className={startCampaignButtonClass}
              >
                Create Campaign
              </RequireAuthButtonLink>
              <Button
                as={Link}
                href="/campaigns"
                variant="secondary"
                className="!px-6 !min-w-[10.5rem]"
              >
                Explore Campaigns
              </Button>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="app-surface-elev mt-8 border-t border-[var(--ui-border)]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-8 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Amini logo" width={40} height={40} />
            <div>
              <p className="brand-green text-lg font-bold">AMINI</p>
              <TextCaption as="p" className="app-muted">
                &copy; 2026 Amini Protocol. All rights reserved.
              </TextCaption>
            </div>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <Link href="#" className="app-muted hover:text-[var(--ui-text)]">
              Terms of service
            </Link>
            <Link href="#" className="app-muted hover:text-[var(--ui-text)]">
              Privacy Policy
            </Link>
            <Link href="#" className="app-muted hover:text-[var(--ui-text)]">
              Contact Us
            </Link>
          </div>
        </div>
        <div className="border-t border-[var(--ui-border)] px-4 py-4 text-center sm:px-6 lg:px-8">
          <TextCaption as="p" className="app-muted">
            Powered by EAS, XMTP, IPFS (Filebase), and World ID
          </TextCaption>
        </div>
      </footer>
    </main>
  );
}
