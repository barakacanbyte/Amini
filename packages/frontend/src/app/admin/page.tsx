"use client";

import Link from "next/link";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { TextTitle2 } from "@coinbase/cds-web/typography/TextTitle2";
import { TextTitle4 } from "@coinbase/cds-web/typography/TextTitle4";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";

const tools = [
  {
    title: "Identity setup",
    description:
      "Check that sign-in with World ID is configured for campaign owners and recipients.",
    href: "/debug/world-id",
    cta: "Open checks",
  },
  {
    title: "Activity & search",
    description: "Look up campaigns, wallets, or transactions in indexed activity.",
    href: "/explorer",
    cta: "Open activity",
  },
  {
    title: "All campaigns",
    description: "Browse campaigns synced from the network.",
    href: "/campaigns",
    cta: "View campaigns",
  },
  {
    title: "Identity API health",
    description: "Raw JSON from the server health endpoint (for support tickets).",
    href: "/api/world-id/health",
    cta: "GET /api/world-id/health",
    external: true,
  },
];

export default function AdminHomePage() {
  return (
    <div className="app-surface mx-auto max-w-4xl rounded-2xl p-6 md:p-8">
      <TextTitle2 as="h1" className="app-text">
        Team dashboard
      </TextTitle2>
      <TextBody as="p" className="app-muted mt-2 max-w-2xl">
        Shortcuts for debugging and operations. Add authentication before exposing this URL in
        production.
      </TextBody>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {tools.map((item) => (
          <li key={item.title}>
            <div className="app-surface-elev flex h-full flex-col rounded-xl p-5">
              <TextTitle4 as="h2" className="app-text">
                {item.title}
              </TextTitle4>
              <TextBody as="p" className="app-muted mt-2 flex-1">
                {item.description}
              </TextBody>
              {item.external ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4"
                >
                  <Button variant="secondary" compact transparent>
                    {item.cta} ↗
                  </Button>
                </a>
              ) : (
                <Button
                  as={Link}
                  href={item.href}
                  variant="secondary"
                  compact
                  transparent
                  className="mt-4 w-fit"
                >
                  {item.cta} →
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="callout-amber mt-10 text-sm">
        <TextBody as="p" className="font-medium" style={{ color: "var(--ui-brand-amber)" }}>
          Environment checklist
        </TextBody>
        <TextBody as="p" className="app-muted mt-1">
          Contracts, Supabase, Arweave wallet JSON, and World ID keys live in your env files (see{" "}
          <code className="rounded bg-black/20 px-1 py-0.5 text-xs">.env.example</code>
          ). The indexer must be running for activity search to stay current.
        </TextBody>
      </div>
    </div>
  );
}
