"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { HStack } from "@coinbase/cds-web/layout";
import { TextTitle1 } from "@coinbase/cds-web/typography/TextTitle1";
import { TextTitle2 } from "@coinbase/cds-web/typography/TextTitle2";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { TextCaption } from "@coinbase/cds-web/typography/TextCaption";
import { TextLabel2 } from "@coinbase/cds-web/typography/TextLabel2";

const activityItems = [
  {
    title: "USDC for Community Water Point",
    status: "EAS ATTESTED: Approved by NGO Auditor",
    meta: "View transactions",
  },
  {
    title: "Supplies for School Meals",
    status: "IPFS RECEIPT: Permanent evidence uploaded",
    meta: "View transactions",
  },
];

export default function HomePage() {
  return (
    <main className="app-page px-4 py-8 md:px-8">
      <div className="app-surface mx-auto max-w-6xl overflow-hidden rounded-[28px]">
        <section
          id="overview"
          className="scroll-mt-24 px-6 pb-8 pt-10 md:px-10 md:pb-10 md:pt-12"
        >
          <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
            <TextLabel2
              as="p"
              className="brand-brown block w-full uppercase tracking-[0.18em]"
            >
              Amini Impact Layer
            </TextLabel2>
            <TextTitle1
              as="h1"
              className="app-text mt-4 block w-full text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl"
            >
              See Your Impact, <span className="brand-green">Second by Second.</span>
              <br />
              Believe and <span className="brand-brown">Fund Change</span>
            </TextTitle1>
          </div>

          <div className="app-surface-elev relative mt-8 aspect-[16/10] w-full overflow-hidden rounded-2xl shadow-inner md:aspect-[21/9]">
            <Image
              src="/hero-image.png"
              alt="Impact flow: donors, campaigns, and recipients"
              fill
              className="object-cover object-center"
              priority
              sizes="(max-width: 1152px) 100vw, 1152px"
            />
          </div>

          <div
            className="mt-8 rounded-xl border px-5 py-4"
            style={{
              borderColor: "color-mix(in oklab, var(--ui-brand-brown) 40%, var(--ui-border))",
              background:
                "linear-gradient(90deg, color-mix(in oklab, var(--ui-brand-brown-soft) 88%, transparent), color-mix(in oklab, var(--ui-brand-green) 24%, var(--ui-surface)))",
            }}
          >
            <TextTitle2 as="p" className="app-text text-2xl font-bold leading-tight md:text-4xl">
              Track Your Funding
            </TextTitle2>
            <TextBody as="p" className="app-muted mt-1">
              Real-Time Onchain Transparency
            </TextBody>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <ul className="app-text space-y-2 text-sm">
                <li>• Real-time onchain campaign activity</li>
                <li>• EAS-verified milestone attestations</li>
                <li>• IPFS-backed permanent receipts (Filebase)</li>
                <li>• Transparent tranche release history</li>
              </ul>

              <HStack gap={3} className="mt-6" flexWrap="wrap">
                <Button as={Link} href="/campaigns" variant="secondary" compact>
                  Explore Campaigns
                </Button>
                <Button as={Link} href="/campaigns/create" variant="primary" compact>
                  Create Campaign
                </Button>
                <Button as={Link} href="/explorer" variant="secondary" compact>
                  Open Explorer
                </Button>
              </HStack>
            </div>

            <div className="space-y-3">
              {activityItems.map((item) => (
                <article key={item.title} className="app-surface-elev p-3 shadow-sm">
                  <div className="grid grid-cols-[88px_1fr] gap-3">
                    <div
                      className="h-20 rounded-sm border"
                      style={{
                        borderColor: "var(--ui-border)",
                        background:
                          "linear-gradient(135deg, color-mix(in oklab, var(--ui-brand-brown-soft) 80%, transparent), color-mix(in oklab, var(--ui-brand-green) 32%, transparent))",
                      }}
                    />
                    <div>
                      <TextBody as="h3" className="app-text font-semibold">
                        {item.title}
                      </TextBody>
                      <TextCaption as="p" className="app-muted mt-1">
                        {item.status}
                      </TextCaption>
                      <button
                        type="button"
                        className="brand-brown mt-2 text-sm underline decoration-[var(--ui-brand-amber)] underline-offset-2"
                      >
                        {item.meta}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <footer className="app-surface-elev border-x-0 border-b-0 px-6 py-4 text-center">
          <TextCaption as="p">
            Powered by EAS, XMTP, IPFS (Filebase), and World ID
          </TextCaption>
          <TextCaption as="p" className="mt-2">
            <Link
              href="/admin"
              className="app-muted underline-offset-2 hover:text-[var(--ui-text)] hover:underline"
            >
              Team tools
            </Link>
          </TextCaption>
        </footer>
      </div>
    </main>
  );
}
